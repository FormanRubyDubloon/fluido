import { getReviewQueue } from "@/lib/queries";

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

export async function buildQueue(
  deckId: string,
  newCardsPerDay: number
): Promise<QueueCard[]> {
  return getReviewQueue(deckId, newCardsPerDay);
}
