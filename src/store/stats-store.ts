import { create } from "zustand";
import { getDb } from "@/platform/adapter";
import { today } from "@/lib/time";
import { MATURE_INTERVAL_DAYS } from "@/lib/constants";

interface TodayStats {
  reviewed: number;
  newSeen: number;
  avgTimeMs: number;
  retention: number;
  ratingCounts: { again: number; hard: number; good: number; easy: number };
}

interface CardCounts {
  new: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
  total: number;
}

interface DailyReviewPoint {
  date: string;
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

interface ForecastPoint {
  date: string;
  due: number;
}

interface StatsState {
  today: TodayStats;
  cardCounts: CardCounts;
  last30Days: DailyReviewPoint[];
  forecast: ForecastPoint[];
  retention30d: number;
  selectedDeckId: string | null;
  loaded: boolean;
  setSelectedDeck: (deckId: string | null) => void;
  loadStats: (deckId?: string | null) => void;
}

export const useStatsStore = create<StatsState>((set, get) => ({
  today: { reviewed: 0, newSeen: 0, avgTimeMs: 0, retention: 0, ratingCounts: { again: 0, hard: 0, good: 0, easy: 0 } },
  cardCounts: { new: 0, learning: 0, young: 0, mature: 0, suspended: 0, total: 0 },
  last30Days: [],
  forecast: [],
  retention30d: 0,
  selectedDeckId: null,
  loaded: false,

  setSelectedDeck: (deckId) => {
    set({ selectedDeckId: deckId });
    get().loadStats(deckId);
  },

  loadStats: (deckId) => {
    const db = getDb();
    const todayStr = today();
    const filterDeck = deckId ?? get().selectedDeckId;

    // SQL fragments for deck filtering
    const deckJoin = filterDeck
      ? " JOIN cards c_filter ON rl.card_id = c_filter.id AND c_filter.deck_id = ?"
      : "";
    const deckParam = filterDeck ? [filterDeck] : [];

    const cardWhere = filterDeck ? " AND c.deck_id = ?" : "";
    const cardWhereSimple = filterDeck ? " AND deck_id = ?" : "";

    // --- Today summary ---
    const todayLogs = db.exec<{ rating: number; elapsed_ms: number }>(
      `SELECT rl.rating, rl.elapsed_ms FROM review_logs rl${deckJoin}
       WHERE rl.review_time >= ? || 'T00:00:00.000Z'
       AND rl.review_time <= ? || 'T23:59:59.999Z'`,
      [...deckParam, todayStr, todayStr]
    );

    const reviewed = todayLogs.length;
    const avgTimeMs = reviewed > 0
      ? Math.round(todayLogs.reduce((sum, r) => sum + r.elapsed_ms, 0) / reviewed)
      : 0;

    const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const log of todayLogs) {
      if (log.rating === 1) ratingCounts.again++;
      else if (log.rating === 2) ratingCounts.hard++;
      else if (log.rating === 3) ratingCounts.good++;
      else if (log.rating === 4) ratingCounts.easy++;
    }

    const retention = reviewed > 0
      ? Math.round(((ratingCounts.good + ratingCounts.easy) / reviewed) * 100)
      : 0;

    const newSeenRows = db.exec<{ count: number }>(
      `SELECT COUNT(DISTINCT rl.card_id) as count FROM review_logs rl${deckJoin}
       WHERE rl.review_time >= ? || 'T00:00:00.000Z'
       AND rl.review_time <= ? || 'T23:59:59.999Z'`,
      [...deckParam, todayStr, todayStr]
    );
    const newSeen = newSeenRows[0]?.count ?? 0;

    // --- Card counts ---
    const countQuery = (where: string) => {
      const params = filterDeck ? [filterDeck] : [];
      return db.exec<{ c: number }>(`SELECT COUNT(*) as c FROM cards c ${where}`, params)[0]?.c ?? 0;
    };

    const counts = {
      new: countQuery(`WHERE c.card_type = 'new' AND c.suspended = 0${cardWhere}`),
      learning: countQuery(`WHERE c.card_type IN ('learning', 'relearning') AND c.suspended = 0${cardWhere}`),
      young: db.exec<{ c: number }>(
        `SELECT COUNT(*) as c FROM cards c JOIN card_states cs ON c.id = cs.card_id
         WHERE c.card_type = 'review' AND c.suspended = 0 AND cs.interval < ${MATURE_INTERVAL_DAYS}${cardWhere}`,
        filterDeck ? [filterDeck] : []
      )[0]?.c ?? 0,
      mature: db.exec<{ c: number }>(
        `SELECT COUNT(*) as c FROM cards c JOIN card_states cs ON c.id = cs.card_id
         WHERE c.card_type = 'review' AND c.suspended = 0 AND cs.interval >= ${MATURE_INTERVAL_DAYS}${cardWhere}`,
        filterDeck ? [filterDeck] : []
      )[0]?.c ?? 0,
      suspended: countQuery(`WHERE c.suspended = 1${cardWhere}`),
      total: countQuery(`WHERE 1=1${cardWhere}`),
    };

    // --- Last 30 days review history ---
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0]!;

    const dailyRows = db.exec<{ day: string; rating: number; cnt: number }>(
      `SELECT substr(rl.review_time, 1, 10) as day, rl.rating, COUNT(*) as cnt
       FROM review_logs rl${deckJoin}
       WHERE rl.review_time >= ? || 'T00:00:00.000Z'
       GROUP BY day, rl.rating
       ORDER BY day`,
      [...deckParam, thirtyDaysStr]
    );

    const dailyMap = new Map<string, DailyReviewPoint>();
    for (const row of dailyRows) {
      if (!dailyMap.has(row.day)) {
        dailyMap.set(row.day, { date: row.day, again: 0, hard: 0, good: 0, easy: 0, total: 0 });
      }
      const point = dailyMap.get(row.day)!;
      if (row.rating === 1) point.again += row.cnt;
      else if (row.rating === 2) point.hard += row.cnt;
      else if (row.rating === 3) point.good += row.cnt;
      else if (row.rating === 4) point.easy += row.cnt;
      point.total += row.cnt;
    }
    const last30Days = Array.from(dailyMap.values());

    // --- 30-day forecast ---
    const forecastPoints: ForecastPoint[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split("T")[0]!;
      const nextDateStr = new Date(d.getTime() + 86400000).toISOString().split("T")[0]!;

      const dueRows = db.exec<{ c: number }>(
        filterDeck
          ? `SELECT COUNT(*) as c FROM card_states cs
             JOIN cards c ON cs.card_id = c.id
             WHERE cs.due >= ? || 'T00:00:00.000Z' AND cs.due < ? || 'T00:00:00.000Z'
             AND c.deck_id = ?`
          : `SELECT COUNT(*) as c FROM card_states
             WHERE due >= ? || 'T00:00:00.000Z' AND due < ? || 'T00:00:00.000Z'`,
        filterDeck ? [dateStr, nextDateStr, filterDeck] : [dateStr, nextDateStr]
      );
      forecastPoints.push({ date: dateStr, due: dueRows[0]?.c ?? 0 });
    }

    // --- 30-day retention ---
    const retention30Rows = db.exec<{ total: number; passed: number }>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN rl.rating >= 3 THEN 1 ELSE 0 END) as passed
       FROM review_logs rl${deckJoin}
       WHERE rl.review_time >= ? || 'T00:00:00.000Z'`,
      [...deckParam, thirtyDaysStr]
    );
    const r30 = retention30Rows[0];
    const retention30d = r30 && r30.total > 0
      ? Math.round((r30.passed / r30.total) * 100)
      : 0;

    set({
      today: { reviewed, newSeen, avgTimeMs, retention, ratingCounts },
      cardCounts: counts,
      last30Days,
      forecast: forecastPoints,
      retention30d,
      loaded: true,
    });
  },
}));