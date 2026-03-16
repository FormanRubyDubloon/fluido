import { useEffect, useState } from "react";
import { initPlatform, getAdapter } from "@/platform/adapter";
import { createWebAdapter } from "@/platform/web";
import { initDatabase } from "@/db/init";
import { useSettingsStore } from "@/store/settings-store";
import { useDeckStore } from "@/store/deck-store";
import { useReviewStore } from "@/store/review-store";
import { useAuthStore } from "@/store/auth-store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cloudHasData, localHasData } from "@/sync/index";
import { Shell } from "@/components/layout/Shell";
import { Sidebar } from "@/components/layout/Sidebar";
import { PersistenceBanner } from "@/components/layout/PersistenceBanner";
import { DeckBrowser } from "@/components/deck/DeckBrowser";
import { ReviewSession } from "@/components/review/ReviewSession";
import { StatsPage } from "@/components/stats/StatsPage";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { LoginPage } from "@/components/auth/LoginPage";
import { SyncBanner } from "@/components/auth/SyncBanner";

type View = "decks" | "stats" | "settings";

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>("decks");
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const [syncState, setSyncState] = useState<{ hasLocal: boolean; hasCloud: boolean }>({
    hasLocal: false,
    hasCloud: false,
  });

  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const loadDecks = useDeckStore((s) => s.loadDecks);
  const { inSession, startSession } = useReviewStore();
  const { user, loading: authLoading, initialize: initAuth } = useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        const adapter = createWebAdapter();
        initPlatform(adapter);
        const { db } = getAdapter();
        await db.open();
        await initDatabase();
        loadSettings();
        loadDecks();

        if (isSupabaseConfigured()) {
          await initAuth();
        }

        setReady(true);
      } catch (e) {
        console.error("Failed to initialise app:", e);
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!user || !ready) return;

    async function checkSync() {
      const hasLocal = localHasData();
      const hasCloud = await cloudHasData();
      setSyncState({ hasLocal, hasCloud });
      if (hasLocal || hasCloud) {
        setShowSyncBanner(true);
      }
    }
    checkSync();
  }, [user, ready]);

  const handleSyncComplete = () => {
    setShowSyncBanner(false);
    loadDecks();
    loadSettings();
  };

  const handleAuthenticated = async () => {
    const hasLocal = localHasData();
    const hasCloud = await cloudHasData();
    setSyncState({ hasLocal, hasCloud });
    if (hasLocal || hasCloud) {
      setShowSyncBanner(true);
    }
    loadDecks();
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950 p-8">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">😵</div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Failed to start</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">Reload</button>
        </div>
      </div>
    );
  }

  if (!ready || authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">⏳</div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (isSupabaseConfigured() && !user) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  if (inSession) {
    return (
      <div className={darkMode ? "dark" : ""}>
        <div className="h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 p-4 md:p-6">
          <ReviewSession onEnd={() => { loadDecks(); setCurrentView("decks"); }} />
        </div>
      </div>
    );
  }

  return (
    <>
      {showSyncBanner && (
        <SyncBanner
          hasLocalData={syncState.hasLocal}
          hasCloudData={syncState.hasCloud}
          onSyncComplete={handleSyncComplete}
        />
      )}
      {!showSyncBanner && <PersistenceBanner />}
      <Shell
        sidebar={<Sidebar currentView={currentView} onNavigate={(v) => setCurrentView(v as View)} />}
      >
        {currentView === "decks" && <DeckBrowser onStartReview={(deckId) => startSession(deckId)} />}
        {currentView === "stats" && <StatsPage />}
        {currentView === "settings" && <SettingsPanel />}
      </Shell>
    </>
  );
}