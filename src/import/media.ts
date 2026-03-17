import { uploadMedia } from "@/lib/media";

export async function storeMediaFiles(
  deckId: string,
  mediaFiles: Map<string, Uint8Array>
): Promise<number> {
  let stored = 0;

  for (const [filename, data] of mediaFiles) {
    try {
      await uploadMedia(deckId, filename, data);
      stored++;
    } catch (e) {
      console.warn(`Failed to upload media file "${filename}":`, e);
    }
  }

  return stored;
}
