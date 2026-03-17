import { useState, useEffect, useCallback } from "react";
import { checkFreshness } from "@/sync/freshness";
import { useSyncStore } from "@/store/sync-store";

interface SyncCheckModalProps {
  onReady: () => void;
  onCancel: () => void;
}

export function SyncCheckModal({ onReady }: SyncCheckModalProps) {
  const [checking, setChecking] = useState(true);
  const [cloudNewer, setCloudNewer] = useState(false);
  const [cloudTime, setCloudTime] = useState<string | null>(null);

  const { syncing, pull } = useSyncStore();

  const stableOnReady = useCallback(onReady, [onReady]);

  useEffect(() => {
    // If a sync is in progress, wait for it to finish
    if (syncing) return;

    async function check() {
      try {
        const result = await checkFreshness();
        if (result.status === "cloud-newer") {
          setCloudNewer(true);
          setCloudTime(result.cloudLatest);
          setChecking(false);
        } else {
          stableOnReady();
        }
      } catch {
        stableOnReady();
      }
    }
    check();
  }, [syncing, stableOnReady]);

  const handleUseCloud = async () => {
    await pull();
    stableOnReady();
  };

  const handleUseLocal = () => {
    stableOnReady();
  };

  // While a sync is running, show a waiting state
  if (syncing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full mx-4 text-center">
          <div className="text-3xl mb-3 animate-pulse">🔄</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sync in progress, please wait…</p>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full mx-4 text-center">
          <div className="text-3xl mb-3 animate-pulse">☁️</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Checking for updates…</p>
        </div>
      </div>
    );
  }

  if (!cloudNewer) return null;

  const formattedTime = cloudTime
    ? new Date(cloudTime).toLocaleString()
    : "unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold mb-2">Newer data available</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
          Your cloud data has more recent reviews than this device.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
          Last cloud review: {formattedTime}
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <button
              onClick={handleUseLocal}
              className="flex-1 px-4 py-3 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                         hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Use local
            </button>
            <button
              onClick={handleUseCloud}
              className="flex-1 px-4 py-3 text-sm rounded-lg bg-blue-600 text-white font-medium
                         hover:bg-blue-700 transition-colors"
            >
              Use cloud
            </button>
          </div>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-xs text-gray-400 dark:text-gray-500
                       hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}