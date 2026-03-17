import { supabase } from "@/lib/supabase";
import { getDb } from "@/platform/adapter";

export type ProgressCallback = (stage: string, percent: number) => void;

export async function pullAllFromCloud(
  userId: string,
  onProgress?: ProgressCallback
): Promise<{
  decks: number;
  cards: number;
  reviewLogs: number;
}> {
  const db = getDb();

  onProgress?.("Downloading decks…", 0);
  const decks = await fetchAll("decks", userId);

  onProgress?.("Downloading note types…", 10);
  const noteTypes = await fetchAll("note_types", userId);

  onProgress?.("Downloading notes…", 20);
  const notes = await fetchAll("notes", userId);

  onProgress?.("Downloading cards…", 35);
  const cards = await fetchAll("cards", userId);

  onProgress?.("Downloading card states…", 50);
  const cardStates = await fetchAll("card_states", userId);

  onProgress?.("Downloading review logs…", 60);
  const reviewLogs = await fetchAll("review_logs", userId);

  onProgress?.("Downloading settings…", 80);
  const settings = await fetchSettings(userId);

  onProgress?.("Rebuilding local database…", 85);

  db.transaction(() => {
    db.run("DELETE FROM review_logs");
    db.run("DELETE FROM card_states");
    db.run("DELETE FROM cards");
    db.run("DELETE FROM notes");
    db.run("DELETE FROM note_types");
    db.run("DELETE FROM decks");

    for (const row of decks) {
      db.run(
        `INSERT INTO decks (id, name, parent_id, language, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.name, row.parent_id, row.language, row.source, row.created_at, row.updated_at]
      );
    }

    for (const row of noteTypes) {
      db.run(
        `INSERT INTO note_types (id, name, fields, card_templates, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id, row.name,
          typeof row.fields === "string" ? row.fields : JSON.stringify(row.fields),
          typeof row.card_templates === "string" ? row.card_templates : JSON.stringify(row.card_templates),
          row.source, row.created_at, row.updated_at,
        ]
      );
    }

    for (const row of notes) {
      db.run(
        `INSERT INTO notes (id, note_type_id, fields, tags, source, source_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id, row.note_type_id,
          typeof row.fields === "string" ? row.fields : JSON.stringify(row.fields),
          typeof row.tags === "string" ? row.tags : JSON.stringify(row.tags),
          row.source, row.source_id, row.created_at, row.updated_at,
        ]
      );
    }

    for (const row of cards) {
      db.run(
        `INSERT INTO cards (id, note_id, deck_id, template_index, card_type, source, suspended, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.note_id, row.deck_id, row.template_index, row.card_type, row.source, row.suspended, row.created_at, row.updated_at]
      );
    }

    for (const row of cardStates) {
      db.run(
        `INSERT INTO card_states (card_id, difficulty, stability, due, interval, reps, lapses, last_review, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.card_id, row.difficulty, row.stability, row.due, row.interval, row.reps, row.lapses, row.last_review, row.updated_at]
      );
    }

    for (const row of reviewLogs) {
      db.run(
        `INSERT INTO review_logs (id, card_id, rating, elapsed_ms, review_time, scheduled_days, actual_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.card_id, row.rating, row.elapsed_ms, row.review_time, row.scheduled_days, row.actual_days, row.created_at]
      );
    }

    if (settings) {
      const settingsObj = typeof settings === "string" ? JSON.parse(settings) : settings;
      for (const [key, value] of Object.entries(settingsObj)) {
        db.run(
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
          [key, JSON.stringify(value)]
        );
      }
    }
  });

  onProgress?.("Saving…", 95);
  await db.persist();

  onProgress?.("Done!", 100);

  return {
    decks: decks.length,
    cards: cards.length,
    reviewLogs: reviewLogs.length,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(table: string, userId: string): Promise<any[]> {
  const allRows: unknown[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Failed to fetch ${table}:`, error.message);
      throw new Error(`Sync failed on ${table}: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

async function fetchSettings(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.settings as Record<string, unknown>;
}