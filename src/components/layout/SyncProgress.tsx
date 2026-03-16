import { useSyncStore } from "@/store/sync-store";

export function SyncProgress() {
  const { syncing, stage, percent, done, error } = useSyncStore();

  if (!syncing) return null;

  const barColor = error
    ? "bg-red-500"
    : done
    ? "bg-green-500"
    : "bg-blue-500";

  const textColor = error
    ? "text-red-600 dark:text-red-400"
    : done
    ? "text-green-600 dark:text-green-400"
    : "text-gray-600 dark:text-gray-300";

  return (
    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2 mb-1.5">
        {error ? (
          <span className="text-red-500 text-xs">✕</span>
        ) : done ? (
          <span className="text-green-500 text-xs">✓</span>
        ) : (
          <span className="text-blue-500 text-xs animate-pulse">☁</span>
        )}
        <span className={`text-xs font-medium truncate ${textColor}`}>
          {stage}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto tabular-nums shrink-0">
          {percent}%
        </span>
      </div>
      <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}