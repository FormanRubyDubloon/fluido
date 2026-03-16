import { useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { fullPush } from "@/sync/index";

export interface SyncProgress {
  stage: string;
  percent: number;
}

export function SyncButton() {
  const user = useAuthStore((s) => s.user);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleSync = async () => {
    setSyncing(true);
    setDone(false);
    setError(null);
    setProgress({ stage: "Preparing…", percent: 0 });

    try {
      setProgress({ stage: "Uploading decks…", percent: 10 });
      await fullPush();
      setProgress({ stage: "Done!", percent: 100 });
      setDone(true);
      setTimeout(() => {
        setSyncing(false);
        setDone(false);
        setProgress(null);
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
      setTimeout(() => {
        setSyncing(false);
        setError(null);
        setProgress(null);
      }, 3000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center justify-center w-11 h-11 rounded-lg
                   text-gray-500 hover:text-gray-700 hover:bg-gray-200
                   dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800
                   transition-colors disabled:opacity-50"
        title="Sync to cloud"
      >
        <svg
          className={`w-5 h-5 ${syncing && !done ? "animate-spin" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>

      {syncing && progress && (
        <SyncPopup progress={progress} done={done} error={error} />
      )}
    </div>
  );
}

function SyncPopup({
  progress,
  done,
  error,
}: {
  progress: SyncProgress;
  done: boolean;
  error: string | null;
}) {
  return (
    <div className="absolute left-0 top-full mt-2 z-50 w-56 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        {error ? (
          <span className="text-red-500 text-sm">✕</span>
        ) : done ? (
          <span className="text-green-500 text-sm">✓</span>
        ) : (
          <span className="text-blue-500 text-sm animate-pulse">☁</span>
        )}
        <span className={`text-xs font-medium ${
          error ? "text-red-600 dark:text-red-400" :
          done ? "text-green-600 dark:text-green-400" :
          "text-gray-700 dark:text-gray-300"
        }`}>
          {error ?? progress.stage}
        </span>
      </div>

      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            error ? "bg-red-500" :
            done ? "bg-green-500" :
            "bg-blue-500"
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}