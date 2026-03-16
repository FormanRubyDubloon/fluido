import { getDb } from "@/platform/adapter";
import { getSetting } from "@/db/repository";
import { today } from "@/lib/time";
import { DEFAULT_NEW_CARDS_PER_DAY } from "@/lib/constants";

export interface QueueCard {
  cardId: string;
  noteId: string;
  deckId: string;
  templateIndex: number;
  cardType: "new" | "learning" | "review" | "relearning";
  difficulty: number;
  stability: number;
  due: string;
  interval: number;
  reps: number;
  lapses: number;
  lastReview: string | null;
  noteTypeId: string;
  fields: Record<string, string>;
  tags: string[];
}

interface RawQueueRow {
  card_id: string;
  note_id: string;
  deck_id: string;
  template_index: number;
  card_type: string;
  difficulty: number;
  stability: number;
  due: string;
  interval: number;
  reps: number;
  lapses: number;
  last_review: string | null;
  note_type_id: string;
  fields: string;
  tags: string;
}

export function buildQueue(deckId: string): QueueCard[] {
  const db = getDb();
  const nowIso = new Date().toISOString();

  const reviewCards = db.exec<RawQueueRow>(
    `SELECT c.id as card_id, c.note_id, c.deck_id, c.template_index, c.card_type,
            cs.difficulty, cs.stability, cs.due, cs.interval, cs.reps, cs.lapses, cs.last_review,
            n.note_type_id, n.fields, n.tags
     FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     JOIN notes n ON c.note_id = n.id
     WHERE c.deck_id = ? AND c.card_type = 'review' AND c.suspended = 0
     AND cs.due <= ?
     ORDER BY cs.due ASC`,
    [deckId, nowIso]
  );

  const learningCards = db.exec<RawQueueRow>(
    `SELECT c.id as card_id, c.note_id, c.deck_id, c.template_index, c.card_type,
            cs.difficulty, cs.stability, cs.due, cs.interval, cs.reps, cs.lapses, cs.last_review,
            n.note_type_id, n.fields, n.tags
     FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     JOIN notes n ON c.note_id = n.id
     WHERE c.deck_id = ? AND c.card_type IN ('learning', 'relearning') AND c.suspended = 0
     ORDER BY cs.due ASC`,
    [deckId]
  );

  const dailyLimit =
    getSetting<number>("new_cards_per_day") ?? DEFAULT_NEW_CARDS_PER_DAY;

  const todayStr = today();
  const newSeenToday = db.exec<{ count: number }>(
    `SELECT COUNT(DISTINCT rl.card_id) as count
     FROM review_logs rl
     JOIN cards c ON rl.card_id = c.id
     WHERE c.deck_id = ?
     AND rl.review_time >= ? || 'T00:00:00.000Z'`,
    [deckId, todayStr]
  );
  const seenCount = newSeenToday[0]?.count ?? 0;
  const remaining = Math.max(0, dailyLimit - seenCount);

  const newCards = db.exec<RawQueueRow>(
    `SELECT c.id as card_id, c.note_id, c.deck_id, c.template_index, c.card_type,
            cs.difficulty, cs.stability, cs.due, cs.interval, cs.reps, cs.lapses, cs.last_review,
            n.note_type_id, n.fields, n.tags
     FROM cards c
     JOIN card_states cs ON c.id = cs.card_id
     JOIN notes n ON c.note_id = n.id
     WHERE c.deck_id = ? AND c.card_type = 'new' AND c.suspended = 0
     ORDER BY c.created_at ASC
     LIMIT ?`,
    [deckId, remaining]
  );

  const all = [...reviewCards, ...learningCards, ...newCards];
  return all.map(toQueueCard);
}

function toQueueCard(row: RawQueueRow): QueueCard {
  return {
    cardId: row.card_id,
    noteId: row.note_id,
    deckId: row.deck_id,
    templateIndex: row.template_index,
    cardType: row.card_type as QueueCard["cardType"],
    difficulty: row.difficulty,
    stability: row.stability,
    due: row.due,
    interval: row.interval,
    reps: row.reps,
    lapses: row.lapses,
    lastReview: row.last_review,
    noteTypeId: row.note_type_id,
    fields: JSON.parse(row.fields),
    tags: JSON.parse(row.tags),
  };
}