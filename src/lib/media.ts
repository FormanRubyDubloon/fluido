/**
 * Media URL resolution via Supabase Storage.
 * Downloads files and creates blob URLs to avoid COEP/CORS issues.
 * Caches blob URLs in memory for the session lifetime.
 */

import { supabase } from "./supabase";

const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** Sanitize a filename for Supabase Storage (no spaces or special chars) */
function sanitizeFilename(filename: string): string {
  return filename.replace(/ /g, "_");
}

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

  const storagePath = `${userId}/${deckId}/${sanitizeFilename(filename)}`;

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

  const storagePath = `${userId}/${deckId}/${sanitizeFilename(filename)}`;

  await supabase.storage.from("media").upload(storagePath, data, {
    contentType: "application/octet-stream",
    upsert: true,
  });
}

/**
 * Prefetch all media files referenced by a set of card fields.
 * Extracts [sound:filename] and src="filename" references,
 * downloads them all, and caches as blob URLs.
 */
export async function prefetchMedia(
  cards: { fields: Record<string, string> | string }[],
  deckId = "shared"
): Promise<number> {
  const filenames = new Set<string>();
  const soundRegex = /\[sound:([^\]]+)\]/g;
  const srcRegex = /src="([^"]+)"/g;

  for (const card of cards) {
    const fieldsObj =
      typeof card.fields === "string"
        ? JSON.parse(card.fields)
        : card.fields;
    const text = Object.values(fieldsObj as Record<string, string>).join(" ");

    let match;
    while ((match = soundRegex.exec(text)) !== null) {
      const fname = match[1]!;
      if (!fname.startsWith("http") && !fname.startsWith("data:")) {
        filenames.add(fname);
      }
    }
    while ((match = srcRegex.exec(text)) !== null) {
      const fname = match[1]!;
      if (
        !fname.startsWith("http") &&
        !fname.startsWith("data:") &&
        !fname.startsWith("blob:")
      ) {
        filenames.add(fname);
      }
    }
  }

  if (filenames.size === 0) return 0;

  // Filter out already-cached files
  const toFetch = [...filenames].filter(
    (f) => !urlCache.has(`${deckId}/${f}`)
  );

  if (toFetch.length === 0) return 0;

  // Download in parallel batches of 6
  const BATCH = 6;
  let downloaded = 0;

  for (let i = 0; i < toFetch.length; i += BATCH) {
    const batch = toFetch.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((f) => getMediaUrl(deckId, f))
    );
    downloaded += results.filter(
      (r) => r.status === "fulfilled" && r.value !== ""
    ).length;
  }

  return downloaded;
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
