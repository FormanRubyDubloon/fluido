import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { pushAllToCloud, pushCardReview } from "./push";
import { pullAllFromCloud } from "./pull";
import { pushMediaToCloud, pullMediaFromCloud } from "./media";
import { getDb } from "@/platform/adapter";

export interface SyncResult {
  direction: "push" | "pull";
  decks: number;
  cards: number;
  reviewLogs: number;
  media: number;
}

/**
 * Get the currently authenticated user's ID, or null.
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Full push: send all local data + media to Supabase.
 * Called after import or when user wants to force-sync.
 */
export async function fullPush(): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  await pushAllToCloud(userId);
  await pushSettings(userId);
  const media = await pushMediaToCloud(userId);

  const db = getDb();
  const deckCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM decks")[0]?.c ?? 0;
  const cardCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM cards")[0]?.c ?? 0;
  const logCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM review_logs")[0]?.c ?? 0;

  return { direction: "push", decks: deckCount, cards: cardCount, reviewLogs: logCount, media };
}

/**
 * Full pull: download all data + media from Supabase to local.
 * Called on login from a new device.
 */
export async function fullPull(): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const result = await pullAllFromCloud(userId);
  const media = await pullMediaFromCloud(userId);

  return {
    direction: "pull",
    decks: result.decks,
    cards: result.cards,
    reviewLogs: result.reviewLogs,
    media,
  };
}

/**
 * Push a single card review to Supabase (called after each rating).
 * Runs in the background — doesn't block the UI.
 */
export async function syncCardReview(cardId: string, reviewLogId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  try {
    await pushCardReview(userId, cardId, reviewLogId);
  } catch (e) {
    console.warn("Background sync failed for card review:", e);
    // Non-fatal — data is safe locally
  }
}

/**
 * Push user settings to Supabase.
 */
async function pushSettings(userId: string): Promise<void> {
  const db = getDb();
  const rows = db.exec<{ key: string; value: string }>("SELECT * FROM settings");

  const settingsObj: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      settingsObj[row.key] = JSON.parse(row.value);
    } catch {
      settingsObj[row.key] = row.value;
    }
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert({
      user_id: userId,
      settings: settingsObj,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.warn("Failed to push settings:", error.message);
  }
}

/**
 * Check if the cloud has any data for this user.
 */
export async function cloudHasData(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { data, error } = await supabase
    .from("decks")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * Check if local has any data.
 */
export function localHasData(): boolean {
  const db = getDb();
  const count = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM decks")[0]?.c ?? 0;
  return count > 0;
}
