import { supabase } from "@/lib/supabase";
import { getDb } from "@/platform/adapter";

/**
 * Push all local data to Supabase for the given user.
 * Uses upsert so it's safe to call repeatedly.
 */
export async function pushAllToCloud(userId: string): Promise<void> {
  const db = getDb();

  // Push in dependency order: decks → note_types → notes → cards → card_states → review_logs

  await pushTable(userId, "decks", db.exec<Record<string, unknown>>("SELECT * FROM decks"));
  await pushTable(userId, "note_types", db.exec<Record<string, unknown>>("SELECT * FROM note_types"));
  await pushTable(userId, "notes", db.exec<Record<string, unknown>>("SELECT * FROM notes"));
  await pushTable(userId, "cards", db.exec<Record<string, unknown>>("SELECT * FROM cards"));
  await pushTable(userId, "card_states", db.exec<Record<string, unknown>>("SELECT * FROM card_states"));
  await pushTable(userId, "review_logs", db.exec<Record<string, unknown>>("SELECT * FROM review_logs"));
}

/**
 * Push a single card's state and review log after a rating.
 */
export async function pushCardReview(
  userId: string,
  cardId: string,
  reviewLogId: string
): Promise<void> {
  const db = getDb();

  // Push updated card
  const cards = db.exec<Record<string, unknown>>(
    "SELECT * FROM cards WHERE id = ?", [cardId]
  );
  if (cards[0]) {
    await pushTable(userId, "cards", cards);
  }

  // Push updated card state
  const states = db.exec<Record<string, unknown>>(
    "SELECT * FROM card_states WHERE card_id = ?", [cardId]
  );
  if (states[0]) {
    await pushTable(userId, "card_states", states);
  }

  // Push new review log
  const logs = db.exec<Record<string, unknown>>(
    "SELECT * FROM review_logs WHERE id = ?", [reviewLogId]
  );
  if (logs[0]) {
    await pushTable(userId, "review_logs", logs);
  }
}

/**
 * Push rows to a Supabase table with user_id attached.
 * Uses upsert (insert with on-conflict update).
 */
async function pushTable(
  userId: string,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  // Add user_id to each row
  const withUser = rows.map((row) => ({
    ...row,
    user_id: userId,
  }));

  // Batch in chunks of 500
  for (let i = 0; i < withUser.length; i += 500) {
    const chunk = withUser.slice(i, i + 500);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: getPrimaryKey(table) });

    if (error) {
      console.error(`Failed to push ${table}:`, error.message);
      throw new Error(`Sync failed on ${table}: ${error.message}`);
    }
  }
}

function getPrimaryKey(table: string): string {
  switch (table) {
    case "card_states": return "card_id";
    case "user_settings": return "user_id";
    default: return "id";
  }
}
