import { useState, useEffect } from "react";
import { prefetchDeckMedia } from "@/sync/prefetch";

interface MediaPrefetchModalProps {
  deckId: string;
  onReady: () => void;
  onCancel: () => void;
}

export function MediaPrefetchModal({ deckId, onReady, onCancel }: MediaPrefetchModalProps) {
  const [stage, setStage] = useState("Checking media…");
  const [percent, setPercent] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const downloaded = await prefetchDeckMedia(deckId, (s, p) => {
          if (!cancelled) {
            setStage(s);
            setPercent(p);
          }
        });

        if (!cancelled) {
          if (downloaded > 0) {
            setStage(`Downloaded ${downloaded} media files`);
            setPercent(100);
            setDone(true);
            // Brief pause to show completion
            setTimeout(() => { if (!cancelled) onReady(); }, 800);
          } else {
            // No downloads needed — proceed immediately
            onReady();
          }
        }
      } catch {
        // Failed to prefetch — proceed anyway, lazy loading will handle it
        if (!cancelled) onReady();
      }
    })();

    return () => { cancelled = true; };
  }, [deckId, onReady]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-2 mb-3">
          {done ? (
            <span className="text-green-500 text-sm">✓</span>
          ) : (
            <span className="text-blue-500 text-sm animate-pulse">♫</span>
          )}
          <span className={`text-sm font-medium truncate ${
            done ? "text-green-600 dark:text-green-400" : "text-gray-700 dark:text-gray-300"
          }`}>
            {stage}
          </span>
        </div>

        <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              done ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
            {percent}%
          </span>
          <button
            onClick={onCancel}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}