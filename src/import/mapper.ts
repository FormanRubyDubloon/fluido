import { getDb } from "@/platform/adapter";
import { newId } from "@/lib/ids";
import { now } from "@/lib/time";
import { createFsrsScheduler } from "@/srs/fsrs";
import { hasCloze, getClozeIndices } from "./template";
import type { AnkiCollection, AnkiCard, AnkiRevlogEntry } from "./parser";

export interface MapResult {
  decksCreated: number;
  noteTypesCreated: number;
  notesCreated: number;
  cardsCreated: number;
  notesSkipped: number;
  reviewLogsImported: number;
}

/**
 * Convert Anki card type integer to Fluido card_type string.
 */
function ankiCardType(ankiType: number, queue: number): "new" | "learning" | "review" | "relearning" {
  if (queue === -1) return "new"; // suspended — treat as new for type purposes
  switch (ankiType) {
    case 0: return "new";
    case 1: return "learning";
    case 2: return "review";
    case 3: return "relearning";
    default: return "new";
  }
}

/**
 * Convert Anki's ease factor (2500 = 250%) and interval to FSRS-compatible
 * difficulty and stability estimates.
 *
 * This is an approximation — FSRS and SM-2 use different models.
 * Difficulty: mapped from ease factor (1300–3500 range → 1–10 scale, inverted)
 * Stability: approximated from interval in days
 */
function convertSchedulingState(ankiCard: AnkiCard): {
  difficulty: number;
  stability: number;
  interval: number;
  due: string;
} {
  // Difficulty: Anki ease 1300 → hard (high difficulty), 3500 → easy (low difficulty)
  // FSRS difficulty is roughly 1-10, higher = harder
  const easeFactor = ankiCard.factor || 2500;
  const difficulty = Math.max(1, Math.min(10,
    10 - ((easeFactor - 1300) / (3500 - 1300)) * 9
  ));

  // Stability: approximate as the current interval in days
  // This is a reasonable starting point — FSRS will refine it on the next review
  const stability = Math.max(0.1, ankiCard.ivl);

  const interval = ankiCard.ivl;

  // Due date: Anki stores due as days since collection creation for review cards,
  // or as a Unix timestamp for learning cards.
  // For review cards with intervals, calculate due from now + remaining days
  // For simplicity, if the card has been reviewed, set due based on interval
  let due: string;
  if (ankiCard.type === 2 && ankiCard.ivl > 0) {
    // Review card: Anki's `due` is days since epoch of the collection.
    // We approximate by using the interval relative to now.
    // A more precise approach would require the collection creation date.
    const now = new Date();
    // If due is in the past relative to collection, card is overdue — set due to now
    // If due is in the future, estimate from interval
    const dueDate = new Date(now.getTime());
    // Anki due field for review cards = day number. Without collection crt,
    // best we can do is set due = last_review + interval or just now for overdue.
    due = dueDate.toISOString();
  } else {
    due = new Date().toISOString();
  }

  return { difficulty, stability, interval, due };
}

/**
 * Map Anki revlog ease to Fluido rating (1-4).
 */
function ankiEaseToRating(ease: number): number {
  // Anki: 1=Again, 2=Hard, 3=Good, 4=Easy (same as Fluido)
  return Math.max(1, Math.min(4, ease));
}

export function mapAndInsert(collection: AnkiCollection): MapResult {
  const db = getDb();
  const scheduler = createFsrsScheduler();
  const timestamp = now();

  const deckIdMap = new Map<number, string>();
  const noteTypeIdMap = new Map<number, string>();
  const noteIdMap = new Map<number, string>();
  const cardIdMap = new Map<number, string>(); // Anki card ID → Fluido card ID

  let decksCreated = 0;
  let noteTypesCreated = 0;
  let notesCreated = 0;
  let cardsCreated = 0;
  let notesSkipped = 0;
  let reviewLogsImported = 0;

  // Build a map of revlog entries per Anki card ID for quick lookup
  const revlogByCard = new Map<number, AnkiRevlogEntry[]>();
  for (const entry of collection.revlog) {
    const existing = revlogByCard.get(entry.cid) ?? [];
    existing.push(entry);
    revlogByCard.set(entry.cid, existing);
  }

  db.transaction(() => {
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

      db.run(
        `INSERT INTO decks (id, name, parent_id, source, created_at, updated_at)
         VALUES (?, ?, ?, 'anki', ?, ?)`,
        [fluidoId, deckName, parentId, timestamp, timestamp]
      );
      decksCreated++;
    }

    // ----- Note Types -----
    for (const ankiNoteType of collection.noteTypes) {
      const fluidoId = newId();
      noteTypeIdMap.set(ankiNoteType.id, fluidoId);

      const fieldsJson = JSON.stringify(
        ankiNoteType.fields.map((f) => f.name)
      );
      const templatesJson = JSON.stringify(
        ankiNoteType.templates.map((t) => ({
          name: t.name,
          front: t.qfmt,
          back: t.afmt,
          css: ankiNoteType.css,
        }))
      );

      db.run(
        `INSERT INTO note_types (id, name, fields, card_templates, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'anki', ?, ?)`,
        [fluidoId, ankiNoteType.name, fieldsJson, templatesJson, timestamp, timestamp]
      );
      noteTypesCreated++;
    }

    // ----- Notes -----
    for (const ankiNote of collection.notes) {
      const existing = db.exec<{ id: string }>(
        "SELECT id FROM notes WHERE source_id = ?",
        [String(ankiNote.id)]
      );
      if (existing.length > 0) {
        noteIdMap.set(ankiNote.id, existing[0]!.id);
        notesSkipped++;
        continue;
      }

      const fluidoId = newId();
      noteIdMap.set(ankiNote.id, fluidoId);

      const noteTypeId = noteTypeIdMap.get(ankiNote.mid);
      if (!noteTypeId) {
        console.warn(`Note ${ankiNote.id} references unknown model ${ankiNote.mid}, skipping`);
        notesSkipped++;
        continue;
      }

      const noteType = collection.noteTypes.find((nt) => nt.id === ankiNote.mid);
      const fieldsObj: Record<string, string> = {};
      if (noteType) {
        for (let i = 0; i < noteType.fields.length; i++) {
          const fieldName = noteType.fields[i]?.name ?? `Field${i}`;
          fieldsObj[fieldName] = ankiNote.fields[i] ?? "";
        }
      }

      db.run(
        `INSERT INTO notes (id, note_type_id, fields, tags, source, source_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'anki', ?, ?, ?)`,
        [
          fluidoId,
          noteTypeId,
          JSON.stringify(fieldsObj),
          JSON.stringify(ankiNote.tags),
          String(ankiNote.id),
          timestamp,
          timestamp,
        ]
      );
      notesCreated++;
    }

    // ----- Cards -----
    for (const ankiCard of collection.cards) {
      const noteId = noteIdMap.get(ankiCard.nid);
      if (!noteId) continue;

      const deckId = deckIdMap.get(ankiCard.did);
      if (!deckId) {
        console.warn(`Card ${ankiCard.id} references unknown deck ${ankiCard.did}, skipping`);
        continue;
      }

      const ankiNote = collection.notes.find((n) => n.id === ankiCard.nid);
      const isCloze = ankiNote ? hasCloze(ankiNote.fields) : false;
      const isReviewed = ankiCard.reps > 0;
      const isSuspended = ankiCard.queue === -1 ? 1 : 0;

      const insertCard = (templateIndex: number) => {
        const cardId = newId();
        cardIdMap.set(ankiCard.id, cardId);

        const cardType = ankiCardType(ankiCard.type, ankiCard.queue);

        db.run(
          `INSERT INTO cards (id, note_id, deck_id, template_index, card_type, source, suspended, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'anki', ?, ?, ?)`,
          [cardId, noteId, deckId, templateIndex, cardType, isSuspended, timestamp, timestamp]
        );

        if (isReviewed) {
          // Card has been reviewed — import existing scheduling state
          const converted = convertSchedulingState(ankiCard);

          // Find the last review timestamp for this card from revlog
          const cardRevlog = revlogByCard.get(ankiCard.id) ?? [];
          const lastReviewEntry = cardRevlog.length > 0
            ? cardRevlog[cardRevlog.length - 1]
            : null;
          const lastReviewTime = lastReviewEntry
            ? new Date(lastReviewEntry.id).toISOString()
            : null;

          // If we have the last review time, calculate a more accurate due date
          let due = converted.due;
          if (lastReviewTime && ankiCard.ivl > 0) {
            const lastReviewDate = new Date(lastReviewEntry!.id);
            const dueDate = new Date(lastReviewDate.getTime() + ankiCard.ivl * 24 * 60 * 60 * 1000);
            due = dueDate.toISOString();
          }

          db.run(
            `INSERT INTO card_states (card_id, difficulty, stability, due, interval, reps, lapses, last_review, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              cardId,
              converted.difficulty,
              converted.stability,
              due,
              converted.interval,
              ankiCard.reps,
              ankiCard.lapses,
              lastReviewTime,
              timestamp,
            ]
          );
        } else {
          // New card — fresh FSRS state
          const state = scheduler.createNewCardState(cardId);
          db.run(
            `INSERT INTO card_states (card_id, difficulty, stability, due, interval, reps, lapses, last_review, updated_at)
             VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)`,
            [cardId, state.difficulty, state.stability, state.due, state.interval, timestamp]
          );
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

      // Convert interval: negative = seconds (learning), positive = days
      const scheduledDays = entry.ivl < 0
        ? Math.abs(entry.ivl) / 86400  // seconds to days
        : entry.ivl;

      const actualDays = entry.lastIvl < 0
        ? Math.abs(entry.lastIvl) / 86400
        : entry.lastIvl > 0 ? entry.lastIvl : null;

      db.run(
        `INSERT INTO review_logs (id, card_id, rating, elapsed_ms, review_time, scheduled_days, actual_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          fluidoCardId,
          rating,
          entry.time,
          reviewTime,
          scheduledDays,
          actualDays,
          timestamp,
        ]
      );
      reviewLogsImported++;
    }
  });

  return { decksCreated, noteTypesCreated, notesCreated, cardsCreated, notesSkipped, reviewLogsImported };
}