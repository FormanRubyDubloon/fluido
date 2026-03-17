import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { pushChangesToCloud, pushAllToCloud, pushCardReview } from "./push";
import { pullAllFromCloud } from "./pull";
import { pushMediaToCloud, pullMediaFromCloud } from "./media";
import { getDb } from "@/platform/adapter";
import { checkFreshness } from "./freshness";

export type ProgressCallback = (stage: string, percent: number) => void;

export interface SyncResult {
  direction: "both" | "push" | "pull";
  decks: number;
  cards: number;
  reviewLogs: number;
  media: number;
  incremental: boolean;
  totalPushed: number;
  pulled: boolean;
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Bidirectional sync:
 * 1. Check if cloud is newer → pull if so
 * 2. Push local changes
 * 3. Sync media both ways
 */
export async function fullSync(onProgress?: ProgressCallback): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  let pulled = false;

  // Step 1: Check freshness and pull if cloud is newer
  onProgress?.("Checking for updates…", 0);
  try {
    const freshness = await checkFreshness();
    if (freshness.status === "cloud-newer") {
      onProgress?.("Downloading cloud data…", 5);
      await pullAllFromCloud(userId, (stage, pct) => {
        onProgress?.(stage, 5 + Math.round(pct * 0.3));
      });
      pulled = true;
    }
  } catch (e) {
    console.warn("Freshness check failed, continuing with push:", e);
  }

  // Step 2: Push local changes
  onProgress?.("Uploading changes…", 35);
  const pushResult = await pushChangesToCloud(userId, (stage, pct) => {
    onProgress?.(stage, 35 + Math.round(pct * 0.3));
  });

  // Step 3: Push settings
  if (pushResult.totalPushed > 0) {
    onProgress?.("Uploading settings…", 65);
    await pushSettings(userId);
  }

  // Step 4: Sync media both ways
  onProgress?.("Downloading media…", 70);
  const mediaDownloaded = await pullMediaFromCloud(userId, (stage, pct) => {
    onProgress?.(stage, 70 + Math.round(pct * 0.15));
  });

  onProgress?.("Uploading media…", 85);
  const mediaUploaded = await pushMediaToCloud(userId, (stage, pct) => {
    onProgress?.(stage, 85 + Math.round(pct * 0.15));
  });

  onProgress?.("Done!", 100);

  const db = getDb();
  const deckCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM decks")[0]?.c ?? 0;
  const cardCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM cards")[0]?.c ?? 0;
  const logCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM review_logs")[0]?.c ?? 0;

  return {
    direction: "both",
    decks: deckCount,
    cards: cardCount,
    reviewLogs: logCount,
    media: mediaDownloaded + mediaUploaded,
    incremental: true,
    totalPushed: pushResult.totalPushed,
    pulled,
  };
}

/**
 * Full push only — used after import.
 */
export async function forceFullPush(onProgress?: ProgressCallback): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  onProgress?.("Uploading all data…", 0);
  await pushAllToCloud(userId, (stage, pct) => {
    onProgress?.(stage, Math.round(pct * 0.7));
  });

  onProgress?.("Uploading settings…", 70);
  await pushSettings(userId);

  onProgress?.("Uploading media…", 75);
  const media = await pushMediaToCloud(userId, (stage, pct) => {
    onProgress?.(stage, 75 + Math.round(pct * 0.25));
  });

  onProgress?.("Done!", 100);

  const db = getDb();
  const deckCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM decks")[0]?.c ?? 0;
  const cardCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM cards")[0]?.c ?? 0;
  const logCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM review_logs")[0]?.c ?? 0;

  return {
    direction: "push",
    decks: deckCount,
    cards: cardCount,
    reviewLogs: logCount,
    media,
    incremental: false,
    totalPushed: deckCount + cardCount + logCount,
    pulled: false,
  };
}

/**
 * Full pull only — used from sync check modal.
 */
export async function fullPull(onProgress?: ProgressCallback): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  onProgress?.("Downloading data…", 0);
  const result = await pullAllFromCloud(userId, (stage, pct) => {
    onProgress?.(stage, Math.round(pct * 0.6));
  });

  onProgress?.("Downloading media…", 60);
  const media = await pullMediaFromCloud(userId, (stage, pct) => {
    onProgress?.(stage, 60 + Math.round(pct * 0.4));
  });

  onProgress?.("Done!", 100);
  return {
    direction: "pull",
    decks: result.decks,
    cards: result.cards,
    reviewLogs: result.reviewLogs,
    media,
    incremental: false,
    totalPushed: 0,
    pulled: true,
  };
}

export async function syncCardReview(cardId: string, reviewLogId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  try {
    await pushCardReview(userId, cardId, reviewLogId);
  } catch (e) {
    console.warn("Background sync failed for card review:", e);
  }
}

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

export function localHasData(): boolean {
  const db = getDb();
  const count = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM decks")[0]?.c ?? 0;
  return count > 0;
}