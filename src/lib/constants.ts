/** Default number of new cards introduced per day */
export const DEFAULT_NEW_CARDS_PER_DAY = 20;

/** Default learning steps for new cards (in minutes) */
export const DEFAULT_LEARNING_STEPS = [1, 10];

/** Default relearning steps for lapsed cards (in minutes) */
export const DEFAULT_RELEARNING_STEPS = [10];

/** Threshold in days: cards with interval < this are "young", >= are "mature" */
export const MATURE_INTERVAL_DAYS = 21;
