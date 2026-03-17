import { create } from "zustand";
import {
  getStats,
  type TodayStats,
  type CardCounts,
  type DailyReviewPoint,
  type ForecastPoint,
} from "@/lib/queries";

interface StatsState {
  today: TodayStats;
  cardCounts: CardCounts;
  last30Days: DailyReviewPoint[];
  forecast: ForecastPoint[];
  retention30d: number;
  selectedDeckId: string | null;
  loaded: boolean;
  setSelectedDeck: (deckId: string | null) => void;
  loadStats: (deckId?: string | null) => Promise<void>;
}

export const useStatsStore = create<StatsState>((set, get) => ({
  today: {
    reviewed: 0,
    newSeen: 0,
    avgTimeMs: 0,
    retention: 0,
    ratingCounts: { again: 0, hard: 0, good: 0, easy: 0 },
  },
  cardCounts: {
    new: 0,
    learning: 0,
    young: 0,
    mature: 0,
    suspended: 0,
    total: 0,
  },
  last30Days: [],
  forecast: [],
  retention30d: 0,
  selectedDeckId: null,
  loaded: false,

  setSelectedDeck: (deckId) => {
    set({ selectedDeckId: deckId });
    get().loadStats(deckId);
  },

  loadStats: async (deckId) => {
    try {
      const filterDeck = deckId ?? get().selectedDeckId;
      const data = await getStats(filterDeck);
      set({
        today: data.today,
        cardCounts: data.cardCounts,
        last30Days: data.last30Days,
        forecast: data.forecast,
        retention30d: data.retention30d,
        loaded: true,
      });
    } catch (e) {
      console.error("Failed to load stats:", e);
      set({ loaded: true });
    }
  },
}));
