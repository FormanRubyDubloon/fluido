import { supabase } from "@/lib/supabase";
import { getDb } from "@/platform/adapter";

export type ProgressCallback = (stage: string, percent: number) => void;

export async function pushAllToCloud(
  userId: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const db = getDb();

  const decks = db.exec<Record<string, unknown>>("SELECT * FROM decks");
  const noteTypes = db.exec<Record<string, unknown>>("SELECT * FROM note_types");
  const notes = db.exec<Record<string, unknown>>("SELECT * FROM notes");
  const cards = db.exec<Record<string, unknown>>("SELECT * FROM cards");
  const cardStates = db.exec<Record<string, unknown>>("SELECT * FROM card_states");
  const reviewLogs = db.exec<Record<string, unknown>>("SELECT * FROM review_logs");

  const totalRows = decks.length + noteTypes.length + notes.length + cards.length + cardStates.length + reviewLogs.length;
  let uploaded = 0;

  const track = (stage: string, rows: number) => {
    uploaded += rows;
    const percent = totalRows > 0 ? Math.round((uploaded / totalRows) * 90) : 0;
    onProgress?.(stage, percent);
  };

  onProgress?.(`Uploading ${decks.length} decks…`, 0);
  await pushTable(userId, "decks", decks);
  track(`Uploaded ${decks.length} decks`, decks.length);

  onProgress?.(`Uploading ${noteTypes.length} note types…`, uploaded / totalRows * 90);
  await pushTable(userId, "note_types", noteTypes);
  track(`Uploaded note types`, noteTypes.length);

  onProgress?.(`Uploading ${notes.length} notes…`, uploaded / totalRows * 90);
  await pushTable(userId, "notes", notes);
  track(`Uploaded ${notes.length} notes`, notes.length);

  onProgress?.(`Uploading ${cards.length} cards…`, uploaded / totalRows * 90);
  await pushTable(userId, "cards", cards);
  track(`Uploaded ${cards.length} cards`, cards.length);

  onProgress?.(`Uploading card states…`, uploaded / totalRows * 90);
  await pushTable(userId, "card_states", cardStates);
  track(`Uploaded card states`, cardStates.length);

  onProgress?.(`Uploading ${reviewLogs.length} review logs…`, uploaded / totalRows * 90);
  await pushTable(userId, "review_logs", reviewLogs);
  track(`Uploaded ${reviewLogs.length} reviews`, reviewLogs.length);
}

export async function pushCardReview(
  userId: string,
  cardId: string,
  reviewLogId: string
): Promise<void> {
  const db = getDb();

  const cards = db.exec<Record<string, unknown>>(
    "SELECT * FROM cards WHERE id = ?", [cardId]
  );
  if (cards[0]) {
    await pushTable(userId, "cards", cards);
  }

  const states = db.exec<Record<string, unknown>>(
    "SELECT * FROM card_states WHERE card_id = ?", [cardId]
  );
  if (states[0]) {
    await pushTable(userId, "card_states", states);
  }

  const logs = db.exec<Record<string, unknown>>(
    "SELECT * FROM review_logs WHERE id = ?", [reviewLogId]
  );
  if (logs[0]) {
    await pushTable(userId, "review_logs", logs);
  }
}

async function pushTable(
  userId: string,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  const withUser = rows.map((row) => ({
    ...row,
    user_id: userId,
  }));

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