import { supabase } from "@/lib/supabase";
import { get, set, keys } from "idb-keyval";
import { IDB_MEDIA_PREFIX } from "@/lib/constants";

export type ProgressCallback = (stage: string, percent: number) => void;

export async function pushMediaToCloud(
  userId: string,
  onProgress?: ProgressCallback
): Promise<number> {
  const allKeys = await keys();
  const mediaKeys = (allKeys as string[]).filter(
    (k) => typeof k === "string" && k.startsWith(IDB_MEDIA_PREFIX)
  );

  if (mediaKeys.length === 0) return 0;

  let uploaded = 0;

  for (const key of mediaKeys) {
    const data = await get<Uint8Array>(key);
    if (!data) continue;

    const path = key.replace(`${IDB_MEDIA_PREFIX}:`, "");
    const storagePath = `${userId}/${path}`;

    onProgress?.(
      `Uploading media ${uploaded + 1}/${mediaKeys.length}…`,
      Math.round((uploaded / mediaKeys.length) * 100)
    );

    const { error } = await supabase.storage
      .from("media")
      .upload(storagePath, data, {
        contentType: "application/octet-stream",
        upsert: true,
      });

    if (error && !error.message.includes("already exists")) {
      console.warn(`Failed to upload media ${storagePath}:`, error.message);
    } else {
      uploaded++;
    }
  }

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
        `Downloading media ${downloaded + 1}/${files.length}…`,
        Math.round((downloaded / Math.max(files.length, 1)) * 100)
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