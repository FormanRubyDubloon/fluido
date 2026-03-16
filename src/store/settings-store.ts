import { create } from "zustand";
import { getSetting, setSetting } from "@/db/repository";
import { getDb } from "@/platform/adapter";
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

  loadSettings: () => void;
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

  loadSettings: () => {
    set({
      darkMode: getSetting<boolean>("dark_mode") ?? false,
      newCardsPerDay:
        getSetting<number>("new_cards_per_day") ?? DEFAULT_NEW_CARDS_PER_DAY,
      learningSteps:
        getSetting<number[]>("learning_steps") ?? DEFAULT_LEARNING_STEPS,
      relearningSteps:
        getSetting<number[]>("relearning_steps") ?? DEFAULT_RELEARNING_STEPS,
      fsrsWeights: getSetting<number[] | null>("fsrs_weights") ?? null,
      requestRetention: getSetting<number>("request_retention") ?? 0.9,
      simpleRatingMode: getSetting<boolean>("simple_rating_mode") ?? false,
      fontPreferences: getSetting<Record<string, string>>("font_preferences") ?? {},
      loaded: true,
    });
  },

  setDarkMode: (enabled) => {
    setSetting("dark_mode", enabled);
    getDb().persist();
    set({ darkMode: enabled });
  },

  setNewCardsPerDay: (count) => {
    setSetting("new_cards_per_day", count);
    getDb().persist();
    set({ newCardsPerDay: count });
  },

  setLearningSteps: (steps) => {
    setSetting("learning_steps", steps);
    getDb().persist();
    set({ learningSteps: steps });
  },

  setRelearningSteps: (steps) => {
    setSetting("relearning_steps", steps);
    getDb().persist();
    set({ relearningSteps: steps });
  },

  setFsrsWeights: (weights) => {
    setSetting("fsrs_weights", weights);
    getDb().persist();
    set({ fsrsWeights: weights });
  },

  setRequestRetention: (retention) => {
    setSetting("request_retention", retention);
    getDb().persist();
    set({ requestRetention: retention });
  },

  setSimpleRatingMode: (enabled) => {
    setSetting("simple_rating_mode", enabled);
    getDb().persist();
    set({ simpleRatingMode: enabled });
  },

  setFontForLanguage: (languageId, fontFamily) => {
    const prefs = { ...get().fontPreferences, [languageId]: fontFamily };
    setSetting("font_preferences", prefs);
    getDb().persist();
    set({ fontPreferences: prefs });
  },

  clearFontForLanguage: (languageId) => {
    const prefs = { ...get().fontPreferences };
    delete prefs[languageId];
    setSetting("font_preferences", prefs);
    getDb().persist();
    set({ fontPreferences: prefs });
  },
}));