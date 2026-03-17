import { create } from "zustand";
import { buildQueue, type QueueCard } from "@/srs/queue";
import { computeRating, revertRating, type UndoSnapshot } from "@/srs/rating";
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
  loading: boolean;

  startSession: (deckId: string, newCardsPerDay: number) => Promise<void>;
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
  sessionStats: {
    cardsReviewed: 0,
    ratingsGiven: { 1: 0, 2: 0, 3: 0, 4: 0 },
    startedAt: 0,
  },
  lastUndo: null,
  sessionComplete: false,
  loading: false,

  startSession: async (deckId, newCardsPerDay) => {
    set({ loading: true });
    try {
      const queue = await buildQueue(deckId, newCardsPerDay);
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
        loading: false,
      });
    } catch (e) {
      console.error("Failed to start session:", e);
      set({ loading: false });
    }
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

    // Compute new state and persist (optimistic — fires Supabase write in background)
    const result = computeRating(card, rating, elapsedMs);

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
      set({
        sessionStats: newStats,
        isRevealed: false,
        lastUndo: result.snapshot,
        sessionComplete: true,
      });
    } else {
      set({
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

    // Revert in Supabase (async, non-blocking for UI)
    revertRating(lastUndo).catch((e) =>
      console.error("Failed to undo review:", e)
    );

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
