/**
 * Supabase query functions — the single data access layer.
 *
 * All reads/writes to the database go through this module.
 * RLS policies handle user_id filtering on reads.
 * user_id defaults are set in Postgres, so inserts don't need to pass it.
 */

import { supabase } from "./supabase";
import { today } from "./time";
import { MATURE_INTERVAL_DAYS } from "./constants";
import type { QueueCard } from "@/srs/queue";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface DeckRow {
  id: string;
  name: string;
  parent_id: string | null;
  language: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface NoteTypeRow {
  id: string;
  name: string;
  fields: string;
  card_templates: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  note_type_id: string;
  fields: string;
  tags: string;
  source: string;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardRow {
  id: string;
  note_id: string;
  deck_id: string;
  template_index: number;
  card_type: "new" | "learning" | "review" | "relearning";
  source: string;
  suspended: number;
  created_at: string;
  updated_at: string;
}

export interface CardStateRow {
  card_id: string;
  difficulty: number;
  stability: number;
  due: string;
  interval: number;
  reps: number;
  lapses: number;
  last_review: string | null;
  updated_at: string;
}

export interface ReviewLogRow {
  id: string;
  card_id: string;
  rating: number;
  elapsed_ms: number;
  review_time: string;
  scheduled_days: number;
  actual_days: number | null;
  created_at: string;
}

export interface DeckCardCounts {
  new_count: number;
  learning_count: number;
  due_count: number;
}

export interface DeckWithCounts extends DeckRow {
  counts: DeckCardCounts;
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export async function getAllDecksWithCounts(): Promise<DeckWithCounts[]> {
  const { data, error } = await supabase.rpc("get_decks_with_counts");
  if (error) throw new Error(`Failed to load decks: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    parent_id: row.parent_id as string | null,
    language: row.language as string | null,
    source: row.source as string,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    counts: {
      new_count: Number(row.new_count),
      learning_count: Number(row.learning_count),
      due_count: Number(row.due_count),
    },
  }));
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("decks")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`Failed to rename deck: ${error.message}`);
}

export async function deleteDeck(id: string): Promise<void> {
  // Delete in dependency order: review_logs → card_states → cards → notes (orphaned) → note_types (orphaned) → deck
  // Use Supabase's cascading or manual deletes

  // Get card IDs for this deck
  const { data: cards } = await supabase
    .from("cards")
    .select("id")
    .eq("deck_id", id);
  const cardIds = (cards ?? []).map((c) => c.id);

  if (cardIds.length > 0) {
    await supabase.from("review_logs").delete().in("card_id", cardIds);
    await supabase.from("card_states").delete().in("card_id", cardIds);
    await supabase.from("cards").delete().eq("deck_id", id);
  }

  // Clean up orphaned notes and note_types
  // Notes with no remaining cards
  const { data: usedNoteIds } = await supabase
    .from("cards")
    .select("note_id");
  const usedSet = new Set((usedNoteIds ?? []).map((c) => c.note_id));

  const { data: allNotes } = await supabase.from("notes").select("id");
  const orphanedNoteIds = (allNotes ?? [])
    .filter((n) => !usedSet.has(n.id))
    .map((n) => n.id);
  if (orphanedNoteIds.length > 0) {
    await supabase.from("notes").delete().in("id", orphanedNoteIds);
  }

  // Note types with no remaining notes
  const { data: usedNtIds } = await supabase
    .from("notes")
    .select("note_type_id");
  const usedNtSet = new Set((usedNtIds ?? []).map((n) => n.note_type_id));

  const { data: allNts } = await supabase.from("note_types").select("id");
  const orphanedNtIds = (allNts ?? [])
    .filter((nt) => !usedNtSet.has(nt.id))
    .map((nt) => nt.id);
  if (orphanedNtIds.length > 0) {
    await supabase.from("note_types").delete().in("id", orphanedNtIds);
  }

  await supabase.from("decks").delete().eq("id", id);
}

export async function resetDeckProgress(id: string): Promise<void> {
  const nowIso = new Date().toISOString();

  const { data: cards } = await supabase
    .from("cards")
    .select("id")
    .eq("deck_id", id);
  const cardIds = (cards ?? []).map((c) => c.id);

  if (cardIds.length === 0) return;

  await supabase.from("review_logs").delete().in("card_id", cardIds);

  await supabase
    .from("card_states")
    .update({
      difficulty: 0,
      stability: 0,
      due: nowIso,
      interval: 0,
      reps: 0,
      lapses: 0,
      last_review: null,
      updated_at: nowIso,
    })
    .in("card_id", cardIds);

  await supabase
    .from("cards")
    .update({ card_type: "new", updated_at: nowIso })
    .eq("deck_id", id);
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export async function getReviewQueue(
  deckId: string,
  newCardsPerDay: number
): Promise<QueueCard[]> {
  const { data, error } = await supabase.rpc("get_review_queue", {
    p_deck_id: deckId,
    p_new_limit: newCardsPerDay,
  });
  if (error) throw new Error(`Failed to load queue: ${error.message}`);

  return (data ?? []).map(
    (row: Record<string, unknown>): QueueCard => ({
      cardId: row.card_id as string,
      noteId: row.note_id as string,
      deckId: row.deck_id as string,
      templateIndex: row.template_index as number,
      cardType: row.card_type as QueueCard["cardType"],
      difficulty: row.difficulty as number,
      stability: row.stability as number,
      due: row.due as string,
      interval: row.interval as number,
      reps: row.reps as number,
      lapses: row.lapses as number,
      lastReview: row.last_review as string | null,
      noteTypeId: row.note_type_id as string,
      fields: typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
    })
  );
}

// ---------------------------------------------------------------------------
// Review commit / undo
// ---------------------------------------------------------------------------

export interface ReviewCommitData {
  cardId: string;
  newCardType: string;
  newState: {
    difficulty: number;
    stability: number;
    due: string;
    interval: number;
    reps: number;
    lapses: number;
  };
  reviewLog: {
    id: string;
    card_id: string;
    rating: number;
    elapsed_ms: number;
    review_time: string;
    scheduled_days: number;
    actual_days: number | null;
    created_at: string;
  };
}

export async function commitReview(data: ReviewCommitData): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  // Run all three writes in parallel
  const [stateResult, cardResult, logResult] = await Promise.all([
    supabase
      .from("card_states")
      .update({
        difficulty: data.newState.difficulty,
        stability: data.newState.stability,
        due: data.newState.due,
        interval: data.newState.interval,
        reps: data.newState.reps,
        lapses: data.newState.lapses,
        last_review: data.reviewLog.review_time,
        updated_at: nowIso,
      })
      .eq("card_id", data.cardId),

    supabase
      .from("cards")
      .update({ card_type: data.newCardType, updated_at: nowIso })
      .eq("id", data.cardId),

    supabase.from("review_logs").insert({ ...data.reviewLog, user_id: userId }),
  ]);

  if (stateResult.error) throw new Error(stateResult.error.message);
  if (cardResult.error) throw new Error(cardResult.error.message);
  if (logResult.error) throw new Error(logResult.error.message);
}

export async function undoReview(
  cardId: string,
  previousCardType: string,
  previousState: {
    difficulty: number;
    stability: number;
    due: string;
    interval: number;
    reps: number;
    lapses: number;
    lastReview: string | null;
  },
  reviewLogId: string
): Promise<void> {
  const nowIso = new Date().toISOString();

  await Promise.all([
    supabase
      .from("card_states")
      .update({
        difficulty: previousState.difficulty,
        stability: previousState.stability,
        due: previousState.due,
        interval: previousState.interval,
        reps: previousState.reps,
        lapses: previousState.lapses,
        last_review: previousState.lastReview,
        updated_at: nowIso,
      })
      .eq("card_id", cardId),

    supabase
      .from("cards")
      .update({ card_type: previousCardType, updated_at: nowIso })
      .eq("id", cardId),

    supabase.from("review_logs").delete().eq("id", reviewLogId),
  ]);
}

// ---------------------------------------------------------------------------
// Note types
// ---------------------------------------------------------------------------

export async function getNoteType(
  id: string
): Promise<NoteTypeRow | null> {
  const { data, error } = await supabase
    .from("note_types")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getNoteTypesForDeck(
  deckId: string
): Promise<NoteTypeRow[]> {
  // Two queries: get note_type_ids from cards, then fetch note_types
  const { data: noteTypeIds } = await supabase
    .from("cards")
    .select("notes!inner(note_type_id)")
    .eq("deck_id", deckId);

  const ids = [
    ...new Set(
      (noteTypeIds ?? []).map(
        (row: Record<string, unknown>) =>
          (row.notes as { note_type_id: string }).note_type_id
      )
    ),
  ];

  if (ids.length === 0) return [];

  const { data: nts } = await supabase
    .from("note_types")
    .select("*")
    .in("id", ids);
  return (nts ?? []) as NoteTypeRow[];
}

export async function updateNoteTypeTemplates(
  id: string,
  templates: string
): Promise<void> {
  const { error } = await supabase
    .from("note_types")
    .update({
      card_templates: templates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Settings (stored as JSON blob in user_settings table)
// ---------------------------------------------------------------------------

export async function getSettings(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("settings")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return {};

  const settings = data.settings;
  return typeof settings === "string" ? JSON.parse(settings) : settings ?? {};
}

export async function setSetting(
  key: string,
  value: unknown
): Promise<void> {
  const current = await getSettings();
  current[key] = value;

  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from("user_settings").upsert({
    user_id: session?.user?.id,
    settings: current,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function setSettings(
  updates: Record<string, unknown>
): Promise<void> {
  const current = await getSettings();
  Object.assign(current, updates);

  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from("user_settings").upsert({
    user_id: session?.user?.id,
    settings: current,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface TodayStats {
  reviewed: number;
  newSeen: number;
  avgTimeMs: number;
  retention: number;
  ratingCounts: { again: number; hard: number; good: number; easy: number };
}

export interface CardCounts {
  new: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
  total: number;
}

export interface DailyReviewPoint {
  date: string;
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

export interface ForecastPoint {
  date: string;
  due: number;
}

export interface StatsData {
  today: TodayStats;
  cardCounts: CardCounts;
  last30Days: DailyReviewPoint[];
  forecast: ForecastPoint[];
  retention30d: number;
}

export async function getStats(deckId?: string | null): Promise<StatsData> {
  const todayStr = today();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0]!;

  // Fetch data in parallel
  const [todayLogs, cardData, dailyLogs, retentionData] = await Promise.all([
    fetchTodayLogs(todayStr, deckId),
    fetchCardCounts(deckId),
    fetchDailyLogs(thirtyDaysStr, deckId),
    fetchRetention30d(thirtyDaysStr, deckId),
  ]);

  // Today stats
  const reviewed = todayLogs.length;
  const avgTimeMs =
    reviewed > 0
      ? Math.round(
          todayLogs.reduce((sum, r) => sum + r.elapsed_ms, 0) / reviewed
        )
      : 0;

  const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const log of todayLogs) {
    if (log.rating === 1) ratingCounts.again++;
    else if (log.rating === 2) ratingCounts.hard++;
    else if (log.rating === 3) ratingCounts.good++;
    else if (log.rating === 4) ratingCounts.easy++;
  }

  const retention =
    reviewed > 0
      ? Math.round(
          ((ratingCounts.good + ratingCounts.easy) / reviewed) * 100
        )
      : 0;

  const newSeen = new Set(todayLogs.map((l) => l.card_id)).size;

  // 30-day forecast from card_states
  const forecast = await fetchForecast(deckId);

  return {
    today: { reviewed, newSeen, avgTimeMs, retention, ratingCounts },
    cardCounts: cardData,
    last30Days: dailyLogs,
    forecast,
    retention30d: retentionData,
  };
}

async function fetchTodayLogs(
  todayStr: string,
  deckId?: string | null
): Promise<{ rating: number; elapsed_ms: number; card_id: string }[]> {
  let query = supabase
    .from("review_logs")
    .select("rating, elapsed_ms, card_id")
    .gte("review_time", todayStr + "T00:00:00.000Z")
    .lte("review_time", todayStr + "T23:59:59.999Z");

  if (deckId) {
    // Need to filter by deck — get card IDs for the deck first
    const { data: deckCards } = await supabase
      .from("cards")
      .select("id")
      .eq("deck_id", deckId);
    const cardIds = (deckCards ?? []).map((c) => c.id);
    if (cardIds.length === 0) return [];
    query = query.in("card_id", cardIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchCardCounts(
  deckId?: string | null
): Promise<CardCounts> {
  let query = supabase
    .from("cards")
    .select("card_type, suspended, card_states(interval)");

  if (deckId) {
    query = query.eq("deck_id", deckId);
  }

  const { data: cards, error } = await query;
  if (error) throw new Error(error.message);

  const counts: CardCounts = {
    new: 0,
    learning: 0,
    young: 0,
    mature: 0,
    suspended: 0,
    total: 0,
  };

  for (const c of cards ?? []) {
    counts.total++;
    if (c.suspended) {
      counts.suspended++;
      continue;
    }
    const csRaw = c.card_states as { interval: number } | { interval: number }[] | null;
    const cs = Array.isArray(csRaw) ? csRaw[0] ?? null : csRaw;
    if (c.card_type === "new") counts.new++;
    else if (
      c.card_type === "learning" ||
      c.card_type === "relearning"
    )
      counts.learning++;
    else if (c.card_type === "review") {
      if (cs && cs.interval >= MATURE_INTERVAL_DAYS) counts.mature++;
      else counts.young++;
    }
  }

  return counts;
}

async function fetchDailyLogs(
  sinceDate: string,
  deckId?: string | null
): Promise<DailyReviewPoint[]> {
  let query = supabase
    .from("review_logs")
    .select("review_time, rating")
    .gte("review_time", sinceDate + "T00:00:00.000Z")
    .order("review_time");

  if (deckId) {
    const { data: deckCards } = await supabase
      .from("cards")
      .select("id")
      .eq("deck_id", deckId);
    const cardIds = (deckCards ?? []).map((c) => c.id);
    if (cardIds.length === 0) return [];
    query = query.in("card_id", cardIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const dailyMap = new Map<string, DailyReviewPoint>();
  for (const row of data ?? []) {
    const day = (row.review_time as string).substring(0, 10);
    if (!dailyMap.has(day)) {
      dailyMap.set(day, {
        date: day,
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
        total: 0,
      });
    }
    const point = dailyMap.get(day)!;
    if (row.rating === 1) point.again++;
    else if (row.rating === 2) point.hard++;
    else if (row.rating === 3) point.good++;
    else if (row.rating === 4) point.easy++;
    point.total++;
  }

  return Array.from(dailyMap.values());
}

async function fetchRetention30d(
  sinceDate: string,
  deckId?: string | null
): Promise<number> {
  let query = supabase
    .from("review_logs")
    .select("rating")
    .gte("review_time", sinceDate + "T00:00:00.000Z");

  if (deckId) {
    const { data: deckCards } = await supabase
      .from("cards")
      .select("id")
      .eq("deck_id", deckId);
    const cardIds = (deckCards ?? []).map((c) => c.id);
    if (cardIds.length === 0) return 0;
    query = query.in("card_id", cardIds);
  }

  const { data, error } = await query;
  if (error) return 0;

  const total = (data ?? []).length;
  if (total === 0) return 0;

  const passed = (data ?? []).filter(
    (r) => r.rating >= 3
  ).length;
  return Math.round((passed / total) * 100);
}

async function fetchForecast(
  deckId?: string | null
): Promise<ForecastPoint[]> {
  let query = supabase.from("card_states").select("due, card_id");

  if (deckId) {
    const { data: deckCards } = await supabase
      .from("cards")
      .select("id")
      .eq("deck_id", deckId);
    const cardIds = (deckCards ?? []).map((c) => c.id);
    if (cardIds.length === 0) return [];
    query = query.in("card_id", cardIds);
  }

  const { data, error } = await query;
  if (error) return [];

  const points: ForecastPoint[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0]!;
    const nextDateStr = new Date(d.getTime() + 86400000)
      .toISOString()
      .split("T")[0]!;

    const due = (data ?? []).filter((cs) => {
      const dueDate = (cs.due as string).substring(0, 10);
      return dueDate >= dateStr && dueDate < nextDateStr;
    }).length;

    points.push({ date: dateStr, due });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Notes (for import dedup and font detection)
// ---------------------------------------------------------------------------

export async function getExistingSourceIds(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("notes")
    .select("id, source_id")
    .not("source_id", "is", null);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.source_id) map.set(row.source_id, row.id);
  }
  return map;
}

export async function sampleNoteFields(
  limit: number
): Promise<string[]> {
  const { data } = await supabase
    .from("notes")
    .select("fields")
    .limit(limit);

  return (data ?? []).map((r) => r.fields as string);
}

// ---------------------------------------------------------------------------
// Batch operations (for import)
// ---------------------------------------------------------------------------

const BATCH_SIZE = 2000;

export async function batchUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict = "id"
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict });

    if (error) {
      throw new Error(`Failed to upsert ${table}: ${error.message}`);
    }
  }
}
