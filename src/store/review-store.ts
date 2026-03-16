import { create } from "zustand";
import { buildQueue, type QueueCard } from "@/srs/queue";
import { commitRating, undoRating, type UndoSnapshot } from "@/srs/rating";
import { getDb } from "@/platform/adapter";
import { syncCardReview } from "@/sync/index";
import type { Rating } from "@/srs/types";

interface SessionStats {
  cardsReviewed: number;
  ratingsGiven: Record<Rating, number>;
  startedAt: number; // timestamp ms
}

interface ReviewState {
  activeDeckId: string | null;
  inSession: boolean;
  queue: QueueCard[];
  currentIndex: number;
  isRevealed: boolean;
  cardStartTime: number; // when current card was shown
  sessionStats: SessionStats;
  lastUndo: UndoSnapshot | null;
  /** Set to true once session completes */
  sessionComplete: boolean;

  startSession: (deckId: string) => void;
  endSession: () => void;
  revealCard: () => void;
  rateCard: (rating: Rating) => void;
  undo: () => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  activeDeckId: null,
  inSession: false,
  queue: [],
  currentIndex: 0,
  isRevealed: false,
  cardStartTime: Date.now(),
  sessionStats: { cardsReviewed: 0, ratingsGiven: { 1: 0, 2: 0, 3: 0, 4: 0 }, startedAt: 0 },
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
    const { queue, currentIndex, cardStartTime, sessionStats, activeDeckId } = get();
    const card = queue[currentIndex];
    if (!card || !activeDeckId) return;

    const elapsedMs = Date.now() - cardStartTime;

    // Commit to database
    const result = commitRating(card, rating, elapsedMs);
    const snapshot = result.snapshot;

    // Persist
    getDb().persist();

    // Background sync to cloud (non-blocking)
syncCardReview(card.cardId, result.snapshot.reviewLogId);

    // Update stats
    const newStats = {
      ...sessionStats,
      cardsReviewed: sessionStats.cardsReviewed + 1,
      ratingsGiven: {
        ...sessionStats.ratingsGiven,
        [rating]: sessionStats.ratingsGiven[rating] + 1,
      },
    };

    const nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) {
      // Session complete
      set({
        sessionStats: newStats,
        isRevealed: false,
        lastUndo: snapshot,
        sessionComplete: true,
      });
    } else {
      set({
        currentIndex: nextIndex,
        isRevealed: false,
        cardStartTime: Date.now(),
        sessionStats: newStats,
        lastUndo: snapshot,
      });
    }
  },

  undo: () => {
    const { lastUndo, currentIndex, sessionStats, sessionComplete } = get();
    if (!lastUndo) return;

    // Revert the database
    undoRating(lastUndo);
    getDb().persist();

    // Step back
    const prevIndex = sessionComplete ? currentIndex : currentIndex - 1;

    // Figure out which rating to decrement
    // We need to look at the review log we just deleted — rating is in the snapshot
    // Actually we don't store the rating in the snapshot. Just decrement total.
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
