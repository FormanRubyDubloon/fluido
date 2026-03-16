import { supabase } from "@/lib/supabase";
import { getDb } from "@/platform/adapter";

/**
 * Pull all data from Supabase for the current user into local SQLite.
 * Clears local data first, then inserts everything from the cloud.
 */
export async function pullAllFromCloud(userId: string): Promise<{
  decks: number;
  cards: number;
  reviewLogs: number;
}> {
  const db = getDb();

  // Fetch all tables
  const [decks, noteTypes, notes, cards, cardStates, reviewLogs, settings] = await Promise.all([
    fetchAll("decks", userId),
    fetchAll("note_types", userId),
    fetchAll("notes", userId),
    fetchAll("cards", userId),
    fetchAll("card_states", userId),
    fetchAll("review_logs", userId),
    fetchSettings(userId),
  ]);

  // Clear local data and re-insert from cloud
  db.transaction(() => {
    // Delete in reverse dependency order
    db.run("DELETE FROM review_logs");
    db.run("DELETE FROM card_states");
    db.run("DELETE FROM cards");
    db.run("DELETE FROM notes");
    db.run("DELETE FROM note_types");
    db.run("DELETE FROM decks");

    // Insert decks
    for (const row of decks) {
      db.run(
        `INSERT INTO decks (id, name, parent_id, language, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.name, row.parent_id, row.language, row.source, row.created_at, row.updated_at]
      );
    }

    // Insert note types
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

    // Insert notes
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

    // Insert cards
    for (const row of cards) {
      db.run(
        `INSERT INTO cards (id, note_id, deck_id, template_index, card_type, source, suspended, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.note_id, row.deck_id, row.template_index, row.card_type, row.source, row.suspended, row.created_at, row.updated_at]
      );
    }

    // Insert card states
    for (const row of cardStates) {
      db.run(
        `INSERT INTO card_states (card_id, difficulty, stability, due, interval, reps, lapses, last_review, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.card_id, row.difficulty, row.stability, row.due, row.interval, row.reps, row.lapses, row.last_review, row.updated_at]
      );
    }

    // Insert review logs
    for (const row of reviewLogs) {
      db.run(
        `INSERT INTO review_logs (id, card_id, rating, elapsed_ms, review_time, scheduled_days, actual_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.card_id, row.rating, row.elapsed_ms, row.review_time, row.scheduled_days, row.actual_days, row.created_at]
      );
    }

    // Restore settings
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

  await db.persist();

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
