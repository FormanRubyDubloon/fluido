import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useReviewStore } from "@/store/review-store";
import { useSettingsStore } from "@/store/settings-store";
import { createFsrsScheduler } from "@/srs/fsrs";
import { renderCard } from "@/renderer/anki-template";
import { useKeyboard } from "@/hooks/useKeyboard";
import { Icon } from "@/components/ui/Icon";
import { SessionHeader } from "./SessionHeader";
import { FlipCard } from "./FlipCard";
import { RatingBar } from "./RatingBar";
import { SessionComplete } from "./SessionComplete";
import type { Rating, SchedulePreview } from "@/srs/types";

const FLASH_COLORS: Record<Rating, string> = {
  1: "bg-red-500/15",
  2: "bg-orange-500/15",
  3: "bg-green-500/15",
  4: "bg-blue-500/15",
};

interface ReviewSessionProps {
  onEnd: () => void;
}

export function ReviewSession({ onEnd }: ReviewSessionProps) {
  const {
    queue,
    currentIndex,
    isRevealed,
    sessionStats,
    sessionComplete,
    lastUndo,
    revealCard,
    rateCard,
    undo,
    endSession,
  } = useReviewStore();

  const simpleMode = useSettingsStore((s) => s.simpleRatingMode);

  const [frontHtml, setFrontHtml] = useState("");
  const [backHtml, setBackHtml] = useState("");
  const [cardCss, setCardCss] = useState("");
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<Rating | null>(null);

  const cardContainerRef = useRef<HTMLDivElement>(null);
  const audioUnlocked = useRef(false);

  const currentCard = queue[currentIndex];

  // Unlock audio on first user interaction (iOS requirement)
  useEffect(() => {
    const unlock = () => {
      if (audioUnlocked.current) return;
      const silence = new Audio("data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwEHAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjU0AAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwEHAAAAAAAAAAAAAAAAAAAA");
      silence.play().then(() => {
        audioUnlocked.current = true;
      }).catch(() => {});
    };

    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
  }, []);

  // Render card when it changes
  useEffect(() => {
    if (!currentCard || sessionComplete) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      const rendered = await renderCard(currentCard);
      if (cancelled) return;

      setFrontHtml(rendered.front);
      setBackHtml(rendered.back);
      setCardCss(rendered.css);

      const scheduler = createFsrsScheduler();
      const previewResult = scheduler.preview(
        {
          cardId: currentCard.cardId,
          difficulty: currentCard.difficulty,
          stability: currentCard.stability,
          due: currentCard.due,
          interval: currentCard.interval,
          reps: currentCard.reps,
          lapses: currentCard.lapses,
          lastReview: currentCard.lastReview,
        },
        new Date()
      );
      if (!cancelled) {
        setPreview(previewResult);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentCard, sessionComplete]);

  const playAudioInContainer = useCallback(() => {
    const container = cardContainerRef.current;
    if (!container) return;

    // Only play audio from the currently visible face
    const face = isRevealed ? "back" : "front";
    const faceEl = container.querySelector(`[data-face="${face}"]`);
    if (!faceEl) return;

    const audioElements = Array.from(
      faceEl.querySelectorAll<HTMLAudioElement>("audio[data-autoplay]")
    );
    playSequentially(audioElements);
  }, [isRevealed]);

  // Auto-play audio when card content changes
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(playAudioInContainer, 50);
    return () => clearTimeout(timer);
  }, [isRevealed, currentIndex, loading, playAudioInContainer]);

  const stopAudio = useCallback(() => {
    const container = cardContainerRef.current;
    if (!container) return;
    const audioElements = container.querySelectorAll<HTMLAudioElement>("audio");
    audioElements.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }, []);

  const replayAudio = useCallback(() => {
    const container = cardContainerRef.current;
    if (!container) return;
    const audioElements = Array.from(
      container.querySelectorAll<HTMLAudioElement>("audio")
    );
    audioElements.forEach((a) => { a.currentTime = 0; });
    playSequentially(audioElements);
  }, []);

  const handleFlip = useCallback(() => {
    if (!isRevealed) {
      stopAudio();
      revealCard();
      setTimeout(() => {
        const container = cardContainerRef.current;
        if (!container) return;
        // Play back-side audio after flip completes
        const backFace = container.querySelector('[data-face="back"]');
        if (!backFace) return;
        const audioElements = Array.from(
          backFace.querySelectorAll<HTMLAudioElement>("audio[data-autoplay]")
        );
        playSequentially(audioElements);
      }, 550);
    }
  }, [isRevealed, stopAudio, revealCard]);

  const handleRate = useCallback(
    (rating: Rating) => {
      if (!isRevealed) return;
      setFlash(rating);
      setTimeout(() => {
        setFlash(null);
        stopAudio();
        rateCard(rating);
        setTimeout(() => {
          const container = cardContainerRef.current;
          if (!container) return;
          // Play front-side audio of the next card
          const frontFace = container.querySelector('[data-face="front"]');
          if (!frontFace) return;
          const audioElements = Array.from(
            frontFace.querySelectorAll<HTMLAudioElement>("audio[data-autoplay]")
          );
          playSequentially(audioElements);
        }, 200);
      }, 150);
    },
    [isRevealed, stopAudio, rateCard]
  );

  const handleUndo = useCallback(() => {
    if (lastUndo) {
      stopAudio();
      undo();
    }
  }, [lastUndo, stopAudio, undo]);

  const handleEnd = useCallback(() => {
    stopAudio();
    endSession();
    onEnd();
  }, [stopAudio, endSession, onEnd]);

  useKeyboard({
    onFlip: handleFlip,
    onRate: handleRate,
    onUndo: handleUndo,
    onReplay: replayAudio,
    isRevealed,
    enabled: !sessionComplete && !loading,
    simpleMode,
  });

  if (sessionComplete) {
    return (
      <SessionComplete
        cardsReviewed={sessionStats.cardsReviewed}
        startedAt={sessionStats.startedAt}
        ratingsGiven={sessionStats.ratingsGiven}
        onDone={handleEnd}
      />
    );
  }

  const remaining = queue.slice(currentIndex);
  const newCount = remaining.filter((c) => c.cardType === "new").length;
  const learningCount = remaining.filter(
    (c) => c.cardType === "learning" || c.cardType === "relearning"
  ).length;
  const reviewCount = remaining.filter((c) => c.cardType === "review").length;

  if (loading || !currentCard) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size={40} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto">
      <SessionHeader
        newCount={newCount}
        learningCount={learningCount}
        reviewCount={reviewCount}
        onEnd={handleEnd}
      />

      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="w-full relative flex-1 md:flex-none flex flex-col min-h-0">
          {/* Flash overlay */}
          <motion.div
            className={`absolute inset-0 pointer-events-none z-10 rounded-2xl ${flash ? FLASH_COLORS[flash] : ""}`}
            animate={{ opacity: flash ? 1 : 0 }}
            transition={{ duration: flash ? 0.05 : 0.2 }}
          />

          <FlipCard
            ref={cardContainerRef}
            frontHtml={frontHtml}
            backHtml={backHtml}
            css={cardCss}
            isRevealed={isRevealed}
            onFlip={handleFlip}
          />
        </div>

        {!isRevealed && (
          <p className="mt-4 text-sm text-muted-foreground">
            Tap or press space to reveal
          </p>
        )}
      </div>

      <div className="py-4">
        {isRevealed && preview ? (
          <RatingBar preview={preview} onRate={handleRate} />
        ) : (
          <div className="h-[60px]" />
        )}

        {lastUndo && (
          <p className="text-center mt-2 text-xs text-muted-foreground">
            Ctrl+Z to undo
          </p>
        )}
      </div>
    </div>
  );
}

function playSequentially(elements: HTMLAudioElement[], index = 0): void {
  if (index >= elements.length) return;

  const current = elements[index]!;
  current.onended = () => {
    current.onended = null;
    playSequentially(elements, index + 1);
  };
  current.play().catch(() => {
    playSequentially(elements, index + 1);
  });
}
