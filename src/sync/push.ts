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

  const totalRows = decks.length + noteTypes.length + notes.length +
    cards.length + cardStates.length + reviewLogs.length;
  let uploaded = 0;

  const progress = (stage: string) => {
    const pct = totalRows > 0 ? Math.round((uploaded / totalRows) * 100) : 0;
    onProgress?.(stage, pct);
  };

  progress(`Uploading ${decks.length} decks…`);
  await pushTable(userId, "decks", decks);
  uploaded += decks.length;

  progress(`Uploading ${noteTypes.length} note types…`);
  await pushTable(userId, "note_types", noteTypes);
  uploaded += noteTypes.length;

  progress(`Uploading ${notes.length} notes…`);
  uploaded = await pushTableWithProgress(userId, "notes", notes, uploaded, totalRows, "notes", onProgress);

  progress(`Uploading ${cards.length} cards…`);
  uploaded = await pushTableWithProgress(userId, "cards", cards, uploaded, totalRows, "cards", onProgress);

  progress(`Uploading ${cardStates.length} card states…`);
  uploaded = await pushTableWithProgress(userId, "card_states", cardStates, uploaded, totalRows, "card states", onProgress);

  progress(`Uploading ${reviewLogs.length} review logs…`);
  uploaded = await pushTableWithProgress(userId, "review_logs", reviewLogs, uploaded, totalRows, "review logs", onProgress);
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
  if (cards[0]) await pushTable(userId, "cards", cards);

  const states = db.exec<Record<string, unknown>>(
    "SELECT * FROM card_states WHERE card_id = ?", [cardId]
  );
  if (states[0]) await pushTable(userId, "card_states", states);

  const logs = db.exec<Record<string, unknown>>(
    "SELECT * FROM review_logs WHERE id = ?", [reviewLogId]
  );
  if (logs[0]) await pushTable(userId, "review_logs", logs);
}

const BATCH_SIZE = 2000;

async function pushTableWithProgress(
  userId: string,
  table: string,
  rows: Record<string, unknown>[],
  uploadedSoFar: number,
  totalRows: number,
  label: string,
  onProgress?: ProgressCallback
): Promise<number> {
  if (rows.length === 0) return uploadedSoFar;

  const withUser = rows.map((row) => ({ ...row, user_id: userId }));
  const pk = getPrimaryKey(table);
  let uploaded = uploadedSoFar;

  for (let i = 0; i < withUser.length; i += BATCH_SIZE) {
    const chunk = withUser.slice(i, i + BATCH_SIZE);
    const totalBatches = Math.ceil(withUser.length / BATCH_SIZE);

    if (totalBatches > 1) {
      onProgress?.(
        `Uploading ${label} (${Math.min(i + BATCH_SIZE, withUser.length).toLocaleString()}/${withUser.length.toLocaleString()})…`,
        totalRows > 0 ? Math.round((uploaded / totalRows) * 100) : 0
      );
    }

    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: pk });

    if (error) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      console.error(`Failed to push ${table} batch ${batchNum}/${totalBatches}:`, error.message);
      throw new Error(`Sync failed on ${table}: ${error.message}`);
    }

    uploaded += chunk.length;
  }

  return uploaded;
}

async function pushTable(
  userId: string,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (rows.length === 0) return;

  const withUser = rows.map((row) => ({ ...row, user_id: userId }));
  const pk = getPrimaryKey(table);

  for (let i = 0; i < withUser.length; i += BATCH_SIZE) {
    const chunk = withUser.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: pk });

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