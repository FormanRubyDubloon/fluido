import { create } from "zustand";
import {
  getAllDecks,
  getDeckCardCounts,
  type DeckRow,
  type DeckCardCounts,
} from "@/db/repository";

export interface DeckWithCounts extends DeckRow {
  counts: DeckCardCounts;
}

interface DeckState {
  decks: DeckWithCounts[];
  loading: boolean;
  loadDecks: () => void;
}

export const useDeckStore = create<DeckState>((set) => ({
  decks: [],
  loading: false,

  loadDecks: () => {
    set({ loading: true });
    const rows = getAllDecks();
    const decks: DeckWithCounts[] = rows.map((row) => ({
      ...row,
      counts: getDeckCardCounts(row.id),
    }));
    set({ decks, loading: false });
  },
}));
