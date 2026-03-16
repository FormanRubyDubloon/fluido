import { getDb } from "@/platform/adapter";
import { newId } from "@/lib/ids";
import { now } from "@/lib/time";
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

export function commitRating(
  card: QueueCard,
  rating: Rating,
  elapsedMs: number
): RatingResult {
  const db = getDb();
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

  db.transaction(() => {
    db.run(
      `UPDATE card_states
       SET difficulty = ?, stability = ?, due = ?, interval = ?,
           reps = ?, lapses = ?, last_review = ?, updated_at = ?
       WHERE card_id = ?`,
      [
        result.state.difficulty,
        result.state.stability,
        result.state.due,
        result.state.interval,
        result.state.reps,
        result.state.lapses,
        reviewTime.toISOString(),
        timestamp,
        card.cardId,
      ]
    );

    db.run(
      `UPDATE cards SET card_type = ?, updated_at = ? WHERE id = ?`,
      [result.cardType, timestamp, card.cardId]
    );

    db.run(
      `INSERT INTO review_logs (id, card_id, rating, elapsed_ms, review_time, scheduled_days, actual_days, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reviewLogId,
        card.cardId,
        rating,
        elapsedMs,
        reviewTime.toISOString(),
        result.state.interval,
        actualDays,
        timestamp,
      ]
    );
  });

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

export function undoRating(snapshot: UndoSnapshot): void {
  const db = getDb();
  const timestamp = now();

  db.transaction(() => {
    db.run(
      `UPDATE card_states
       SET difficulty = ?, stability = ?, due = ?, interval = ?,
           reps = ?, lapses = ?, last_review = ?, updated_at = ?
       WHERE card_id = ?`,
      [
        snapshot.previousState.difficulty,
        snapshot.previousState.stability,
        snapshot.previousState.due,
        snapshot.previousState.interval,
        snapshot.previousState.reps,
        snapshot.previousState.lapses,
        snapshot.previousState.lastReview,
        timestamp,
        snapshot.cardId,
      ]
    );

    db.run(
      `UPDATE cards SET card_type = ?, updated_at = ? WHERE id = ?`,
      [snapshot.previousCardType, timestamp, snapshot.cardId]
    );

    db.run("DELETE FROM review_logs WHERE id = ?", [snapshot.reviewLogId]);
  });
}