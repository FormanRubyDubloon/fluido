import { useState, useEffect } from "react";
import { getAdapter } from "@/platform/adapter";

export function PersistenceBanner() {
  const [status, setStatus] = useState<{
    linked: boolean;
    name: string | null;
    needsPermission: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    const adapter = getAdapter();
    if (adapter.platform !== "web") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adapter.db as any;
    if (typeof db.getSaveFileStatus === "function") {
      const s = await db.getSaveFileStatus();
      setStatus(s);
    }
  }

  async function handleLink() {
    const adapter = getAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adapter.db as any;
    if (typeof db.linkSaveFile === "function") {
      try {
        await db.linkSaveFile();
        await checkStatus();
      } catch {
        // User cancelled the picker
      }
    }
  }

  async function handleGrantPermission() {
    const adapter = getAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adapter.db as any;
    if (typeof db.requestFilePermission === "function") {
      const granted = await db.requestFilePermission();
      if (granted) {
        await checkStatus();
        window.location.reload(); // Reload to use the restored DB
      }
    }
  }

  async function handleUnlink() {
    const adapter = getAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adapter.db as any;
    if (typeof db.unlinkSaveFile === "function") {
      await db.unlinkSaveFile();
      await checkStatus();
    }
  }

  if (dismissed || !status) return null;

  // Linked and needs permission re-grant
  if (status.linked && status.needsPermission) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-800 text-sm">
        <span className="shrink-0">💾</span>
        <p className="flex-1 text-blue-800 dark:text-blue-200">
          Save file <strong>{status.name}</strong> detected. Grant access to restore your data.
        </p>
        <button
          onClick={handleGrantPermission}
          className="shrink-0 px-3 py-2 rounded-md bg-blue-600 text-white font-medium
                     hover:bg-blue-700 transition-colors"
        >
          Grant access
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 px-3 py-2 rounded-md text-blue-600 dark:text-blue-400
                     hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
        >
          Skip
        </button>
      </div>
    );
  }

  // Linked and working
  if (status.linked && !status.needsPermission) {
    // Don't show a banner — everything is fine
    return null;
  }

  // Not linked — offer to set up
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800 text-sm">
      <span className="shrink-0">⚠️</span>
      <p className="flex-1 text-amber-800 dark:text-amber-200">
        Your data is stored in this browser and could be cleared. Link a save file to keep your progress safe.
      </p>
      <button
        onClick={handleLink}
        className="shrink-0 px-3 py-2 rounded-md bg-amber-200 dark:bg-amber-800
                   text-amber-900 dark:text-amber-100 font-medium
                   hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
      >
        Link save file
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 px-3 py-2 rounded-md text-amber-600 dark:text-amber-400
                   hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
      >
        Dismiss
      </button>
    </div>
  );
}