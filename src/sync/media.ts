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

async function getRemoteFileSet(userId: string, folder: string): Promise<Set<string>> {
  const remote = new Set<string>();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from("media")
      .list(`${userId}/${folder}`, { limit, offset });

    if (error || !data || data.length === 0) break;

    for (const item of data) {
      if (item.name && item.metadata) {
        remote.add(item.name);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return remote;
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
  let toUpload = mediaKeys.filter((k) => !alreadySynced.has(k));

  if (toUpload.length === 0) {
    onProgress?.("Media already synced", 100);
    return 0;
  }

  onProgress?.("Checking existing media on server…", 0);

  const byFolder = new Map<string, string[]>();
  for (const key of toUpload) {
    const path = key.replace(`${IDB_MEDIA_PREFIX}:`, "");
    const slashIndex = path.indexOf("/");
    const folder = slashIndex > -1 ? path.substring(0, slashIndex) : path;
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(key);
  }

  for (const [folder, localKeys] of byFolder) {
    const remoteFiles = await getRemoteFileSet(userId, folder);

    for (const key of localKeys) {
      const path = key.replace(`${IDB_MEDIA_PREFIX}:`, "");
      const filename = path.substring(path.indexOf("/") + 1);

      if (remoteFiles.has(filename)) {
        alreadySynced.add(key);
      }
    }
  }

  saveSyncedMediaKeys(alreadySynced);

  toUpload = toUpload.filter((k) => !alreadySynced.has(k));

  if (toUpload.length === 0) {
    onProgress?.("Media already synced", 100);
    getDb().persist();
    return 0;
  }

  onProgress?.(`Uploading ${toUpload.length} new media files…`, 0);
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

    const ok = await uploadWithRetry(storagePath, data);
    if (!ok) {
      console.warn(`Failed to upload ${storagePath} after retries`);
    }

    alreadySynced.add(key);
    uploaded++;

    if (uploaded % 10 === 9) {
      await sleep(100);
    }

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
    const total = files.length;

    onProgress?.(`Found ${total} media files in ${folder}…`, 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const storagePath = `${userId}/${folder}/${file}`;
      const localKey = `${IDB_MEDIA_PREFIX}:${folder}/${file}`;

      onProgress?.(
        `Downloading media ${i + 1}/${total}…`,
        total > 0 ? Math.round((i / total) * 100) : 0
      );

      const existing = await get(localKey);
      if (existing) {
        downloaded++;
        continue;
      }

      const fileData = await downloadWithRetry(storagePath);
      if (fileData) {
        await set(localKey, new Uint8Array(fileData));
        downloaded++;
      }

      if (i % 10 === 9) {
        await sleep(100);
      }
    }
  }

  return downloaded;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadWithRetry(
  storagePath: string,
  maxRetries = 3
): Promise<ArrayBuffer | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await supabase.storage
      .from("media")
      .download(storagePath);

    if (data) {
      return data.arrayBuffer();
    }

    if (error) {
      const status = (error as unknown as { statusCode?: number }).statusCode;
      if (status === 502 || status === 429 || status === 503) {
        const delay = Math.pow(2, attempt) * 500;
        console.warn(`Retry ${attempt + 1}/${maxRetries} for ${storagePath} after ${delay}ms`);
        await sleep(delay);
        continue;
      }
      console.warn(`Failed to download ${storagePath}:`, error.message);
      return null;
    }
  }

  console.warn(`Gave up downloading ${storagePath} after ${maxRetries} retries`);
  return null;
}

async function uploadWithRetry(
  storagePath: string,
  data: Uint8Array,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { error } = await supabase.storage
      .from("media")
      .upload(storagePath, data, {
        contentType: "application/octet-stream",
        upsert: true,
      });

    if (!error) return true;

    const status = (error as unknown as { statusCode?: number }).statusCode;
    if (status === 502 || status === 429 || status === 503) {
      const delay = Math.pow(2, attempt) * 500;
      console.warn(`Upload retry ${attempt + 1}/${maxRetries} for ${storagePath} after ${delay}ms`);
      await sleep(delay);
      continue;
    }

    return false;
  }

  return false;
}

async function listFolders(prefix: string): Promise<string[]> {
  const names: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from("media")
      .list(prefix, { limit, offset });

    if (error || !data || data.length === 0) break;

    for (const item of data) {
      if (item.id === null || !item.metadata) {
        names.push(item.name);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return names;
}

async function listFiles(prefix: string): Promise<string[]> {
  const names: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from("media")
      .list(prefix, { limit, offset });

    if (error || !data || data.length === 0) break;

    for (const item of data) {
      if (item.id !== null && item.metadata) {
        names.push(item.name);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return names;
}