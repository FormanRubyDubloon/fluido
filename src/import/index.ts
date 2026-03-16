import { getDb } from "@/platform/adapter";
import { unzipApkg } from "./unzip";
import { parseAnkiCollection } from "./parser";
import { mapAndInsert, type MapResult } from "./mapper";
import { storeMediaFiles } from "./media";
import { forceFullPush } from "@/sync/index";

export interface ImportResult {
  decksCreated: number;
  noteTypesCreated: number;
  notesCreated: number;
  cardsCreated: number;
  notesSkipped: number;
  mediaStored: number;
  reviewLogsImported: number;
}

export async function importApkg(buffer: ArrayBuffer): Promise<ImportResult> {
  const contents = await unzipApkg(buffer);
  const collection = await parseAnkiCollection(contents.collectionBinary);
  const mapResult: MapResult = mapAndInsert(collection);

  let mediaStored = 0;
  if (contents.mediaFiles.size > 0) {
    mediaStored = await storeMediaFiles("shared", contents.mediaFiles);
  }

  await getDb().persist();

  // Force full push after import (non-blocking)
  forceFullPush().catch((e) => console.warn("Cloud sync after import failed:", e));

  return {
    decksCreated: mapResult.decksCreated,
    noteTypesCreated: mapResult.noteTypesCreated,
    notesCreated: mapResult.notesCreated,
    cardsCreated: mapResult.cardsCreated,
    notesSkipped: mapResult.notesSkipped,
    mediaStored,
    reviewLogsImported: mapResult.reviewLogsImported,
  };
}