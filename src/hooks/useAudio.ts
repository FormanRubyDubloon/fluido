import { useCallback, useRef } from "react";

export function useAudio() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const playAudio = useCallback((container: HTMLDivElement | null) => {
    if (!container) return;
    containerRef.current = container;

    const audioElements = Array.from(
      container.querySelectorAll<HTMLAudioElement>("audio[data-autoplay]")
    );
    playSequentially(audioElements);
  }, []);

  const replayAudio = useCallback(() => {
    if (!containerRef.current) return;

    const audioElements = Array.from(
      containerRef.current.querySelectorAll<HTMLAudioElement>("audio")
    );
    audioElements.forEach((audio) => {
      audio.currentTime = 0;
    });
    playSequentially(audioElements);
  }, []);

  const stopAudio = useCallback(() => {
    if (!containerRef.current) return;

    const audioElements = containerRef.current.querySelectorAll<HTMLAudioElement>("audio");
    audioElements.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }, []);

  const hasAudio = useCallback((): boolean => {
    if (!containerRef.current) return false;
    return containerRef.current.querySelectorAll("audio").length > 0;
  }, []);

  return { playAudio, replayAudio, stopAudio, hasAudio };
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