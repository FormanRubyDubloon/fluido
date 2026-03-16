import { getDb } from "@/platform/adapter";
import { renderTemplate, renderClozeAnswer } from "@/import/template";
import { sanitiseHtml, resolveMedia } from "./sanitise";
import type { QueueCard } from "@/srs/queue";

interface CardTemplate {
  name: string;
  front: string;
  back: string;
  css: string;
}

export async function renderCard(
  card: QueueCard
): Promise<{ front: string; back: string; css: string }> {
  const noteTypeRows = getDb().exec<{ card_templates: string }>(
    "SELECT card_templates FROM note_types WHERE id = ?",
    [card.noteTypeId]
  );

  if (noteTypeRows.length === 0) {
    return {
      front: formatFallback(card.fields),
      back: formatFallback(card.fields),
      css: "",
    };
  }

  const templates: CardTemplate[] = JSON.parse(noteTypeRows[0]!.card_templates);

  const isCloze = templates.length === 1 && (
    templates[0]!.front.includes("{{cloze:") ||
    templates[0]!.front.includes("{{type:cloze")
  );

  const template = isCloze
    ? templates[0]!
    : templates[card.templateIndex] ?? templates[0];

  if (!template) {
    return {
      front: formatFallback(card.fields),
      back: formatFallback(card.fields),
      css: "",
    };
  }

  const clozeIndex = isCloze ? card.templateIndex : null;

  let frontHtml = renderTemplate(
    template.front,
    card.fields,
    undefined,
    clozeIndex
  );

  let backHtml: string;
  if (isCloze && clozeIndex != null) {
    const answeredFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(card.fields)) {
      answeredFields[key] = renderClozeAnswer(value, clozeIndex);
    }
    backHtml = renderTemplate(
      template.back,
      answeredFields,
      frontHtml,
      null
    );
  } else {
    backHtml = renderTemplate(template.back, card.fields, frontHtml, null);
  }

  frontHtml = sanitiseHtml(frontHtml);
  backHtml = sanitiseHtml(backHtml);

  frontHtml = await resolveMedia(frontHtml, "shared");
  backHtml = await resolveMedia(backHtml, "shared");

  return {
    front: frontHtml,
    back: backHtml,
    css: template.css ?? "",
  };
}

function formatFallback(fields: Record<string, string>): string {
  return Object.values(fields)
    .filter((v) => v.trim())
    .join("<hr>");
}