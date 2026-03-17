/**
 * Media URL resolution via Supabase Storage.
 * Downloads files and creates blob URLs to avoid COEP/CORS issues.
 * Caches blob URLs in memory for the session lifetime.
 */

import { supabase } from "./supabase";

const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export async function getMediaUrl(
  deckId: string,
  filename: string
): Promise<string> {
  const key = `${deckId}/${filename}`;

  const cached = urlCache.get(key);
  if (cached) return cached;

  if (inflight.has(key)) return inflight.get(key)!;

  const promise = resolveUrl(deckId, filename, key);
  inflight.set(key, promise);

  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

async function resolveUrl(
  deckId: string,
  filename: string,
  cacheKey: string
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return "";

  const storagePath = `${userId}/${deckId}/${filename}`;

  // Download as blob to avoid COEP/CORS issues with signed URLs
  const { data, error } = await supabase.storage
    .from("media")
    .download(storagePath);

  if (error || !data) return "";

  const url = URL.createObjectURL(data);
  urlCache.set(cacheKey, url);
  return url;
}

/**
 * Upload a media file to Supabase Storage.
 */
export async function uploadMedia(
  deckId: string,
  filename: string,
  data: Uint8Array
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  const storagePath = `${userId}/${deckId}/${filename}`;

  await supabase.storage.from("media").upload(storagePath, data, {
    contentType: "application/octet-stream",
    upsert: true,
  });
}

/**
 * Clear the URL cache (e.g. when signing out).
 */
export function clearMediaCache(): void {
  for (const url of urlCache.values()) {
    URL.revokeObjectURL(url);
  }
  urlCache.clear();
}
