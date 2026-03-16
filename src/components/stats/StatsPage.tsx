import { useEffect } from "react";
import { useStatsStore } from "@/store/stats-store";
import { useDeckStore } from "@/store/deck-store";
import { formatDuration } from "@/lib/time";

export function StatsPage() {
  const { today, cardCounts, last30Days, forecast, retention30d, selectedDeckId, loaded, loadStats, setSelectedDeck } =
    useStatsStore();
  const { decks } = useDeckStore();

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-4xl animate-pulse">⏳</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Statistics</h2>
        <select
          value={selectedDeckId ?? ""}
          onChange={(e) => setSelectedDeck(e.target.value || null)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                     bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500
                     min-w-0 max-w-[200px] truncate"
        >
          <option value="">All decks</option>
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </div>

      <section>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Today</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Reviewed" value={String(today.reviewed)} />
          <StatCard label="Cards seen" value={String(today.newSeen)} />
          <StatCard label="Avg time" value={today.avgTimeMs > 0 ? formatDuration(today.avgTimeMs) : "—"} />
          <StatCard label="Retention" value={today.reviewed > 0 ? `${today.retention}%` : "—"} />
        </div>
        {today.reviewed > 0 && (
          <div className="flex gap-4 mt-3 text-xs">
            <span className="text-red-500">Again: {today.ratingCounts.again}</span>
            <span className="text-orange-500">Hard: {today.ratingCounts.hard}</span>
            <span className="text-green-500">Good: {today.ratingCounts.good}</span>
            <span className="text-blue-500">Easy: {today.ratingCounts.easy}</span>
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Card States</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <StatCard label="New" value={String(cardCounts.new)} color="text-blue-500" />
          <StatCard label="Learning" value={String(cardCounts.learning)} color="text-orange-500" />
          <StatCard label="Young" value={String(cardCounts.young)} color="text-green-500" />
          <StatCard label="Mature" value={String(cardCounts.mature)} color="text-emerald-600" />
          <StatCard label="Suspended" value={String(cardCounts.suspended)} color="text-gray-400" />
          <StatCard label="Total" value={String(cardCounts.total)} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">30-Day Retention</h3>
        <div className="text-3xl font-semibold">{retention30d > 0 ? `${retention30d}%` : "—"}</div>
        <p className="text-xs text-gray-400 mt-1">Percentage of reviews rated Good or Easy</p>
      </section>

      {last30Days.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Reviews — Last 30 Days</h3>
          <BarChart data={last30Days} />
        </section>
      )}

      {forecast.some((f) => f.due > 0) && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Forecast — Next 30 Days</h3>
          <ForecastChart data={forecast} />
        </section>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800">
      <div className={`text-xl font-semibold tabular-nums ${color ?? ""}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function BarChart({ data }: { data: { date: string; again: number; hard: number; good: number; easy: number; total: number }[] }) {
  const maxTotal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((day) => {
        const height = (day.total / maxTotal) * 100;
        return (
          <div key={day.date} className="flex-1 flex flex-col justify-end min-w-0" title={`${day.date}: ${day.total} reviews`}>
            <div className="w-full rounded-t" style={{ height: `${Math.max(height, 2)}%` }}>
              <div className="flex flex-col h-full w-full rounded-t overflow-hidden">
                {day.easy > 0 && <div className="bg-blue-500" style={{ flex: day.easy / day.total }} />}
                {day.good > 0 && <div className="bg-green-500" style={{ flex: day.good / day.total }} />}
                {day.hard > 0 && <div className="bg-orange-500" style={{ flex: day.hard / day.total }} />}
                {day.again > 0 && <div className="bg-red-500" style={{ flex: day.again / day.total }} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ForecastChart({ data }: { data: { date: string; due: number }[] }) {
  const maxDue = Math.max(...data.map((d) => d.due), 1);

  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((day) => {
        const height = (day.due / maxDue) * 100;
        return (
          <div key={day.date} className="flex-1 min-w-0" title={`${day.date}: ${day.due} due`}>
            <div className="w-full bg-blue-400 dark:bg-blue-600 rounded-t" style={{ height: `${Math.max(height, 2)}%` }} />
          </div>
        );
      })}
    </div>
  );
}