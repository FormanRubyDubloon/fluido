import { getFiles } from "@/platform/adapter";

export async function storeMediaFiles(
  deckId: string,
  mediaFiles: Map<string, Uint8Array>
): Promise<number> {
  const files = getFiles();
  let stored = 0;

  for (const [filename, data] of mediaFiles) {
    try {
      await files.storeMedia(deckId, filename, data);
      stored++;
    } catch (e) {
      console.warn(`Failed to store media file "${filename}":`, e);
    }
  }

  return stored;
}