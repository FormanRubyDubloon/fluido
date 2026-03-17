import { useState } from "react";
import { fullSync, fullPull, type SyncResult } from "@/sync/index";

interface SyncBannerProps {
  hasLocalData: boolean;
  hasCloudData: boolean;
  onSyncComplete: () => void;
}

export function SyncBanner({
  hasLocalData,
  hasCloudData,
  onSyncComplete,
}: SyncBannerProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePush = async () => {
    setSyncing(true);
    setError(null);
    try {
      const r = await fullSync();
      setResult(r);
      setTimeout(onSyncComplete, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push failed");
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    setSyncing(true);
    setError(null);
    try {
      const r = await fullPull();
      setResult(r);
      setTimeout(onSyncComplete, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setSyncing(false);
    }
  };

  if (result) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-950/50 border-b border-green-200 dark:border-green-800 text-sm">
        <span className="shrink-0">✅</span>
        <p className="flex-1 text-green-800 dark:text-green-200">
          Synced {result.cards} cards, {result.reviewLogs} reviews, {result.media} media files.
        </p>
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800 text-sm">
        <span className="shrink-0 animate-spin">⏳</span>
        <p className="flex-1 text-blue-800 dark:text-blue-200">
          Syncing your data…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-800 text-sm">
        <span className="shrink-0">❌</span>
        <p className="flex-1 text-red-800 dark:text-red-200">{error}</p>
        <button
          onClick={onSyncComplete}
          className="shrink-0 px-3 py-2 rounded-md text-red-600 dark:text-red-400
                     hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (hasLocalData && hasCloudData) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 text-sm flex-wrap">
        <span className="shrink-0">🔄</span>
        <p className="flex-1 text-amber-800 dark:text-amber-200">
          You have data on this device and in the cloud. Which do you want to keep?
        </p>
        <button
          onClick={handlePull}
          className="shrink-0 px-3 py-2 rounded-md bg-blue-600 text-white font-medium
                     hover:bg-blue-700 transition-colors"
        >
          Use cloud data
        </button>
        <button
          onClick={handlePush}
          className="shrink-0 px-3 py-2 rounded-md bg-amber-200 dark:bg-amber-800
                     text-amber-900 dark:text-amber-100 font-medium
                     hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
        >
          Upload local data
        </button>
      </div>
    );
  }

  if (hasLocalData && !hasCloudData) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800 text-sm">
        <span className="shrink-0">☁️</span>
        <p className="flex-1 text-blue-800 dark:text-blue-200">
          Upload your local data to the cloud for cross-device sync?
        </p>
        <button
          onClick={handlePush}
          className="shrink-0 px-3 py-2 rounded-md bg-blue-600 text-white font-medium
                     hover:bg-blue-700 transition-colors"
        >
          Upload
        </button>
        <button
          onClick={onSyncComplete}
          className="shrink-0 px-3 py-2 rounded-md text-blue-600 dark:text-blue-400
                     hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
        >
          Skip
        </button>
      </div>
    );
  }

  if (!hasLocalData && hasCloudData) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800 text-sm">
        <span className="shrink-0">☁️</span>
        <p className="flex-1 text-blue-800 dark:text-blue-200">
          Found your data in the cloud. Download it to this device?
        </p>
        <button
          onClick={handlePull}
          className="shrink-0 px-3 py-2 rounded-md bg-blue-600 text-white font-medium
                     hover:bg-blue-700 transition-colors"
        >
          Download
        </button>
        <button
          onClick={onSyncComplete}
          className="shrink-0 px-3 py-2 rounded-md text-blue-600 dark:text-blue-400
                     hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
        >
          Skip
        </button>
      </div>
    );
  }

  return null;
}