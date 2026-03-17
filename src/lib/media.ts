/**
 * Media URL resolution via Supabase Storage.
 * Downloads files and creates blob URLs to avoid COEP/CORS issues.
 * Caches blob URLs in memory for the session lifetime.
 */

import { supabase } from "./supabase";

const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** Sanitize a filename for Supabase Storage.
 *  If it contains non-ASCII or spaces, hash it to a safe ASCII name. */
function sanitizeFilename(filename: string): string {
  if (/^[a-zA-Z0-9._-]+$/.test(filename)) return filename;

  // Hash the original name but keep the extension
  const dotIdx = filename.lastIndexOf(".");
  const ext = dotIdx > 0 ? filename.substring(dotIdx) : "";
  const hash = djb2Hash(filename);
  return `${hash}${ext}`;
}

function mimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", ogg: "audio/ogg",
    wav: "audio/wav", mp4: "video/mp4", ttf: "font/ttf", otf: "font/otf",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Deterministic string hash → hex string */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
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

  // Supabase download() can return zstd-compressed data.
  // Use createSignedUrl + fetch so the browser handles decompression.
  const { data: signedData } = await supabase.storage
    .from("media")
    .createSignedUrl(storagePath, 3600);

  if (!signedData?.signedUrl) return "";

  const response = await fetch(signedData.signedUrl, { mode: "cors" });
  if (!response.ok) return "";

  const blob = await response.blob();
  const correctType = mimeFromFilename(filename);
  const typedBlob = correctType !== blob.type
    ? new Blob([blob], { type: correctType })
    : blob;
  const url = URL.createObjectURL(typedBlob);
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
    contentType: mimeFromFilename(filename),
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
