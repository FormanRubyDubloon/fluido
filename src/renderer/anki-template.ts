import { getNoteType } from "@/lib/queries";
import { renderClozeAnswer } from "@/import/template";
import { sanitiseHtml, resolveMedia } from "./sanitise";
import type { QueueCard } from "@/srs/queue";

interface CardTemplate {
  name: string;
  front: string;
  back: string;
  css: string;
}

/**
 * Extract {{FieldName}} references from a template string.
 * Ignores special references like {{FrontSide}}, {{cloze:...}}, {{type:...}}.
 */
function extractFieldNames(template: string): string[] {
  const names: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = regex.exec(template)) !== null) {
    const name = match[1]!.trim();
    if (
      name.startsWith("#") || name.startsWith("/") || name.startsWith("^") ||
      name.startsWith("type:") || name.startsWith("furigana:") ||
      name === "FrontSide"
    ) continue;

    if (name.startsWith("cloze:")) {
      names.push(name.replace("cloze:", ""));
    } else {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

/**
 * Strip HTML tags from a string, preserving [sound:...] and img references.
 * Keeps <img> tags intact so resolveMedia can process them.
 */
function stripHtml(html: string): string {
  // Extract img tags and sound references before stripping
  const imgTags: string[] = [];
  const withPlaceholders = html.replace(/<img[^>]*>/gi, (match) => {
    imgTags.push(match);
    return `__IMG_${imgTags.length - 1}__`;
  });

  // Strip all other HTML tags
  let text = withPlaceholders.replace(/<[^>]+>/g, "");

  // Restore img tags
  for (let i = 0; i < imgTags.length; i++) {
    text = text.replace(`__IMG_${i}__`, imgTags[i]!);
  }

  return text.trim();
}

/**
 * Render field values as simple HTML divs.
 */
function renderFields(
  fieldNames: string[],
  fields: Record<string, string>,
  isCloze: boolean,
  clozeIndex: number | null,
  isBack: boolean
): string {
  const parts: string[] = [];

  for (const name of fieldNames) {
    let value = fields[name];
    if (value === undefined || value === "") continue;

    // Handle cloze deletions
    if (isCloze && clozeIndex != null) {
      if (isBack) {
        value = renderClozeAnswer(value, clozeIndex);
      } else {
        // Replace active cloze with [...]
        value = value.replace(
          /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g,
          (_m, idxStr: string, _answer: string, hint?: string) => {
            const idx = parseInt(idxStr, 10);
            if (idx === clozeIndex) {
              return hint ? `[${hint}]` : "[...]";
            }
            return _answer;
          }
        );
      }
    }

    const stripped = stripHtml(value);
    if (stripped) {
      parts.push(`<div class="field">${stripped}</div>`);
    }
  }

  return parts.join("");
}

export async function renderCard(
  card: QueueCard
): Promise<{ front: string; back: string; css: string }> {
  const noteType = await getNoteType(card.noteTypeId);

  const fields: Record<string, string> = typeof card.fields === "string"
    ? JSON.parse(card.fields)
    : card.fields;

  if (!noteType) {
    return {
      front: renderAllFields(fields),
      back: renderAllFields(fields),
      css: "",
    };
  }

  const templates: CardTemplate[] = typeof noteType.card_templates === "string"
    ? JSON.parse(noteType.card_templates)
    : noteType.card_templates;

  const isCloze = templates.length === 1 && (
    templates[0]!.front.includes("{{cloze:") ||
    templates[0]!.front.includes("{{type:cloze")
  );

  const template = isCloze
    ? templates[0]!
    : templates[card.templateIndex] ?? templates[0];

  if (!template) {
    return {
      front: renderAllFields(fields),
      back: renderAllFields(fields),
      css: "",
    };
  }

  const clozeIndex = isCloze ? card.templateIndex : null;

  const frontFieldNames = extractFieldNames(template.front);
  const backFieldNames = extractFieldNames(template.back);

  let frontHtml = renderFields(frontFieldNames, fields, isCloze, clozeIndex, false);
  let backHtml = renderFields(backFieldNames, fields, isCloze, clozeIndex, true);

  frontHtml = sanitiseHtml(frontHtml);
  backHtml = sanitiseHtml(backHtml);

  frontHtml = await resolveMedia(frontHtml, "shared");
  backHtml = await resolveMedia(backHtml, "shared");

  return {
    front: frontHtml,
    back: backHtml,
    css: "",
  };
}

function renderAllFields(fields: Record<string, string>): string {
  return Object.values(fields)
    .filter((v) => v.trim())
    .map((v) => `<div class="field">${stripHtml(v)}</div>`)
    .join("");
}
