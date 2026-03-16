export function renderTemplate(
  template: string,
  fields: Record<string, string>,
  frontHtml?: string,
  clozeIndex?: number | null
): string {
  let result = template;

  if (frontHtml !== undefined) {
    result = result.replace(/\{\{FrontSide\}\}/gi, frontHtml);
  }

  result = processConditionals(result, fields);

  result = result.replace(/\{\{type:(.+?)\}\}/g, (_match, fieldName: string) => {
    return fields[fieldName.trim()] ?? "";
  });

  if (clozeIndex != null) {
    result = result.replace(
      /\{\{cloze:(.+?)\}\}/g,
      (_match, fieldName: string) => {
        const value = fields[fieldName.trim()] ?? "";
        return renderCloze(value, clozeIndex);
      }
    );
  }

  // Handle {{furigana:FieldName}}
  result = result.replace(
    /\{\{furigana:(.+?)\}\}/g,
    (_match, fieldName: string) => {
      const value = fields[fieldName.trim()] ?? "";
      return renderFurigana(value);
    }
  );

  // Handle plain {{FieldName}} substitutions
  result = result.replace(/\{\{(.+?)\}\}/g, (_match, fieldName: string) => {
    const trimmed = fieldName.trim();
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("/") ||
      trimmed.startsWith("^") ||
      trimmed.startsWith("type:") ||
      trimmed.startsWith("cloze:") ||
      trimmed.startsWith("furigana:") ||
      trimmed === "FrontSide"
    ) {
      return "";
    }
    return fields[trimmed] ?? "";
  });

  return result;
}

function processConditionals(
  template: string,
  fields: Record<string, string>
): string {
  let result = template;

  result = result.replace(
    /\{\{#(.+?)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, fieldName: string, content: string) => {
      const value = fields[fieldName.trim()] ?? "";
      return value.trim() ? content : "";
    }
  );

  result = result.replace(
    /\{\{(\^)(.+?)\}\}([\s\S]*?)\{\{\/\2\}\}/g,
    (_match, _caret: string, fieldName: string, content: string) => {
      const value = fields[fieldName.trim()] ?? "";
      return value.trim() ? "" : content;
    }
  );

  return result;
}

export function countClozeIndices(fieldValue: string): number {
  const indices = new Set<number>();
  const regex = /\{\{c(\d+)::/g;
  let match;
  while ((match = regex.exec(fieldValue)) !== null) {
    indices.add(parseInt(match[1]!, 10));
  }
  return indices.size;
}

export function hasCloze(fields: string[]): boolean {
  return fields.some((f) => /\{\{c\d+::/.test(f));
}

export function getClozeIndices(fields: string[]): number[] {
  const indices = new Set<number>();
  const regex = /\{\{c(\d+)::/g;
  for (const field of fields) {
    let match;
    while ((match = regex.exec(field)) !== null) {
      indices.add(parseInt(match[1]!, 10));
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

function renderCloze(text: string, activeIndex: number): string {
  return text.replace(
    /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g,
    (_match, indexStr: string, answer: string, hint?: string) => {
      const index = parseInt(indexStr, 10);
      if (index === activeIndex) {
        const display = hint ? `[${hint}]` : "[...]";
        return `<span class="cloze-blank">${display}</span>`;
      }
      return answer;
    }
  );
}

export function renderClozeAnswer(text: string, activeIndex: number): string {
  return text.replace(
    /\{\{c(\d+)::(.+?)(?:::(.+?))?\}\}/g,
    (_match, indexStr: string, answer: string) => {
      const index = parseInt(indexStr, 10);
      if (index === activeIndex) {
        return `<span class="cloze-answer">${answer}</span>`;
      }
      return answer;
    }
  );
}

/**
 * Convert Anki furigana notation to HTML ruby tags.
 * Anki format: 漢字[かんじ] → <ruby>漢字<rt>かんじ</rt></ruby>
 */
export function renderFurigana(text: string): string {
  return text.replace(
    /([^\s\[\]]+)\[([^\]]+)\]/g,
    (_match, base: string, reading: string) => {
      return `<ruby>${base}<rt>${reading}</rt></ruby>`;
    }
  );
}