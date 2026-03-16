/**
 * FSRS rating values.
 * 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
 */
export type Rating = 1 | 2 | 3 | 4;

export const RATING_LABELS: Record<Rating, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

/**
 * Card scheduling state — mirrors the card_states table.
 */
export interface CardSchedulingState {
  cardId: string;
  difficulty: number;
  stability: number;
  due: string; // ISO 8601
  interval: number; // days
  reps: number;
  lapses: number;
  lastReview: string | null;
}

/**
 * The result of scheduling a card after a rating.
 */
export interface ScheduleResult {
  /** Updated scheduling state to write to card_states */
  state: CardSchedulingState;
  /** The new card_type value */
  cardType: "new" | "learning" | "review" | "relearning";
}

/**
 * Preview of what each rating would produce — used to show
 * projected intervals on the rating buttons.
 */
export interface SchedulePreview {
  again: { interval: number };
  hard: { interval: number };
  good: { interval: number };
  easy: { interval: number };
}
