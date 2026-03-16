import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { pushAllToCloud, pushCardReview } from "./push";
import { pullAllFromCloud } from "./pull";
import { pushMediaToCloud, pullMediaFromCloud } from "./media";
import { getDb } from "@/platform/adapter";

export type ProgressCallback = (stage: string, percent: number) => void;

export interface SyncResult {
  direction: "push" | "pull";
  decks: number;
  cards: number;
  reviewLogs: number;
  media: number;
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function fullPush(onProgress?: ProgressCallback): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  onProgress?.("Uploading data…", 0);
  await pushAllToCloud(userId, (stage, pct) => {
    onProgress?.(stage, Math.round(pct * 0.7));
  });

  onProgress?.("Uploading settings…", 70);
  await pushSettings(userId);

  onProgress?.("Uploading media…", 75);
  const media = await pushMediaToCloud(userId, (stage, pct) => {
    onProgress?.(stage, 75 + Math.round(pct * 0.25));
  });

  const db = getDb();
  const deckCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM decks")[0]?.c ?? 0;
  const cardCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM cards")[0]?.c ?? 0;
  const logCount = db.exec<{ c: number }>("SELECT COUNT(*) as c FROM review_logs")[0]?.c ?? 0;

  onProgress?.("Done!", 100);
  return { direction: "push", decks: deckCount, cards: cardCount, reviewLogs: logCount, media };
}

export async function fullPull(onProgress?: ProgressCallback): Promise<SyncResult | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  onProgress?.("Downloading data…", 0);
  const result = await pullAllFromCloud(userId);

  onProgress?.("Downloading media…", 50);
  const media = await pullMediaFromCloud(userId, (stage, pct) => {
    onProgress?.(stage, 50 + Math.round(pct * 0.5));
  });

  onProgress?.("Done!", 100);
  return {
    direction: "pull",
    decks: result.decks,
    cards: result.cards,
    reviewLogs: result.reviewLogs,
    media,
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