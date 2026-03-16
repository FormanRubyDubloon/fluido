import { useState, useEffect } from "react";
import { checkFreshness } from "@/sync/freshness";
import { fullPull } from "@/sync/index";

interface SyncCheckModalProps {
  onReady: () => void;
}

export function SyncCheckModal({ onReady }: SyncCheckModalProps) {
  const [checking, setChecking] = useState(true);
  const [cloudNewer, setCloudNewer] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cloudTime, setCloudTime] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const result = await checkFreshness();
        if (result.status === "cloud-newer") {
          setCloudNewer(true);
          setCloudTime(result.cloudLatest);
        } else {
          // Local is newer or equal — proceed immediately
          onReady();
          return;
        }
      } catch {
        // Can't check — proceed with local data
        onReady();
        return;
      }
      setChecking(false);
    }
    check();
  }, [onReady]);

  const handleUseCloud = async () => {
    setSyncing(true);
    try {
      await fullPull();
      onReady();
    } catch (e) {
      console.error("Pull failed:", e);
      // Fall back to local
      onReady();
    }
  };

  const handleUseLocal = () => {
    onReady();
  };

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

        {syncing ? (
          <div className="text-center py-2">
            <span className="animate-spin inline-block mr-2">⏳</span>
            <span className="text-sm text-gray-500">Downloading…</span>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}