import DOMPurify from "dompurify";
import { getFiles } from "@/platform/adapter";

export function sanitiseHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "b", "i", "u", "em", "strong", "br", "p", "div", "span",
      "img", "audio", "source", "table", "tr", "td", "th", "thead", "tbody",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "sub", "sup", "ruby", "rt", "rp", "a", "hr", "pre", "code",
      "button",
    ],
    ALLOWED_ATTR: [
      "src", "alt", "class", "style", "href", "target", "type",
      "controls", "autoplay", "width", "height", "colspan", "rowspan",
      "data-autoplay", "data-audio-btn", "onclick",
    ],
  });
}

export async function resolveMedia(
  html: string,
  deckId: string
): Promise<string> {
  const files = getFiles();

  // Resolve src="..." references
  const srcRegex = /src="([^"]+)"/g;
  const matches: { full: string; filename: string }[] = [];
  let match;
  while ((match = srcRegex.exec(html)) !== null) {
    const filename = match[1]!;
    if (!filename.startsWith("http") && !filename.startsWith("data:") && !filename.startsWith("blob:")) {
      matches.push({ full: match[0], filename });
    }
  }

  // Resolve [sound:filename.mp3] tags
  const soundRegex = /\[sound:([^\]]+)\]/g;
  const soundMatches: { full: string; filename: string }[] = [];
  while ((match = soundRegex.exec(html)) !== null) {
    soundMatches.push({ full: match[0], filename: match[1]! });
  }

  let result = html;

  for (const m of matches) {
    const url = await files.getMediaUrl(deckId, m.filename);
    if (url) {
      result = result.replace(m.full, `src="${url}"`);
    }
  }

  for (const m of soundMatches) {
    const url = await files.getMediaUrl(deckId, m.filename);
    const audioId = `audio-${Math.random().toString(36).slice(2, 8)}`;

    if (url) {
      result = result.replace(
        m.full,
        `<span class="fluido-audio-inline">` +
        `<audio id="${audioId}" data-autoplay src="${url}" preload="auto"></audio>` +
        `<button data-audio-btn="${audioId}" class="fluido-audio-btn" title="Play audio">` +
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
        `<polygon points="5 3 19 12 5 21 5 3"></polygon>` +
        `</svg>` +
        `</button>` +
        `</span>`
      );
    } else {
      // Media not available — show disabled button instead of raw [sound:] text
      result = result.replace(
        m.full,
        `<span class="fluido-audio-inline">` +
        `<button class="fluido-audio-btn fluido-audio-btn-disabled" title="Audio not available" disabled>` +
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
        `<polygon points="5 3 19 12 5 21 5 3"></polygon>` +
        `</svg>` +
        `</button>` +
        `</span>`
      );
    }
  }

  return result;
}