import { newId } from "@/lib/ids";
import { now } from "@/lib/time";
import { commitReview, undoReview } from "@/lib/queries";
import { createFsrsScheduler } from "./fsrs";
import type { Rating } from "./types";
import type { QueueCard } from "./queue";

export interface UndoSnapshot {
  cardId: string;
  previousCardType: string;
  previousState: {
    difficulty: number;
    stability: number;
    due: string;
    interval: number;
    reps: number;
    lapses: number;
    lastReview: string | null;
  };
  reviewLogId: string;
}

export interface RatingResult {
  snapshot: UndoSnapshot;
  newCardType: "new" | "learning" | "review" | "relearning";
  newState: {
    difficulty: number;
    stability: number;
    due: string;
    interval: number;
    reps: number;
    lapses: number;
  };
}

export function computeRating(
  card: QueueCard,
  rating: Rating,
  elapsedMs: number
): RatingResult {
  const scheduler = createFsrsScheduler();
  const reviewTime = new Date();
  const timestamp = now();
  const reviewLogId = newId();

  const snapshot: UndoSnapshot = {
    cardId: card.cardId,
    previousCardType: card.cardType,
    previousState: {
      difficulty: card.difficulty,
      stability: card.stability,
      due: card.due,
      interval: card.interval,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: card.lastReview,
    },
    reviewLogId,
  };

  const result = scheduler.schedule(
    {
      cardId: card.cardId,
      difficulty: card.difficulty,
      stability: card.stability,
      due: card.due,
      interval: card.interval,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: card.lastReview,
    },
    rating,
    reviewTime
  );

  let actualDays: number | null = null;
  if (card.lastReview) {
    const last = new Date(card.lastReview).getTime();
    actualDays = (reviewTime.getTime() - last) / (1000 * 60 * 60 * 24);
  }

  // Persist to Supabase (fire-and-forget for optimistic UI)
  commitReview({
    cardId: card.cardId,
    newCardType: result.cardType,
    newState: {
      difficulty: result.state.difficulty,
      stability: result.state.stability,
      due: result.state.due,
      interval: result.state.interval,
      reps: result.state.reps,
      lapses: result.state.lapses,
    },
    reviewLog: {
      id: reviewLogId,
      card_id: card.cardId,
      rating,
      elapsed_ms: elapsedMs,
      review_time: reviewTime.toISOString(),
      scheduled_days: result.state.interval,
      actual_days: actualDays,
      created_at: timestamp,
    },
  }).catch((e) => console.error("Failed to persist review:", e));

  return {
    snapshot,
    newCardType: result.cardType,
    newState: {
      difficulty: result.state.difficulty,
      stability: result.state.stability,
      due: result.state.due,
      interval: result.state.interval,
      reps: result.state.reps,
      lapses: result.state.lapses,
    },
  };
}

export async function revertRating(snapshot: UndoSnapshot): Promise<void> {
  await undoReview(
    snapshot.cardId,
    snapshot.previousCardType,
    snapshot.previousState,
    snapshot.reviewLogId
  );
}
