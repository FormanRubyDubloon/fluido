import { getDb } from "@/platform/adapter";

// ---------------------------------------------------------------------------
// Row types (what comes back from the database)
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
  fields: string; // JSON
  card_templates: string; // JSON
  source: string;
  created_at: string;
  updated_at: string;
}

export interface NoteRow {
  id: string;
  note_type_id: string;
  fields: string; // JSON
  tags: string; // JSON
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

// ---------------------------------------------------------------------------
// Deck queries
// ---------------------------------------------------------------------------

export function getAllDecks(): DeckRow[] {
  return getDb().exec<DeckRow>("SELECT * FROM decks ORDER BY name");
}

export function getDeckById(id: string): DeckRow | undefined {
  const rows = getDb().exec<DeckRow>("SELECT * FROM decks WHERE id = ?", [id]);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Card queries
// ---------------------------------------------------------------------------

export interface DeckCardCounts {
  new_count: number;
  learning_count: number;
  due_count: number;
}

export function getDeckCardCounts(deckId: string): DeckCardCounts {
  const db = getDb();

  const newCount = db.exec<{ count: number }>(
    "SELECT COUNT(*) as count FROM cards WHERE deck_id = ? AND card_type = 'new' AND suspended = 0",
    [deckId]
  );

  const learningCount = db.exec<{ count: number }>(
    "SELECT COUNT(*) as count FROM cards WHERE deck_id = ? AND card_type IN ('learning', 'relearning') AND suspended = 0",
    [deckId]
  );

  const dueCount = db.exec<{ count: number }>(
    `SELECT COUNT(*) as count FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     WHERE c.deck_id = ? AND c.card_type = 'review' AND c.suspended = 0
     AND cs.due <= datetime('now')`,
    [deckId]
  );

  return {
    new_count: newCount[0]?.count ?? 0,
    learning_count: learningCount[0]?.count ?? 0,
    due_count: dueCount[0]?.count ?? 0,
  };
}

export function getCardWithState(
  cardId: string
): (CardRow & CardStateRow) | undefined {
  const rows = getDb().exec<CardRow & CardStateRow>(
    `SELECT c.*, cs.difficulty, cs.stability, cs.due, cs.interval,
            cs.reps, cs.lapses, cs.last_review
     FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     WHERE c.id = ?`,
    [cardId]
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Note type queries
// ---------------------------------------------------------------------------

export function getNoteTypeById(id: string): NoteTypeRow | undefined {
  const rows = getDb().exec<NoteTypeRow>(
    "SELECT * FROM note_types WHERE id = ?",
    [id]
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Note queries
// ---------------------------------------------------------------------------

export function getNoteById(id: string): NoteRow | undefined {
  const rows = getDb().exec<NoteRow>("SELECT * FROM notes WHERE id = ?", [id]);
  return rows[0];
}

// ---------------------------------------------------------------------------
// Review log queries
// ---------------------------------------------------------------------------

export function getTodayReviewLogs(dateStr: string): ReviewLogRow[] {
  return getDb().exec<ReviewLogRow>(
    `SELECT * FROM review_logs
     WHERE review_time >= ? || 'T00:00:00.000Z'
     AND review_time < ? || 'T23:59:59.999Z'
     ORDER BY review_time`,
    [dateStr, dateStr]
  );
}

export function getNewCardsSeenToday(dateStr: string): number {
  const rows = getDb().exec<{ count: number }>(
    `SELECT COUNT(DISTINCT rl.card_id) as count
     FROM review_logs rl
     JOIN cards c ON rl.card_id = c.id
     WHERE rl.review_time >= ? || 'T00:00:00.000Z'
     AND rl.review_time < ? || 'T23:59:59.999Z'
     AND c.source = c.source
     AND rl.id IN (
       SELECT id FROM review_logs rl2
       WHERE rl2.card_id = rl.card_id
       ORDER BY rl2.review_time ASC
       LIMIT 1
     )`,
    [dateStr, dateStr]
  );
  return rows[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSetting<T>(key: string): T | null {
  const rows = getDb().exec<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [key]
  );
  if (!rows[0]) return null;
  return JSON.parse(rows[0].value) as T;
}

export function setSetting(key: string, value: unknown): void {
  getDb().run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
    key,
    JSON.stringify(value),
  ]);
}
