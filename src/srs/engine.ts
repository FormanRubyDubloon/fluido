import type {
  CardSchedulingState,
  Rating,
  ScheduleResult,
  SchedulePreview,
} from "./types";

/**
 * Scheduler interface.
 *
 * The MVP ships with FSRS only. The full product will support SM-2 and
 * potentially other algorithms. This interface is the seam — new schedulers
 * implement it and are selected via user settings.
 */
export interface Scheduler {
  /** Human-readable name (e.g. "FSRS-5", "SM-2") */
  readonly name: string;

  /**
   * Schedule a card after a review rating.
   * Returns the new state to persist and the updated card type.
   */
  schedule(
    current: CardSchedulingState,
    rating: Rating,
    reviewTime: Date
  ): ScheduleResult;

  /**
   * Preview what each rating would produce, without committing.
   * Used to display projected intervals on the rating buttons.
   */
  preview(
    current: CardSchedulingState,
    reviewTime: Date
  ): SchedulePreview;

  /**
   * Create the initial scheduling state for a brand-new card.
   */
  createNewCardState(cardId: string): CardSchedulingState;
}
