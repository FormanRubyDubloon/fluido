import { supabase } from "@/lib/supabase";
import { get, set, keys } from "idb-keyval";
import { IDB_MEDIA_PREFIX } from "@/lib/constants";
import { getDb } from "@/platform/adapter";

export type ProgressCallback = (stage: string, percent: number) => void;

const SYNCED_MEDIA_KEY = "synced_media_keys";

function getSyncedMediaKeys(): Set<string> {
  const db = getDb();
  const rows = db.exec<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [SYNCED_MEDIA_KEY]
  );
  if (!rows[0]) return new Set();
  try {
    return new Set(JSON.parse(rows[0].value) as string[]);
  } catch {
    return new Set();
  }
}

function saveSyncedMediaKeys(syncedKeys: Set<string>): void {
  const db = getDb();
  db.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [SYNCED_MEDIA_KEY, JSON.stringify(Array.from(syncedKeys))]
  );
}

export async function pushMediaToCloud(
  userId: string,
  onProgress?: ProgressCallback
): Promise<number> {
  const allKeys = await keys();
  const mediaKeys = (allKeys as string[]).filter(
    (k) => typeof k === "string" && k.startsWith(IDB_MEDIA_PREFIX)
  );

  if (mediaKeys.length === 0) return 0;

  const alreadySynced = getSyncedMediaKeys();
  const toUpload = mediaKeys.filter((k) => !alreadySynced.has(k));

  if (toUpload.length === 0) {
    onProgress?.("Media already synced", 100);
    return 0;
  }

  onProgress?.(`Uploading ${toUpload.length} media files…`, 0);

  let uploaded = 0;

  for (const key of toUpload) {
    const data = await get<Uint8Array>(key);
    if (!data) continue;

    const path = key.replace(`${IDB_MEDIA_PREFIX}:`, "");
    const storagePath = `${userId}/${path}`;

    onProgress?.(
      `Uploading media ${uploaded + 1}/${toUpload.length}…`,
      Math.round((uploaded / toUpload.length) * 100)
    );

    const { error } = await supabase.storage
      .from("media")
      .upload(storagePath, data, {
        contentType: "application/octet-stream",
        upsert: false,
      });

    if (error) {
      if (error.message.includes("already exists") || error.message.includes("Duplicate")) {
        // Already on server — mark as synced
        alreadySynced.add(key);
        uploaded++;
        continue;
      }
      console.warn(`Failed to upload media ${storagePath}:`, error.message);
    } else {
      alreadySynced.add(key);
      uploaded++;
    }

    // Save progress every 50 files in case of interruption
    if (uploaded % 50 === 0) {
      saveSyncedMediaKeys(alreadySynced);
    }
  }

  saveSyncedMediaKeys(alreadySynced);
  getDb().persist();

  return uploaded;
}

export async function pullMediaFromCloud(
  userId: string,
  onProgress?: ProgressCallback
): Promise<number> {
  let downloaded = 0;

  const folders = await listFolders(`${userId}`);

  for (const folder of folders) {
    const files = await listFiles(`${userId}/${folder}`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const storagePath = `${userId}/${folder}/${file}`;
      const localKey = `${IDB_MEDIA_PREFIX}:${folder}/${file}`;

      onProgress?.(
        `Downloading media ${downloaded + 1}…`,
        files.length > 0 ? Math.round((i / files.length) * 100) : 0
      );

      const existing = await get(localKey);
      if (existing) {
        downloaded++;
        continue;
      }

      const { data, error } = await supabase.storage
        .from("media")
        .download(storagePath);

      if (error || !data) {
        console.warn(`Failed to download media ${storagePath}:`, error?.message);
        continue;
      }

      const buffer = await data.arrayBuffer();
      await set(localKey, new Uint8Array(buffer));
      downloaded++;
    }
  }

  return downloaded;
}

async function listFolders(prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from("media")
    .list(prefix);

  if (error || !data) return [];
  return data
    .filter((item) => item.id === null || !item.metadata)
    .map((item) => item.name);
}

async function listFiles(prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from("media")
    .list(prefix);

  if (error || !data) return [];
  return data
    .filter((item) => item.id !== null && item.metadata)
    .map((item) => item.name);
}