import { create } from "zustand";
import { getSettings, setSetting } from "@/lib/queries";
import {
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_LEARNING_STEPS,
  DEFAULT_RELEARNING_STEPS,
} from "@/lib/constants";

interface SettingsState {
  darkMode: boolean;
  newCardsPerDay: number;
  learningSteps: number[];
  relearningSteps: number[];
  fsrsWeights: number[] | null;
  requestRetention: number;
  simpleRatingMode: boolean;
  fontPreferences: Record<string, string>;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  setDarkMode: (enabled: boolean) => void;
  setNewCardsPerDay: (count: number) => void;
  setLearningSteps: (steps: number[]) => void;
  setRelearningSteps: (steps: number[]) => void;
  setFsrsWeights: (weights: number[] | null) => void;
  setRequestRetention: (retention: number) => void;
  setSimpleRatingMode: (enabled: boolean) => void;
  setFontForLanguage: (languageId: string, fontFamily: string) => void;
  clearFontForLanguage: (languageId: string) => void;
}

function persist(key: string, value: unknown) {
  setSetting(key, value).catch((e) =>
    console.error("Failed to save setting:", e)
  );
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  darkMode: false,
  newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
  learningSteps: DEFAULT_LEARNING_STEPS,
  relearningSteps: DEFAULT_RELEARNING_STEPS,
  fsrsWeights: null,
  requestRetention: 0.9,
  simpleRatingMode: false,
  fontPreferences: {},
  loaded: false,

  loadSettings: async () => {
    try {
      const s = await getSettings();
      set({
        darkMode: (s.dark_mode as boolean) ?? false,
        newCardsPerDay:
          (s.new_cards_per_day as number) ?? DEFAULT_NEW_CARDS_PER_DAY,
        learningSteps:
          (s.learning_steps as number[]) ?? DEFAULT_LEARNING_STEPS,
        relearningSteps:
          (s.relearning_steps as number[]) ?? DEFAULT_RELEARNING_STEPS,
        fsrsWeights: (s.fsrs_weights as number[] | null) ?? null,
        requestRetention: (s.request_retention as number) ?? 0.9,
        simpleRatingMode: (s.simple_rating_mode as boolean) ?? false,
        fontPreferences:
          (s.font_preferences as Record<string, string>) ?? {},
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setDarkMode: (enabled) => {
    persist("dark_mode", enabled);
    set({ darkMode: enabled });
  },

  setNewCardsPerDay: (count) => {
    persist("new_cards_per_day", count);
    set({ newCardsPerDay: count });
  },

  setLearningSteps: (steps) => {
    persist("learning_steps", steps);
    set({ learningSteps: steps });
  },

  setRelearningSteps: (steps) => {
    persist("relearning_steps", steps);
    set({ relearningSteps: steps });
  },

  setFsrsWeights: (weights) => {
    persist("fsrs_weights", weights);
    set({ fsrsWeights: weights });
  },

  setRequestRetention: (retention) => {
    persist("request_retention", retention);
    set({ requestRetention: retention });
  },

  setSimpleRatingMode: (enabled) => {
    persist("simple_rating_mode", enabled);
    set({ simpleRatingMode: enabled });
  },

  setFontForLanguage: (languageId, fontFamily) => {
    const prefs = { ...get().fontPreferences, [languageId]: fontFamily };
    persist("font_preferences", prefs);
    set({ fontPreferences: prefs });
  },

  clearFontForLanguage: (languageId) => {
    const prefs = { ...get().fontPreferences };
    delete prefs[languageId];
    persist("font_preferences", prefs);
    set({ fontPreferences: prefs });
  },
}));
