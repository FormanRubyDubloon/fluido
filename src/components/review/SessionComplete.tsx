import { formatDuration } from "@/lib/time";
import { Icon } from "@/components/ui/Icon";

interface SessionCompleteProps {
  cardsReviewed: number;
  startedAt: number;
  ratingsGiven: Record<number, number>;
  onDone: () => void;
}

export function SessionComplete({
  cardsReviewed,
  startedAt,
  ratingsGiven,
  onDone,
}: SessionCompleteProps) {
  const elapsed = Date.now() - startedAt;
  const goodOrEasy = (ratingsGiven[3] ?? 0) + (ratingsGiven[4] ?? 0);
  const retention = cardsReviewed > 0
    ? Math.round((goodOrEasy / cardsReviewed) * 100)
    : 0;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
      <div className="text-blue-600 mb-4"><Icon name="celebration" size={48} /></div>
      <h2 className="text-2xl font-semibold mb-2">Session Complete</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Nice work! Here&apos;s how you did.
      </p>

      <div className="w-full space-y-3 mb-8">
        <StatRow label="Cards reviewed" value={String(cardsReviewed)} />
        <StatRow label="Time" value={formatDuration(elapsed)} />
        <StatRow label="Retention" value={`${retention}%`} />
        <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-800">
          <span className="text-red-500">Again: {ratingsGiven[1] ?? 0}</span>
          <span className="text-orange-500">Hard: {ratingsGiven[2] ?? 0}</span>
          <span className="text-green-500">Good: {ratingsGiven[3] ?? 0}</span>
          <span className="text-blue-500">Easy: {ratingsGiven[4] ?? 0}</span>
        </div>
      </div>

      <button
        onClick={onDone}
        className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium
                   hover:bg-blue-700 active:bg-blue-800 transition-colors"
      >
        Back to Decks
      </button>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}