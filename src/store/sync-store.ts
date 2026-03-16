import { create } from "zustand";
import { fullPush, fullPull, type ProgressCallback } from "@/sync/index";

interface SyncState {
  syncing: boolean;
  stage: string;
  percent: number;
  done: boolean;
  error: string | null;

  push: () => Promise<void>;
  pull: () => Promise<void>;
  reset: () => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  syncing: false,
  stage: "",
  percent: 0,
  done: false,
  error: null,

  push: async () => {
    if (get().syncing) return;

    set({ syncing: true, done: false, error: null, stage: "Starting…", percent: 0 });

    try {
      const onProgress: ProgressCallback = (stage, percent) => {
        set({ stage, percent });
      };

      const result = await fullPush(onProgress);

      set({
        done: true,
        percent: 100,
        stage: result
          ? `Synced ${result.cards.toLocaleString()} cards, ${result.reviewLogs.toLocaleString()} reviews, ${result.media.toLocaleString()} media`
          : "Done!",
      });

      setTimeout(() => {
        set({ syncing: false, done: false, stage: "", percent: 0 });
      }, 3000);
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Sync failed",
        stage: "Failed",
        percent: 100,
      });

      setTimeout(() => {
        set({ syncing: false, error: null, stage: "", percent: 0 });
      }, 4000);
    }
  },

  pull: async () => {
    if (get().syncing) return;

    set({ syncing: true, done: false, error: null, stage: "Downloading…", percent: 0 });

    try {
      const onProgress: ProgressCallback = (stage, percent) => {
        set({ stage, percent });
      };

      const result = await fullPull(onProgress);

      set({
        done: true,
        percent: 100,
        stage: result
          ? `Downloaded ${result.cards.toLocaleString()} cards, ${result.reviewLogs.toLocaleString()} reviews, ${result.media.toLocaleString()} media`
          : "Done!",
      });

      setTimeout(() => {
        set({ syncing: false, done: false, stage: "", percent: 0 });
      }, 3000);
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Download failed",
        stage: "Failed",
        percent: 100,
      });

      setTimeout(() => {
        set({ syncing: false, error: null, stage: "", percent: 0 });
      }, 4000);
    }
  },

  reset: () => {
    set({ syncing: false, done: false, error: null, stage: "", percent: 0 });
  },
}));