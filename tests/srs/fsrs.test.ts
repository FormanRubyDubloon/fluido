import { describe, it, expect } from "vitest";
import { fsrs, createEmptyCard, generatorParameters, Rating } from "ts-fsrs";

// Reference FSRS-5 instance to compare against
const params = generatorParameters({ request_retention: 0.9 });
const f = fsrs(params);

describe("FSRS-5 scheduling", () => {
  it("new card rated Good enters learning with correct state", () => {
    const card = createEmptyCard();
    const now = new Date("2024-01-01T12:00:00Z");

    const result = f.repeat(card, now);
    const good = result[Rating.Good];

    // After rating Good on a new card:
    // - Enters Learning state (scheduled_days = 0, due in minutes)
    // - Stability and difficulty are set
    expect(good.card.reps).toBe(1);
    expect(good.card.scheduled_days).toBeGreaterThanOrEqual(0);
    expect(good.card.stability).toBeGreaterThan(0);
    expect(good.card.difficulty).toBeGreaterThan(0);

    // Second Good should graduate to Review with a real interval
    const result2 = f.repeat(good.card, new Date(now.getTime() + 10 * 60 * 1000));
    const good2 = result2[Rating.Good];

    expect(good2.card.scheduled_days).toBeGreaterThan(0);
    expect(good2.card.reps).toBe(2);

    console.log("New → Good → Good:", {
      firstInterval: good.card.scheduled_days,
      secondInterval: good2.card.scheduled_days,
      stability: good2.card.stability,
      difficulty: good2.card.difficulty,
      state: good2.card.state,
    });
  });

  it("new card rated Again stays in learning", () => {
    const card = createEmptyCard();
    const now = new Date("2024-01-01T12:00:00Z");

    const result = f.repeat(card, now);
    const again = result[Rating.Again];

    // After Again on new card: short interval, stays in learning
    expect(again.card.scheduled_days).toBeLessThan(1);
    expect(again.card.reps).toBe(1);

    console.log("New → Again:", {
      interval: again.card.scheduled_days,
      stability: again.card.stability,
      difficulty: again.card.difficulty,
      state: again.card.state,
    });
  });

  it("review card intervals increase with consecutive Good ratings", () => {
    let card = createEmptyCard();
    let now = new Date("2024-01-01T12:00:00Z");

    const intervals: number[] = [];

    // Simulate 5 consecutive Good ratings
    for (let i = 0; i < 5; i++) {
      const result = f.repeat(card, now);
      const good = result[Rating.Good];
      intervals.push(good.card.scheduled_days);
      card = good.card;
      // Advance time by the scheduled interval
      now = new Date(now.getTime() + good.card.scheduled_days * 24 * 60 * 60 * 1000);
    }

    console.log("5x Good intervals:", intervals);

    // Each interval should be longer than the last
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]!);
    }
  });

  it("lapse resets interval", () => {
    let card = createEmptyCard();
    let now = new Date("2024-01-01T12:00:00Z");

    // Build up to a review card with 3 Good ratings
    for (let i = 0; i < 3; i++) {
      const result = f.repeat(card, now);
      card = result[Rating.Good].card;
      now = new Date(now.getTime() + card.scheduled_days * 24 * 60 * 60 * 1000);
    }

    const intervalBeforeLapse = card.scheduled_days;

    // Now rate Again (lapse)
    const result = f.repeat(card, now);
    const again = result[Rating.Again];

    console.log("Lapse:", {
      intervalBefore: intervalBeforeLapse,
      intervalAfter: again.card.scheduled_days,
      lapses: again.card.lapses,
      stability: again.card.stability,
    });

    // Interval should drop significantly
    expect(again.card.scheduled_days).toBeLessThan(intervalBeforeLapse);
    expect(again.card.lapses).toBe(1);
  });

  it("Easy gives longer interval than Good", () => {
    const card = createEmptyCard();
    const now = new Date("2024-01-01T12:00:00Z");

    const result = f.repeat(card, now);
    const good = result[Rating.Good];
    const easy = result[Rating.Easy];

    console.log("Good vs Easy:", {
      goodInterval: good.card.scheduled_days,
      easyInterval: easy.card.scheduled_days,
    });

    expect(easy.card.scheduled_days).toBeGreaterThan(good.card.scheduled_days);
  });

  it("Hard gives shorter interval than Good", () => {
    let card = createEmptyCard();
    let now = new Date("2024-01-01T12:00:00Z");

    // Graduate the card first
    const firstResult = f.repeat(card, now);
    card = firstResult[Rating.Good].card;
    now = new Date(now.getTime() + card.scheduled_days * 24 * 60 * 60 * 1000);

    // Now compare Hard vs Good on a review card
    const result = f.repeat(card, now);
    const hard = result[Rating.Hard];
    const good = result[Rating.Good];

    console.log("Hard vs Good (review):", {
      hardInterval: hard.card.scheduled_days,
      goodInterval: good.card.scheduled_days,
    });

    expect(hard.card.scheduled_days).toBeLessThanOrEqual(good.card.scheduled_days);
  });

  it("difficulty increases with Again, decreases with Easy", () => {
    const card = createEmptyCard();
    const now = new Date("2024-01-01T12:00:00Z");

    const result = f.repeat(card, now);
    const again = result[Rating.Again];
    const easy = result[Rating.Easy];

    console.log("Difficulty:", {
      again: again.card.difficulty,
      easy: easy.card.difficulty,
    });

    expect(again.card.difficulty).toBeGreaterThan(easy.card.difficulty);
  });

  it("full 20-card session simulation", () => {
    const now = new Date("2024-01-01T12:00:00Z");
    const ratings: Rating[] = [
      Rating.Good, Rating.Good, Rating.Again, Rating.Good, Rating.Easy,
      Rating.Hard, Rating.Good, Rating.Good, Rating.Again, Rating.Good,
      Rating.Good, Rating.Good, Rating.Easy, Rating.Good, Rating.Hard,
      Rating.Good, Rating.Again, Rating.Good, Rating.Good, Rating.Easy,
    ];

    const results: { rating: string; interval: number; difficulty: number; stability: number }[] = [];

    for (const rating of ratings) {
      const card = createEmptyCard();
      const result = f.repeat(card, now);
      const scheduled = result[rating];

      const ratingName = ["", "Again", "Hard", "Good", "Easy"][rating]!;
      results.push({
        rating: ratingName,
        interval: Math.round(scheduled.card.scheduled_days * 100) / 100,
        difficulty: Math.round(scheduled.card.difficulty * 100) / 100,
        stability: Math.round(scheduled.card.stability * 100) / 100,
      });
    }

    console.table(results);

    // All should have produced valid scheduling data
    for (const r of results) {
      expect(r.interval).toBeGreaterThanOrEqual(0);
      expect(r.difficulty).toBeGreaterThan(0);
      expect(r.stability).toBeGreaterThan(0);
    }
  });
});