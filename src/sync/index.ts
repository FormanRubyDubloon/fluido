import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { pushChangesToCloud, pushAllToCloud, pushCardReview } from "./push";
import { pullAllFromCloud } from "./pull";
import { pushMediaToCloud } from "./media";
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
 * 1. Check if cloud is newer → pull data if so
 * 2. Push local changes
 * 3. Upload media (media downloads happen lazily when cards are rendered)
 */
export async function fullSync(onProgress?: ProgressCallback): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  let pulled = false;

  onProgress?.("Checking for updates…", 0);
  try {
    const freshness = await checkFreshness();
    if (freshness.status === "cloud-newer") {
      onProgress?.("Downloading cloud data…", 5);
      await pullAllFromCloud(userId, (stage, pct) => {
        onProgress?.(stage, 5 + Math.round(pct * 0.35));
      });
      pulled = true;
    }
  } catch (e) {
    console.warn("Freshness check failed, continuing with push:", e);
  }

  onProgress?.("Uploading changes…", 40);
  const pushResult = await pushChangesToCloud(userId, (stage, pct) => {
    onProgress?.(stage, 40 + Math.round(pct * 0.3));
  });

  if (pushResult.totalPushed > 0) {
    onProgress?.("Uploading settings…", 70);
    await pushSettings(userId);
  }

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
    direction: "both",
    decks: deckCount,
    cards: cardCount,
    reviewLogs: logCount,
    media,
    incremental: true,
    totalPushed: pushResult.totalPushed,
    pulled,
  };
}

/**
 * Force full push — used after import.
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
 * Full pull — data only. Media loads lazily when cards are rendered.
 */
export async function fullPull(onProgress?: ProgressCallback): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  onProgress?.("Downloading data…", 0);
  const result = await pullAllFromCloud(userId, (stage, pct) => {
    onProgress?.(stage, Math.round(pct));
  });

  onProgress?.("Done!", 100);
  return {
    direction: "pull",
    decks: result.decks,
    cards: result.cards,
    reviewLogs: result.reviewLogs,
    media: 0,
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