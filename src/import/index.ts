import { unzipApkg } from "./unzip";
import { parseAnkiCollection } from "./parser";
import { mapCollection, type MapResult } from "./mapper";
import { storeMediaFiles } from "./media";
import { getExistingSourceIds, batchUpsert } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

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

  // Fetch existing source IDs for dedup
  const existingSourceIds = await getExistingSourceIds();

  // Map Anki entities to Fluido row arrays
  const mapped: MapResult = mapCollection(collection, existingSourceIds);

  // Get user_id for RLS
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const withUser = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({ ...r, user_id: userId }));

  // Insert into Supabase in dependency order
  if (mapped.decks.length > 0) {
    await batchUpsert("decks", withUser(mapped.decks));
  }
  if (mapped.noteTypes.length > 0) {
    await batchUpsert("note_types", withUser(mapped.noteTypes));
  }
  if (mapped.notes.length > 0) {
    await batchUpsert("notes", withUser(mapped.notes));
  }
  if (mapped.cards.length > 0) {
    await batchUpsert("cards", withUser(mapped.cards));
  }
  if (mapped.cardStates.length > 0) {
    await batchUpsert("card_states", withUser(mapped.cardStates), "card_id");
  }
  if (mapped.reviewLogs.length > 0) {
    await batchUpsert("review_logs", withUser(mapped.reviewLogs));
  }

  // Upload media directly to Supabase Storage
  let mediaStored = 0;
  if (contents.mediaFiles.size > 0) {
    mediaStored = await storeMediaFiles("shared", contents.mediaFiles);
  }

  return {
    decksCreated: mapped.decksCreated,
    noteTypesCreated: mapped.noteTypesCreated,
    notesCreated: mapped.notesCreated,
    cardsCreated: mapped.cardsCreated,
    notesSkipped: mapped.notesSkipped,
    mediaStored,
    reviewLogsImported: mapped.reviewLogsImported,
  };
}
