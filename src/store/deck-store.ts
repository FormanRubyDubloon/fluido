import { create } from "zustand";
import {
  getAllDecksWithCounts,
  type DeckWithCounts,
} from "@/lib/queries";

interface DeckState {
  decks: DeckWithCounts[];
  loading: boolean;
  loadDecks: () => Promise<void>;
}

export type { DeckWithCounts };

export const useDeckStore = create<DeckState>((set) => ({
  decks: [],
  loading: false,

  loadDecks: async () => {
    set({ loading: true });
    try {
      const decks = await getAllDecksWithCounts();
      set({ decks, loading: false });
    } catch (e) {
      console.error("Failed to load decks:", e);
      set({ loading: false });
    }
  },
}));
