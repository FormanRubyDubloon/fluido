import { supabase } from "@/lib/supabase";
import { getDb } from "@/platform/adapter";

export type ProgressCallback = (stage: string, percent: number) => void;

/**
 * Push only rows that changed since the last sync.
 * Falls back to full push if no last sync timestamp exists.
 */
export async function pushChangesToCloud(
  userId: string,
  onProgress?: ProgressCallback
): Promise<{ totalPushed: number }> {
  const db = getDb();
  const lastSync = getLastSyncTime();

  if (!lastSync) {
    // First sync — push everything
    onProgress?.("First sync — uploading all data…", 0);
    await pushAllToCloud(userId, onProgress);
    setLastSyncTime();
    const total = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM cards")[0]?.c ?? 0;
    return { totalPushed: total };
  }

  // Count what changed
  const changedDecks = db.exec<Record<string, unknown>>(
    "SELECT * FROM decks WHERE updated_at > ?", [lastSync]
  );
  const changedNoteTypes = db.exec<Record<string, unknown>>(
    "SELECT * FROM note_types WHERE updated_at > ?", [lastSync]
  );
  const changedNotes = db.exec<Record<string, unknown>>(
    "SELECT * FROM notes WHERE updated_at > ?", [lastSync]
  );
  const changedCards = db.exec<Record<string, unknown>>(
    "SELECT * FROM cards WHERE updated_at > ?", [lastSync]
  );
  const changedCardStates = db.exec<Record<string, unknown>>(
    "SELECT * FROM card_states WHERE updated_at > ?", [lastSync]
  );
  const newReviewLogs = db.exec<Record<string, unknown>>(
    "SELECT * FROM review_logs WHERE created_at > ?", [lastSync]
  );

  const totalChanged = changedDecks.length + changedNoteTypes.length +
    changedNotes.length + changedCards.length + changedCardStates.length +
    newReviewLogs.length;

  if (totalChanged === 0) {
    onProgress?.("Already up to date", 100);
    setLastSyncTime();
    return { totalPushed: 0 };
  }

  let uploaded = 0;
  const progress = (label: string, count: number) => {
    const pct = totalChanged > 0 ? Math.round((uploaded / totalChanged) * 100) : 0;
    if (count > 0) {
      onProgress?.(`${label} (${count})…`, pct);
    }
  };

  if (changedDecks.length > 0) {
    progress("Uploading decks", changedDecks.length);
    await pushRows(userId, "decks", changedDecks);
    uploaded += changedDecks.length;
  }

  if (changedNoteTypes.length > 0) {
    progress("Uploading note types", changedNoteTypes.length);
    await pushRows(userId, "note_types", changedNoteTypes);
    uploaded += changedNoteTypes.length;
  }

  if (changedNotes.length > 0) {
    progress("Uploading notes", changedNotes.length);
    uploaded = await pushRowsWithProgress(userId, "notes", changedNotes, uploaded, totalChanged, "notes", onProgress);
  }

  if (changedCards.length > 0) {
    progress("Uploading cards", changedCards.length);
    uploaded = await pushRowsWithProgress(userId, "cards", changedCards, uploaded, totalChanged, "cards", onProgress);
  }

  if (changedCardStates.length > 0) {
    progress("Uploading card states", changedCardStates.length);
    uploaded = await pushRowsWithProgress(userId, "card_states", changedCardStates, uploaded, totalChanged, "card states", onProgress);
  }

  if (newReviewLogs.length > 0) {
    progress("Uploading review logs", newReviewLogs.length);
    uploaded = await pushRowsWithProgress(userId, "review_logs", newReviewLogs, uploaded, totalChanged, "review logs", onProgress);
  }

  setLastSyncTime();
  return { totalPushed: totalChanged };
}

/**
 * Full push — used for first sync or after import.
 */
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
  await pushRows(userId, "decks", decks);
  uploaded += decks.length;

  progress(`Uploading ${noteTypes.length} note types…`);
  await pushRows(userId, "note_types", noteTypes);
  uploaded += noteTypes.length;

  progress(`Uploading ${notes.length} notes…`);
  uploaded = await pushRowsWithProgress(userId, "notes", notes, uploaded, totalRows, "notes", onProgress);

  progress(`Uploading ${cards.length} cards…`);
  uploaded = await pushRowsWithProgress(userId, "cards", cards, uploaded, totalRows, "cards", onProgress);

  progress(`Uploading ${cardStates.length} card states…`);
  uploaded = await pushRowsWithProgress(userId, "card_states", cardStates, uploaded, totalRows, "card states", onProgress);

  progress(`Uploading ${reviewLogs.length} review logs…`);
  uploaded = await pushRowsWithProgress(userId, "review_logs", reviewLogs, uploaded, totalRows, "review logs", onProgress);

  setLastSyncTime();
}

/**
 * Push a single card review (called in background after each rating).
 */
export async function pushCardReview(
  userId: string,
  cardId: string,
  reviewLogId: string
): Promise<void> {
  const db = getDb();

  const cards = db.exec<Record<string, unknown>>(
    "SELECT * FROM cards WHERE id = ?", [cardId]
  );
  if (cards[0]) await pushRows(userId, "cards", cards);

  const states = db.exec<Record<string, unknown>>(
    "SELECT * FROM card_states WHERE card_id = ?", [cardId]
  );
  if (states[0]) await pushRows(userId, "card_states", states);

  const logs = db.exec<Record<string, unknown>>(
    "SELECT * FROM review_logs WHERE id = ?", [reviewLogId]
  );
  if (logs[0]) await pushRows(userId, "review_logs", logs);
}

// ---------------------------------------------------------------------------
// Last sync timestamp
// ---------------------------------------------------------------------------

function getLastSyncTime(): string | null {
  const db = getDb();
  const rows = db.exec<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'last_sync_time'"
  );
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].value) as string;
  } catch {
    return null;
  }
}

function setLastSyncTime(): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync_time', ?)",
    [JSON.stringify(now)]
  );
  db.persist();
}

// ---------------------------------------------------------------------------
// Batch upload helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 2000;

async function pushRowsWithProgress(
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

async function pushRows(
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