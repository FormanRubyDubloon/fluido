import { create } from "zustand";
import { fullSync, fullPull, type ProgressCallback } from "@/sync/index";

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

    set({ syncing: true, done: false, error: null, stage: "Checking for updates…", percent: 0 });

    try {
      const onProgress: ProgressCallback = (stage, percent) => {
        set({ stage, percent });
      };

      const result = await fullSync(onProgress);

      let msg = "Done!";
      if (result) {
        const parts: string[] = [];
        if (result.pulled) parts.push("pulled latest");
        if (result.totalPushed > 0) parts.push(`pushed ${result.totalPushed.toLocaleString()} changes`);
        if (result.media > 0) parts.push(`${result.media} media`);
        if (parts.length === 0) parts.push("already up to date");
        msg = parts.join(", ");
        msg = msg.charAt(0).toUpperCase() + msg.slice(1);
      }

      set({ done: true, percent: 100, stage: msg });

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
          ? `Downloaded ${result.cards.toLocaleString()} cards, ${result.reviewLogs.toLocaleString()} reviews, ${result.media} media`
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