import { useState, useEffect, useCallback, useRef } from "react";
import { useReviewStore } from "@/store/review-store";
import { useSettingsStore } from "@/store/settings-store";
import { createFsrsScheduler } from "@/srs/fsrs";
import { renderCard } from "@/renderer/anki-template";
import { useKeyboard } from "@/hooks/useKeyboard";
import { SessionHeader } from "./SessionHeader";
import { CardFace } from "./CardFace";
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

  const currentCard = queue[currentIndex];

  // Render card when it changes
  useEffect(() => {
    if (!currentCard || sessionComplete) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
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

  // Play audio whenever the displayed content changes
  const playVisibleAudio = useCallback(() => {
    const container = cardContainerRef.current;
    if (!container) return;

    // Small delay to let the DOM update with new innerHTML
    requestAnimationFrame(() => {
      const audioElements = Array.from(
        container.querySelectorAll<HTMLAudioElement>("audio[data-autoplay]")
      );
      playSequentially(audioElements);
    });
  }, []);

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
      // Audio will be triggered by the useEffect below
    }
  }, [isRevealed, stopAudio, revealCard]);

  // Play audio when card is revealed or when a new card appears
  useEffect(() => {
    if (loading) return;
    playVisibleAudio();
  }, [isRevealed, currentIndex, loading, playVisibleAudio]);

  const handleRate = useCallback(
    (rating: Rating) => {
      if (!isRevealed) return;
      setFlash(rating);
      setTimeout(() => {
        setFlash(null);
        stopAudio();
        rateCard(rating);
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
        <div className="text-4xl animate-pulse">⏳</div>
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

      <div
        className="flex-1 flex flex-col items-center justify-center cursor-pointer select-none"
        onClick={!isRevealed ? handleFlip : undefined}
      >
        <div
          ref={cardContainerRef}
          className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden relative"
        >
          <div
            className={`absolute inset-0 pointer-events-none z-10 rounded-2xl transition-opacity duration-200 ease-in-out ${flash ? FLASH_COLORS[flash] + " opacity-100" : "opacity-0"}`}
          />

          {!isRevealed ? (
            <CardFace html={frontHtml} css={cardCss} />
          ) : (
            <CardFace html={backHtml} css={cardCss} />
          )}
        </div>
        
`````{/* Debug: scheduling state */}
        {import.meta.env.DEV && currentCard && (
          <details className="mt-2 text-[10px] text-gray-400 font-mono w-full px-2">
            <summary className="cursor-pointer">SRS debug</summary>
            <pre className="mt-1 whitespace-pre-wrap">
              {JSON.stringify({
                type: currentCard.cardType,
                reps: currentCard.reps,
                lapses: currentCard.lapses,
                interval: currentCard.interval,
                difficulty: Math.round(currentCard.difficulty * 100) / 100,
                stability: Math.round(currentCard.stability * 100) / 100,
                due: currentCard.due,
                preview: preview ? {
                  again: preview.again.interval,
                  hard: preview.hard.interval,
                  good: preview.good.interval,
                  easy: preview.easy.interval,
                } : null,
              }, null, 2)}
            </pre>
          </details>
        )}

        {!isRevealed && (
          <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">
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
          <p className="text-center mt-2 text-xs text-gray-400 dark:text-gray-500">
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