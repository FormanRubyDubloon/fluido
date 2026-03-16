import { supabase } from "@/lib/supabase";
import { get, set, keys } from "idb-keyval";
import { IDB_MEDIA_PREFIX } from "@/lib/constants";

/**
 * Upload all local media to Supabase Storage.
 * Files are stored under: media/{userId}/{deckId}/{filename}
 */
export async function pushMediaToCloud(userId: string): Promise<number> {
  const allKeys = await keys();
  const mediaKeys = (allKeys as string[]).filter(
    (k) => typeof k === "string" && k.startsWith(IDB_MEDIA_PREFIX)
  );

  let uploaded = 0;

  for (const key of mediaKeys) {
    const data = await get<Uint8Array>(key);
    if (!data) continue;

    // Key format: fluido-media:deckId/filename
    const path = key.replace(`${IDB_MEDIA_PREFIX}:`, "");
    const storagePath = `${userId}/${path}`;

    // Check if already uploaded
    const { data: existing } = await supabase.storage
      .from("media")
      .list(storagePath.split("/").slice(0, -1).join("/"), {
        search: storagePath.split("/").pop(),
      });

    if (existing && existing.length > 0) {
      uploaded++;
      continue;
    }

    const { error } = await supabase.storage
      .from("media")
      .upload(storagePath, data, {
        contentType: "application/octet-stream",
        upsert: true,
      });

    if (error) {
      console.warn(`Failed to upload media ${storagePath}:`, error.message);
    } else {
      uploaded++;
    }
  }

  return uploaded;
}

/**
 * Download all media for a user from Supabase Storage to local IndexedDB.
 */
export async function pullMediaFromCloud(userId: string): Promise<number> {
  let downloaded = 0;

  // List all files in the user's media folder
  const folders = await listFolders(`${userId}`);

  for (const folder of folders) {
    const files = await listFiles(`${userId}/${folder}`);

    for (const file of files) {
      const storagePath = `${userId}/${folder}/${file}`;
      const localKey = `${IDB_MEDIA_PREFIX}:${folder}/${file}`;

      // Skip if already in local storage
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
  // Folders have id: null in the listing
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
