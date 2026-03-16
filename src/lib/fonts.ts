import { getDb } from "@/platform/adapter";

interface LanguageInfo {
  id: string;
  name: string;
  test: (text: string) => boolean;
}

const LANGUAGES: LanguageInfo[] = [
  { id: "ja", name: "Japanese", test: (t) => /[\u3040-\u309F\u30A0-\u30FF]/.test(t) },
  { id: "zh", name: "Chinese", test: (t) => /[\u4E00-\u9FFF]/.test(t) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(t) },
  { id: "ko", name: "Korean", test: (t) => /[\uAC00-\uD7AF\u1100-\u11FF]/.test(t) },
  { id: "ar", name: "Arabic", test: (t) => /[\u0600-\u06FF\u0750-\u077F]/.test(t) },
  { id: "he", name: "Hebrew", test: (t) => /[\u0590-\u05FF]/.test(t) },
  { id: "th", name: "Thai", test: (t) => /[\u0E00-\u0E7F]/.test(t) },
  { id: "hi", name: "Hindi", test: (t) => /[\u0900-\u097F]/.test(t) },
  { id: "ru", name: "Russian", test: (t) => /[\u0400-\u04FF]/.test(t) },
  { id: "el", name: "Greek", test: (t) => /[\u0370-\u03FF]/.test(t) },
  { id: "en", name: "Latin / European", test: (t) => /[a-zA-ZÀ-ÿ]/.test(t) },
];

export function detectLanguagesFromCards(): { id: string; name: string }[] {
  const db = getDb();

  const rows = db.exec<{ fields: string }>(
    "SELECT fields FROM notes ORDER BY RANDOM() LIMIT 200"
  );

  const allText = rows
    .map((r) => {
      try {
        const fields = JSON.parse(r.fields) as Record<string, string>;
        return Object.values(fields).join(" ");
      } catch {
        return "";
      }
    })
    .join(" ");

  const plainText = allText.replace(/<[^>]+>/g, "");

  const detected: { id: string; name: string }[] = [];
  for (const lang of LANGUAGES) {
    if (lang.test(plainText)) {
      detected.push({ id: lang.id, name: lang.name });
    }
  }

  return detected;
}

const FONT_LISTS: Record<string, string[]> = {
  ja: [
    "Hiragino Sans", "Hiragino Mincho ProN", "Hiragino Kaku Gothic ProN",
    "Yu Gothic", "Yu Mincho", "Meiryo", "MS Gothic", "MS Mincho",
    "Noto Sans JP", "Noto Serif JP", "Osaka", "IPAGothic", "IPAMincho",
  ],
  zh: [
    "PingFang SC", "PingFang TC", "Heiti SC", "Heiti TC",
    "STSong", "STHeiti", "STKaiti", "SimSun", "SimHei",
    "Microsoft YaHei", "Noto Sans SC", "Noto Sans TC",
  ],
  ko: [
    "Apple SD Gothic Neo", "Malgun Gothic", "Nanum Gothic",
    "Nanum Myeongjo", "Noto Sans KR", "Noto Serif KR", "Batang", "Dotum",
  ],
  ar: [
    "Geeza Pro", "Al Nile", "Baghdad", "Damascus",
    "Noto Sans Arabic", "Noto Naskh Arabic", "Traditional Arabic", "Tahoma",
  ],
  he: [
    "Arial Hebrew", "Lucida Grande", "New Peninim MT",
    "Noto Sans Hebrew", "Noto Serif Hebrew", "David", "Miriam",
  ],
  th: [
    "Thonburi", "Ayuthaya", "Sathu", "Krungthep", "Silom",
    "Noto Sans Thai", "Noto Serif Thai", "Leelawadee",
  ],
  hi: [
    "Devanagari Sangam MN", "Kohinoor Devanagari",
    "Noto Sans Devanagari", "Noto Serif Devanagari", "Mangal",
  ],
  ru: [
    "System UI", "SF Pro", "Helvetica Neue", "Arial",
    "Times New Roman", "Georgia", "Noto Sans", "Noto Serif", "PT Sans", "PT Serif",
  ],
  el: [
    "System UI", "SF Pro", "Helvetica Neue", "Arial",
    "Times New Roman", "Noto Sans", "Noto Serif",
  ],
  en: [
    "System UI", "SF Pro", "Helvetica Neue", "Helvetica", "Arial",
    "Times New Roman", "Georgia", "Verdana", "Noto Sans", "Noto Serif",
    "Roboto", "Inter", "Open Sans", "Lato", "Merriweather",
  ],
};

function isFontAvailable(fontFamily: string): boolean {
  if (typeof document === "undefined") return false;

  const testString = "abcdefghijklmnopqrstuvwxyz0123456789あいうえお漢字한글";
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.font = "72px monospace";
  const defaultWidth = ctx.measureText(testString).width;

  ctx.font = `72px "${fontFamily}", monospace`;
  const testWidth = ctx.measureText(testString).width;

  return testWidth !== defaultWidth;
}

export function getAvailableFonts(languageId: string): string[] {
  const candidates = FONT_LISTS[languageId] ?? FONT_LISTS["en"]!;
  return candidates.filter(isFontAvailable);
}