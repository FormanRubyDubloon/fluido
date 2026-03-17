import { getNoteType } from "@/lib/queries";
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
  const noteType = await getNoteType(card.noteTypeId);

  // Ensure fields is a parsed object (RPC may return it as a JSON string)
  const fields: Record<string, string> = typeof card.fields === "string"
    ? JSON.parse(card.fields)
    : card.fields;

  if (!noteType) {
    return {
      front: formatFallback(fields),
      back: formatFallback(fields),
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
      front: formatFallback(fields),
      back: formatFallback(fields),
      css: "",
    };
  }

  const clozeIndex = isCloze ? card.templateIndex : null;

  let frontHtml = renderTemplate(
    template.front,
    fields,
    undefined,
    clozeIndex
  );

  let backHtml: string;
  if (isCloze && clozeIndex != null) {
    const answeredFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      answeredFields[key] = renderClozeAnswer(value, clozeIndex);
    }
    backHtml = renderTemplate(
      template.back,
      answeredFields,
      frontHtml,
      null
    );
  } else {
    backHtml = renderTemplate(template.back, fields, frontHtml, null);
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
