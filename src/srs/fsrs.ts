import {
  fsrs,
  createEmptyCard,
  generatorParameters,
  type FSRS,
  type Card as FsrsCard,
  Rating as FsrsRating,
  State as FsrsState,
} from "ts-fsrs";
import type { Scheduler } from "./engine";
import type {
  CardSchedulingState,
  Rating,
  ScheduleResult,
  SchedulePreview,
} from "./types";
import { now } from "@/lib/time";

/**
 * Map Fluido ratings (1-4) to ts-fsrs Rating enum.
 */
function toFsrsRating(rating: Rating): FsrsRating {
  const map: Record<Rating, FsrsRating> = {
    1: FsrsRating.Again,
    2: FsrsRating.Hard,
    3: FsrsRating.Good,
    4: FsrsRating.Easy,
  };
  return map[rating];
}

/**
 * Map ts-fsrs State back to Fluido card_type strings.
 */
function toCardType(
  state: FsrsState
): "new" | "learning" | "review" | "relearning" {
  switch (state) {
    case FsrsState.New:
      return "new";
    case FsrsState.Learning:
      return "learning";
    case FsrsState.Review:
      return "review";
    case FsrsState.Relearning:
      return "relearning";
    default:
      return "new";
  }
}

/**
 * Convert Fluido scheduling state → ts-fsrs Card object.
 */
function toFsrsCard(state: CardSchedulingState): FsrsCard {
  const empty = createEmptyCard();
  return {
    ...empty,
    due: state.due ? new Date(state.due) : new Date(),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0, // Calculated by ts-fsrs from last_review
    scheduled_days: state.interval,
    reps: state.reps,
    lapses: state.lapses,
    state: state.reps === 0 ? FsrsState.New : FsrsState.Review,
    last_review: state.lastReview ? new Date(state.lastReview) : undefined,
  };
}

/**
 * Convert a ts-fsrs scheduling result back to Fluido's format.
 */
function fromFsrsResult(
  cardId: string,
  card: FsrsCard
): { state: CardSchedulingState; cardType: "new" | "learning" | "review" | "relearning" } {
  return {
    state: {
      cardId,
      difficulty: card.difficulty,
      stability: card.stability,
      due: card.due.toISOString(),
      interval: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
      lastReview: card.last_review?.toISOString() ?? null,
    },
    cardType: toCardType(card.state),
  };
}

export interface FsrsSchedulerOptions {
  /** Custom FSRS weights. null = use published defaults. */
  weights?: number[] | null;
  /** Target retention rate. Default 0.9. */
  requestRetention?: number;
}

/**
 * FSRS-5 Scheduler — wraps ts-fsrs.
 */
export function createFsrsScheduler(
  options: FsrsSchedulerOptions = {}
): Scheduler {
  const params = generatorParameters({
    w: options.weights ?? undefined,
    request_retention: options.requestRetention ?? 0.9,
  });
  const f: FSRS = fsrs(params);

  return {
    name: "FSRS-5",

    schedule(
      current: CardSchedulingState,
      rating: Rating,
      reviewTime: Date
    ): ScheduleResult {
      const card = toFsrsCard(current);
      const result = f.repeat(card, reviewTime);
      const scheduled = result[toFsrsRating(rating)];
      return fromFsrsResult(current.cardId, scheduled.card);
    },

    preview(
      current: CardSchedulingState,
      reviewTime: Date
    ): SchedulePreview {
      const card = toFsrsCard(current);
      const result = f.repeat(card, reviewTime);
      return {
        again: { interval: result[FsrsRating.Again].card.scheduled_days },
        hard: { interval: result[FsrsRating.Hard].card.scheduled_days },
        good: { interval: result[FsrsRating.Good].card.scheduled_days },
        easy: { interval: result[FsrsRating.Easy].card.scheduled_days },
      };
    },

    createNewCardState(cardId: string): CardSchedulingState {
      const card = createEmptyCard();
      return {
        cardId,
        difficulty: card.difficulty,
        stability: card.stability,
        due: now(),
        interval: 0,
        reps: 0,
        lapses: 0,
        lastReview: null,
      };
    },
  };
}
