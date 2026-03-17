import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import { useSettingsStore } from "@/store/settings-store";
import { useDeckStore } from "@/store/deck-store";
import { useReviewStore } from "@/store/review-store";
import { useAuthStore } from "@/store/auth-store";
import { Shell } from "@/components/layout/Shell";
import { Sidebar } from "@/components/layout/Sidebar";
import { AnimatedContent } from "@/components/layout/AnimatedContent";
import { DeckBrowser } from "@/components/deck/DeckBrowser";
import { ReviewSession } from "@/components/review/ReviewSession";
import { StatsPage } from "@/components/stats/StatsPage";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { LoginPage } from "@/components/auth/LoginPage";
import { Button } from "@/components/ui/button";

type View = "decks" | "stats" | "settings";

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<View>("decks");

  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const newCardsPerDay = useSettingsStore((s) => s.newCardsPerDay);
  const loadDecks = useDeckStore((s) => s.loadDecks);
  const { inSession, startSession, loading: sessionLoading } = useReviewStore();
  const { user, loading: authLoading, initialize: initAuth } = useAuthStore();

  useEffect(() => {
    async function bootstrap() {
      try {
        await initAuth();
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
    loadSettings();
    loadDecks();
  }, [user, ready]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950 p-8">
        <div className="text-center max-w-md">
          <div className="text-red-500 mb-4"><Icon name="error" size={48} /></div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Failed to start</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }

  if (!ready || authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950">
        <div className="text-center">
          <div className="text-gray-400 mb-3"><Icon name="progress_activity" size={40} className="animate-spin" /></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuthenticated={() => { loadSettings(); loadDecks(); }} />;
  }

  return (
    <AnimatePresence mode="wait">
      {inSession ? (
        <motion.div
          key="review"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={darkMode ? "dark" : ""}
        >
          <div className="h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 p-4 md:p-6">
            <ReviewSession onEnd={() => { loadDecks(); setCurrentView("decks"); }} />
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <Shell
            sidebar={<Sidebar currentView={currentView} onNavigate={(v) => setCurrentView(v as View)} />}
          >
            <AnimatedContent viewKey={currentView}>
              {currentView === "decks" && (
                <DeckBrowser onStartReview={(deckId) => {
                  if (sessionLoading) return;
                  startSession(deckId, newCardsPerDay);
                }} />
              )}
              {currentView === "stats" && <StatsPage />}
              {currentView === "settings" && <SettingsPanel />}
            </AnimatedContent>
          </Shell>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
