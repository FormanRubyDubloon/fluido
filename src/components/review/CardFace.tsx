import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/store/settings-store";

interface CardFaceProps {
  html: string;
  css: string;
}

function detectPrimaryLanguage(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, "");
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "ja";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0590-\u05FF]/.test(text)) return "he";
  if (/[\u0E00-\u0E7F]/.test(text)) return "th";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u0370-\u03FF]/.test(text)) return "el";
  return null;
}

function stripFontFamily(css: string): string {
  return css.replace(/font-family\s*:[^;}"]+[;]?/gi, "");
}

/**
 * Scope Anki CSS to the card container.
 * Replaces .card selectors with .card-content,
 * and injects remaining CSS as-is.
 */
function scopeCss(css: string): string {
  let scoped = stripFontFamily(css);

  // Replace .card selector with .card-content
  scoped = scoped.replace(/\.card\b/g, ".card-content");

  // Strip background-color from .card-content so dark mode works
  scoped = scoped.replace(/background-color\s*:[^;}"]+[;]?/gi, "");

  // Strip color declarations so dark mode prose colors work
  // (unless they're on a specific child selector)
  scoped = scoped.replace(
    /\.card-content\s*\{([^}]*)\}/g,
    (_match, body: string) => {
      const cleaned = body.replace(/\bcolor\s*:[^;}"]+[;]?/gi, "");
      return `.card-content {${cleaned}}`;
    }
  );

  return scoped;
}

export function CardFace({ html, css }: CardFaceProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const fontPreferences = useSettingsStore((s) => s.fontPreferences);

  const lang = detectPrimaryLanguage(html);
  const chosenFont = lang ? fontPreferences[lang] : null;

  // Inject scoped CSS
  useEffect(() => {
    if (!contentRef.current || !css) return;

    const style = document.createElement("style");
    style.textContent = scopeCss(css);
    contentRef.current.prepend(style);

    return () => {
      style.remove();
    };
  }, [css]);

  // Wire up audio play buttons
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest("[data-audio-btn]");
      if (!btn) return;

      const audioId = btn.getAttribute("data-audio-btn");
      if (!audioId) return;

      const audio = container.querySelector<HTMLAudioElement>(`#${audioId}`);
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [html]);

  // Strip inline font-family from card HTML
  const cleanHtml = html.replace(/font-family\s*:[^;}"]+[;]?/gi, "");

  return (
    <div
      ref={contentRef}
      className="card-content prose prose-sm dark:prose-invert max-w-none
                 text-center
                 px-6 py-8
                 [&_img]:max-w-full [&_img]:h-auto [&_img]:mx-auto [&_img]:rounded-lg [&_img]:block"
      style={chosenFont ? { fontFamily: `"${chosenFont}", system-ui, sans-serif` } : undefined}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}