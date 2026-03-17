/**
 * Media URL resolution via Supabase Storage signed URLs.
 * Caches URLs in memory for the session lifetime.
 */

import { supabase } from "./supabase";

const SIGNED_URL_EXPIRY = 3600; // 1 hour
const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export async function getMediaUrl(
  deckId: string,
  filename: string
): Promise<string> {
  const key = `${deckId}/${filename}`;

  // Return cached URL
  const cached = urlCache.get(key);
  if (cached) return cached;

  // Deduplicate in-flight requests
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

  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);

  if (error || !data?.signedUrl) return "";

  urlCache.set(cacheKey, data.signedUrl);
  return data.signedUrl;
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
  urlCache.clear();
}
