import { create } from "zustand";
import { buildQueue, type QueueCard } from "@/srs/queue";
import { commitRating, undoRating, type UndoSnapshot } from "@/srs/rating";
import { getDb } from "@/platform/adapter";
import { getSetting } from "@/db/repository";
import { DEFAULT_LEARNING_STEPS, DEFAULT_RELEARNING_STEPS } from "@/lib/constants";
import type { Rating } from "@/srs/types";

interface SessionStats {
  cardsReviewed: number;
  ratingsGiven: Record<Rating, number>;
  startedAt: number;
}

interface ReviewState {
  activeDeckId: string | null;
  inSession: boolean;
  queue: QueueCard[];
  currentIndex: number;
  isRevealed: boolean;
  cardStartTime: number;
  sessionStats: SessionStats;
  lastUndo: UndoSnapshot | null;
  sessionComplete: boolean;

  startSession: (deckId: string) => void;
  endSession: () => void;
  revealCard: () => void;
  rateCard: (rating: Rating) => void;
  undo: () => void;
}

/**
 * Calculate how many cards ahead to re-insert a learning card.
 * Based on the learning step interval and an assumed ~8 seconds per card.
 */
function reinsertOffset(stepMinutes: number): number {
  const secondsPerCard = 8;
  const offset = Math.max(1, Math.round((stepMinutes * 60) / secondsPerCard));
  return offset;
}

/**
 * Get the current learning step for a card based on its reps count.
 * Returns the step interval in minutes, or null if the card has graduated.
 */
function getCurrentStepMinutes(
  cardType: string,
  reps: number
): number | null {
  if (cardType === "learning") {
    const steps =
      getSetting<number[]>("learning_steps") ?? DEFAULT_LEARNING_STEPS;
    // reps 1 = just did first review, so step index = reps - 1
    const stepIndex = Math.max(0, reps - 1);
    if (stepIndex < steps.length) {
      return steps[stepIndex]!;
    }
    return null; // graduated
  }

  if (cardType === "relearning") {
    const steps =
      getSetting<number[]>("relearning_steps") ?? DEFAULT_RELEARNING_STEPS;
    const stepIndex = 0; // relearning always uses first step
    if (stepIndex < steps.length) {
      return steps[stepIndex]!;
    }
    return null;
  }

  return null;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  activeDeckId: null,
  inSession: false,
  queue: [],
  currentIndex: 0,
  isRevealed: false,
  cardStartTime: Date.now(),
  sessionStats: {
    cardsReviewed: 0,
    ratingsGiven: { 1: 0, 2: 0, 3: 0, 4: 0 },
    startedAt: 0,
  },
  lastUndo: null,
  sessionComplete: false,

  startSession: (deckId) => {
    const queue = buildQueue(deckId);
    set({
      activeDeckId: deckId,
      inSession: true,
      queue,
      currentIndex: 0,
      isRevealed: false,
      cardStartTime: Date.now(),
      sessionStats: {
        cardsReviewed: 0,
        ratingsGiven: { 1: 0, 2: 0, 3: 0, 4: 0 },
        startedAt: Date.now(),
      },
      lastUndo: null,
      sessionComplete: false,
    });
  },

  endSession: () => {
    set({
      activeDeckId: null,
      inSession: false,
      queue: [],
      currentIndex: 0,
      isRevealed: false,
      lastUndo: null,
      sessionComplete: false,
    });
  },

  revealCard: () => {
    set({ isRevealed: true });
  },

  rateCard: (rating) => {
    const { queue, currentIndex, cardStartTime, sessionStats, activeDeckId } =
      get();
    const card = queue[currentIndex];
    if (!card || !activeDeckId) return;

    const elapsedMs = Date.now() - cardStartTime;
    const result = commitRating(card, rating, elapsedMs);

    getDb().persist();

    const newStats = {
      ...sessionStats,
      cardsReviewed: sessionStats.cardsReviewed + 1,
      ratingsGiven: {
        ...sessionStats.ratingsGiven,
        [rating]: sessionStats.ratingsGiven[rating] + 1,
      },
    };

    // Check if the card needs to re-enter the queue (learning/relearning steps)
    const newQueue = [...queue];
    const isLearning =
      result.newCardType === "learning" ||
      result.newCardType === "relearning";

    if (isLearning) {
      // Build an updated QueueCard with the new state
      const updatedCard: QueueCard = {
        ...card,
        cardType: result.newCardType,
        difficulty: result.newState.difficulty,
        stability: result.newState.stability,
        due: result.newState.due,
        interval: result.newState.interval,
        reps: result.newState.reps,
        lapses: result.newState.lapses,
        lastReview: new Date().toISOString(),
      };

      // Figure out where to re-insert based on the learning step
      const stepMinutes = getCurrentStepMinutes(
        result.newCardType,
        result.newState.reps
      );
      const offset = stepMinutes != null ? reinsertOffset(stepMinutes) : 3;

      // Insert after current position + offset, clamped to end of queue
      const insertAt = Math.min(
        currentIndex + 1 + offset,
        newQueue.length
      );
      newQueue.splice(insertAt, 0, updatedCard);
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= newQueue.length) {
      set({
        queue: newQueue,
        sessionStats: newStats,
        isRevealed: false,
        lastUndo: result.snapshot,
        sessionComplete: true,
      });
    } else {
      set({
        queue: newQueue,
        currentIndex: nextIndex,
        isRevealed: false,
        cardStartTime: Date.now(),
        sessionStats: newStats,
        lastUndo: result.snapshot,
      });
    }
  },

  undo: () => {
    const { lastUndo, currentIndex, sessionStats, sessionComplete } = get();
    if (!lastUndo) return;

    undoRating(lastUndo);
    getDb().persist();

    const prevIndex = sessionComplete ? currentIndex : currentIndex - 1;

    set({
      currentIndex: Math.max(0, prevIndex),
      isRevealed: false,
      cardStartTime: Date.now(),
      sessionStats: {
        ...sessionStats,
        cardsReviewed: Math.max(0, sessionStats.cardsReviewed - 1),
      },
      lastUndo: null,
      sessionComplete: false,
    });
  },
}));