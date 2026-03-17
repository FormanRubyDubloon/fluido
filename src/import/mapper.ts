import { newId } from "@/lib/ids";
import { now } from "@/lib/time";
import { createFsrsScheduler } from "@/srs/fsrs";
import { hasCloze, getClozeIndices } from "./template";
import type { AnkiCollection, AnkiCard, AnkiRevlogEntry } from "./parser";

export interface MapResult {
  decks: Record<string, unknown>[];
  noteTypes: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  cardStates: Record<string, unknown>[];
  reviewLogs: Record<string, unknown>[];
  decksCreated: number;
  noteTypesCreated: number;
  notesCreated: number;
  cardsCreated: number;
  notesSkipped: number;
  reviewLogsImported: number;
}

function ankiCardType(
  ankiType: number,
  queue: number
): "new" | "learning" | "review" | "relearning" {
  if (queue === -1) return "new";
  switch (ankiType) {
    case 0:
      return "new";
    case 1:
      return "learning";
    case 2:
      return "review";
    case 3:
      return "relearning";
    default:
      return "new";
  }
}

function convertSchedulingState(ankiCard: AnkiCard): {
  difficulty: number;
  stability: number;
  interval: number;
  due: string;
} {
  const easeFactor = ankiCard.factor || 2500;
  const difficulty = Math.max(
    1,
    Math.min(10, 10 - ((easeFactor - 1300) / (3500 - 1300)) * 9)
  );
  const stability = Math.max(0.1, ankiCard.ivl);
  const interval = ankiCard.ivl;

  let due: string;
  if (ankiCard.type === 2 && ankiCard.ivl > 0) {
    due = new Date().toISOString();
  } else {
    due = new Date().toISOString();
  }

  return { difficulty, stability, interval, due };
}

function ankiEaseToRating(ease: number): number {
  return Math.max(1, Math.min(4, ease));
}

/**
 * Map an Anki collection to Fluido row arrays.
 * Returns data arrays — does NOT insert into any database.
 * existingSourceIds: Map of source_id → fluido note id (for dedup)
 */
export function mapCollection(
  collection: AnkiCollection,
  existingSourceIds: Map<string, string>
): MapResult {
  const scheduler = createFsrsScheduler();
  const timestamp = now();

  const deckIdMap = new Map<number, string>();
  const noteTypeIdMap = new Map<number, string>();
  const noteIdMap = new Map<number, string>();
  const cardIdMap = new Map<number, string>();

  const decks: Record<string, unknown>[] = [];
  const noteTypes: Record<string, unknown>[] = [];
  const notes: Record<string, unknown>[] = [];
  const cards: Record<string, unknown>[] = [];
  const cardStates: Record<string, unknown>[] = [];
  const reviewLogs: Record<string, unknown>[] = [];

  let decksCreated = 0;
  let noteTypesCreated = 0;
  let notesCreated = 0;
  let cardsCreated = 0;
  let notesSkipped = 0;
  let reviewLogsImported = 0;

  const revlogByCard = new Map<number, AnkiRevlogEntry[]>();
  for (const entry of collection.revlog) {
    const existing = revlogByCard.get(entry.cid) ?? [];
    existing.push(entry);
    revlogByCard.set(entry.cid, existing);
  }

  // ----- Decks -----
  for (const ankiDeck of collection.decks) {
    const fluidoId = newId();
    deckIdMap.set(ankiDeck.id, fluidoId);

    const parts = ankiDeck.name.split("::");
    const deckName = parts[parts.length - 1]!;

    let parentId: string | null = null;
    if (parts.length > 1) {
      const parentName = parts.slice(0, -1).join("::");
      const parentDeck = collection.decks.find((d) => d.name === parentName);
      if (parentDeck) {
        parentId = deckIdMap.get(parentDeck.id) ?? null;
      }
    }

    decks.push({
      id: fluidoId,
      name: deckName,
      parent_id: parentId,
      source: "anki",
      created_at: timestamp,
      updated_at: timestamp,
    });
    decksCreated++;
  }

  // ----- Note Types -----
  for (const ankiNoteType of collection.noteTypes) {
    const fluidoId = newId();
    noteTypeIdMap.set(ankiNoteType.id, fluidoId);

    noteTypes.push({
      id: fluidoId,
      name: ankiNoteType.name,
      fields: JSON.stringify(ankiNoteType.fields.map((f) => f.name)),
      card_templates: JSON.stringify(
        ankiNoteType.templates.map((t) => ({
          name: t.name,
          front: t.qfmt,
          back: t.afmt,
          css: ankiNoteType.css,
        }))
      ),
      source: "anki",
      created_at: timestamp,
      updated_at: timestamp,
    });
    noteTypesCreated++;
  }

  // ----- Notes -----
  for (const ankiNote of collection.notes) {
    const existingId = existingSourceIds.get(String(ankiNote.id));
    if (existingId) {
      noteIdMap.set(ankiNote.id, existingId);
      notesSkipped++;
      continue;
    }

    const fluidoId = newId();
    noteIdMap.set(ankiNote.id, fluidoId);

    const noteTypeId = noteTypeIdMap.get(ankiNote.mid);
    if (!noteTypeId) {
      console.warn(
        `Note ${ankiNote.id} references unknown model ${ankiNote.mid}, skipping`
      );
      notesSkipped++;
      continue;
    }

    const noteType = collection.noteTypes.find(
      (nt) => nt.id === ankiNote.mid
    );
    const fieldsObj: Record<string, string> = {};
    if (noteType) {
      for (let i = 0; i < noteType.fields.length; i++) {
        const fieldName = noteType.fields[i]?.name ?? `Field${i}`;
        fieldsObj[fieldName] = ankiNote.fields[i] ?? "";
      }
    }

    notes.push({
      id: fluidoId,
      note_type_id: noteTypeId,
      fields: JSON.stringify(fieldsObj),
      tags: JSON.stringify(ankiNote.tags),
      source: "anki",
      source_id: String(ankiNote.id),
      created_at: timestamp,
      updated_at: timestamp,
    });
    notesCreated++;
  }

  // ----- Cards + Card States -----
  for (const ankiCard of collection.cards) {
    const noteId = noteIdMap.get(ankiCard.nid);
    if (!noteId) continue;

    const deckId = deckIdMap.get(ankiCard.did);
    if (!deckId) continue;

    const ankiNote = collection.notes.find((n) => n.id === ankiCard.nid);
    const isCloze = ankiNote ? hasCloze(ankiNote.fields) : false;
    const isReviewed = ankiCard.reps > 0;
    const isSuspended = ankiCard.queue === -1 ? 1 : 0;

    const insertCard = (templateIndex: number) => {
      const cardId = newId();
      cardIdMap.set(ankiCard.id, cardId);

      const cardType = ankiCardType(ankiCard.type, ankiCard.queue);

      cards.push({
        id: cardId,
        note_id: noteId,
        deck_id: deckId,
        template_index: templateIndex,
        card_type: cardType,
        source: "anki",
        suspended: isSuspended,
        created_at: timestamp,
        updated_at: timestamp,
      });

      if (isReviewed) {
        const converted = convertSchedulingState(ankiCard);
        const cardRevlog = revlogByCard.get(ankiCard.id) ?? [];
        const lastReviewEntry =
          cardRevlog.length > 0 ? cardRevlog[cardRevlog.length - 1] : null;
        const lastReviewTime = lastReviewEntry
          ? new Date(lastReviewEntry.id).toISOString()
          : null;

        let due = converted.due;
        if (lastReviewTime && ankiCard.ivl > 0) {
          const lastReviewDate = new Date(lastReviewEntry!.id);
          const dueDate = new Date(
            lastReviewDate.getTime() + ankiCard.ivl * 24 * 60 * 60 * 1000
          );
          due = dueDate.toISOString();
        }

        cardStates.push({
          card_id: cardId,
          difficulty: converted.difficulty,
          stability: converted.stability,
          due,
          interval: converted.interval,
          reps: ankiCard.reps,
          lapses: ankiCard.lapses,
          last_review: lastReviewTime,
          updated_at: timestamp,
        });
      } else {
        const state = scheduler.createNewCardState(cardId);
        cardStates.push({
          card_id: cardId,
          difficulty: state.difficulty,
          stability: state.stability,
          due: state.due,
          interval: state.interval,
          reps: 0,
          lapses: 0,
          last_review: null,
          updated_at: timestamp,
        });
      }

      cardsCreated++;
    };

    if (isCloze && ankiNote) {
      const clozeIndices = getClozeIndices(ankiNote.fields);
      for (const clozeIdx of clozeIndices) {
        insertCard(clozeIdx);
      }
    } else {
      insertCard(ankiCard.ord);
    }
  }

  // ----- Review Logs -----
  for (const entry of collection.revlog) {
    const fluidoCardId = cardIdMap.get(entry.cid);
    if (!fluidoCardId) continue;

    const reviewTime = new Date(entry.id).toISOString();
    const rating = ankiEaseToRating(entry.ease);
    const scheduledDays =
      entry.ivl < 0 ? Math.abs(entry.ivl) / 86400 : entry.ivl;
    const actualDays =
      entry.lastIvl < 0
        ? Math.abs(entry.lastIvl) / 86400
        : entry.lastIvl > 0
          ? entry.lastIvl
          : null;

    reviewLogs.push({
      id: newId(),
      card_id: fluidoCardId,
      rating,
      elapsed_ms: entry.time,
      review_time: reviewTime,
      scheduled_days: scheduledDays,
      actual_days: actualDays,
      created_at: timestamp,
    });
    reviewLogsImported++;
  }

  return {
    decks,
    noteTypes,
    notes,
    cards,
    cardStates,
    reviewLogs,
    decksCreated,
    noteTypesCreated,
    notesCreated,
    cardsCreated,
    notesSkipped,
    reviewLogsImported,
  };
}
