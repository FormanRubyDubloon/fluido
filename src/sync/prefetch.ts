import { get, set } from "idb-keyval";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getDb } from "@/platform/adapter";
import { IDB_MEDIA_PREFIX } from "@/lib/constants";

export type PrefetchCallback = (stage: string, percent: number) => void;

/**
 * Prefetch all media needed for due cards in a deck.
 * Returns the number of files downloaded.
 */
export async function prefetchDeckMedia(
  deckId: string,
  onProgress?: PrefetchCallback
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return 0;

  onProgress?.("Finding media for due cards…", 0);

  // Get all media filenames referenced by due cards in this deck
  const filenames = extractMediaFilenames(deckId);

  if (filenames.length === 0) {
    onProgress?.("No media needed", 100);
    return 0;
  }

  // Check which ones are missing locally
  const missing: string[] = [];
  for (const filename of filenames) {
    const key = `${IDB_MEDIA_PREFIX}:shared/${filename}`;
    try {
      const existing = await get(key);
      if (!existing) {
        missing.push(filename);
      }
    } catch {
      missing.push(filename);
    }
  }

  if (missing.length === 0) {
    onProgress?.("All media ready", 100);
    return 0;
  }

  onProgress?.(`Downloading ${missing.length} media files…`, 0);

  let downloaded = 0;

  for (let i = 0; i < missing.length; i++) {
    const filename = missing[i]!;
    const storagePath = `${userId}/shared/${filename}`;
    const localKey = `${IDB_MEDIA_PREFIX}:shared/${filename}`;

    onProgress?.(
      `Downloading media ${i + 1}/${missing.length}…`,
      Math.round((i / missing.length) * 100)
    );

    try {
      const { data, error } = await supabase.storage
        .from("media")
        .download(storagePath);

      if (data && !error) {
        const buffer = await data.arrayBuffer();
        await set(localKey, new Uint8Array(buffer));
        downloaded++;
      }
    } catch {
      // Skip failed downloads — card will show disabled button
    }

    // Throttle every 10 downloads
    if (i % 10 === 9) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  onProgress?.(`Downloaded ${downloaded} files`, 100);
  return downloaded;
}

/**
 * Extract all media filenames referenced by due cards in a deck.
 * Parses [sound:filename] and src="filename" from note fields.
 */
function extractMediaFilenames(deckId: string): string[] {
  const db = getDb();

  // Get note IDs for due cards (new + learning + review due now)
  const rows = db.exec<{ fields: string }>(
    `SELECT DISTINCT n.fields FROM notes n
     JOIN cards c ON c.note_id = n.id
     LEFT JOIN card_states cs ON cs.card_id = c.id
     WHERE c.deck_id = ? AND c.suspended = 0
     AND (
       c.card_type = 'new'
       OR c.card_type IN ('learning', 'relearning')
       OR (c.card_type = 'review' AND cs.due <= datetime('now'))
     )`,
    [deckId]
  );

  const filenames = new Set<string>();
  const soundRegex = /\[sound:([^\]]+)\]/g;
  const srcRegex = /src="([^"]+)"/g;

  for (const row of rows) {
    let fieldsText: string;
    try {
      const parsed = JSON.parse(row.fields);
      fieldsText = typeof parsed === "string" ? parsed : Object.values(parsed).join(" ");
    } catch {
      fieldsText = row.fields;
    }

    let match;
    while ((match = soundRegex.exec(fieldsText)) !== null) {
      const fname = match[1]!;
      if (!fname.startsWith("http") && !fname.startsWith("data:")) {
        filenames.add(fname);
      }
    }
    while ((match = srcRegex.exec(fieldsText)) !== null) {
      const fname = match[1]!;
      if (!fname.startsWith("http") && !fname.startsWith("data:") && !fname.startsWith("blob:")) {
        filenames.add(fname);
      }
    }
  }

  return Array.from(filenames);
}