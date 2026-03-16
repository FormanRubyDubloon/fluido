import { useEffect } from "react";
import type { Rating } from "@/srs/types";

interface KeyboardActions {
  onFlip?: () => void;
  onRate?: (rating: Rating) => void;
  onUndo?: () => void;
  onReplay?: () => void;
  isRevealed: boolean;
  enabled: boolean;
  simpleMode: boolean;
}

export function useKeyboard({
  onFlip,
  onRate,
  onUndo,
  onReplay,
  isRevealed,
  enabled,
  simpleMode,
}: KeyboardActions) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Ctrl/Cmd + Z → Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        onUndo?.();
        return;
      }

      // Escape → Again (when revealed)
      if (e.key === "Escape" && isRevealed) {
        e.preventDefault();
        onRate?.(1);
        return;
      }

      // Space → Flip (if not revealed) or Good (if revealed)
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (!isRevealed) {
          onFlip?.();
        } else {
          onRate?.(3); // Good
        }
        return;
      }

      // Number keys (only when revealed)
      if (isRevealed) {
        if (simpleMode) {
          // Simple mode: 1 = Again, 2 = Good
          if (e.key === "1") { e.preventDefault(); onRate?.(1); return; }
          if (e.key === "2") { e.preventDefault(); onRate?.(3); return; }
        } else {
          // Full mode: 1-4
          if (e.key === "1") { e.preventDefault(); onRate?.(1); return; }
          if (e.key === "2") { e.preventDefault(); onRate?.(2); return; }
          if (e.key === "3") { e.preventDefault(); onRate?.(3); return; }
          if (e.key === "4") { e.preventDefault(); onRate?.(4); return; }
        }
      }

      // R → Replay audio
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onReplay?.();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, isRevealed, simpleMode, onFlip, onRate, onUndo, onReplay]);
}