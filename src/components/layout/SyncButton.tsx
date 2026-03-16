import { useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { fullPush } from "@/sync/index";

export function SyncButton() {
  const user = useAuthStore((s) => s.user);
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);

  if (!user) return null;

  const handleSync = async () => {
    setSyncing(true);
    setDone(false);
    try {
      await fullPush();
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="flex items-center justify-center w-11 h-11 rounded-lg
                 text-gray-500 hover:text-gray-700 hover:bg-gray-200
                 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800
                 transition-colors disabled:opacity-50"
      title={done ? "Synced!" : syncing ? "Syncing…" : "Sync to cloud"}
    >
      {done ? (
        <span className="text-green-500">✓</span>
      ) : (
        <svg
          className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`}
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
      )}
    </button>
  );
}