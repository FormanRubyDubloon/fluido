import { useState, useEffect } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { detectLanguagesFromCards, getAvailableFonts } from "@/lib/fonts";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SettingsPanel() {
  const {
    darkMode, setDarkMode,
    newCardsPerDay, setNewCardsPerDay,
    learningSteps, setLearningSteps,
    relearningSteps, setRelearningSteps,
    requestRetention, setRequestRetention,
    fsrsWeights, setFsrsWeights,
    simpleRatingMode, setSimpleRatingMode,
    fontPreferences, setFontForLanguage, clearFontForLanguage,
  } = useSettingsStore();

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>

      <Section title="Appearance">
        <ToggleRow label="Dark mode" description="Use dark theme for comfortable study sessions" checked={darkMode} onChange={setDarkMode} />
      </Section>

      <Separator />

      <Section title="Fonts">
        <FontSettings
          fontPreferences={fontPreferences}
          onSetFont={setFontForLanguage}
          onClearFont={clearFontForLanguage}
        />
      </Section>

      <Separator />

      <Section title="Review">
        <NumberRow label="New cards per day" description="Maximum number of new cards introduced each day" value={newCardsPerDay} min={0} max={999} onChange={setNewCardsPerDay} />
        <StepsRow label="Learning steps (minutes)" description="Steps for new cards before graduating to review" value={learningSteps} onChange={setLearningSteps} />
        <StepsRow label="Relearning steps (minutes)" description="Steps for lapsed cards before returning to review" value={relearningSteps} onChange={setRelearningSteps} />
        <ToggleRow label="Simple rating mode" description="Show only Again and Good buttons (hide Hard and Easy)" checked={simpleRatingMode} onChange={setSimpleRatingMode} />
      </Section>

      <Separator />

      <Section title="FSRS Parameters">
        <NumberRow label="Desired retention" description="Target probability of remembering a card at review time (0.70-0.99)" value={Math.round(requestRetention * 100)} min={70} max={99} onChange={(v) => setRequestRetention(v / 100)} suffix="%" />
        <WeightsRow label="Custom weights" description="Paste optimised FSRS weights from Anki. Leave empty for defaults." value={fsrsWeights} onChange={setFsrsWeights} />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Font settings
// ---------------------------------------------------------------------------

function FontSettings({
  fontPreferences,
  onSetFont,
  onClearFont,
}: {
  fontPreferences: Record<string, string>;
  onSetFont: (langId: string, font: string) => void;
  onClearFont: (langId: string) => void;
}) {
  const [languages, setLanguages] = useState<{ id: string; name: string }[]>([]);
  const [fontsCache, setFontsCache] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectLanguagesFromCards().then((detected) => {
      setLanguages(detected);
      const cache: Record<string, string[]> = {};
      for (const lang of detected) {
        cache[lang.id] = getAvailableFonts(lang.id);
      }
      setFontsCache(cache);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Detecting languages...</p>;
  }

  if (languages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Import a deck to configure fonts per language.
      </p>
    );
  }

  const SAMPLE_TEXT: Record<string, string> = {
    ja: "あいうえお 漢字",
    zh: "你好世界",
    ko: "안녕하세요",
    ar: "مرحبا بالعالم",
    he: "שלום עולם",
    th: "สวัสดีชาวโลก",
    hi: "नमस्ते दुनिया",
    ru: "Привет мир",
    el: "Γεια σου κόσμε",
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Choose a display font for each language detected in your cards.
      </p>
      {languages.map((lang) => {
        const available = fontsCache[lang.id] ?? [];
        const selected = fontPreferences[lang.id] ?? "";

        return (
          <div key={lang.id} className="flex items-center justify-between gap-3 py-2 flex-wrap">
            <div>
              <Label className="text-sm">{lang.name}</Label>
              {selected && (
                <div
                  className="text-xs text-muted-foreground mt-0.5"
                  style={{ fontFamily: `"${selected}", system-ui` }}
                >
                  {SAMPLE_TEXT[lang.id] ?? "The quick brown fox"}
                </div>
              )}
            </div>

            <Select
              value={selected || "__default__"}
              onValueChange={(v) => {
                if (v === "__default__") {
                  onClearFont(lang.id);
                } else {
                  onSetFont(lang.id, v);
                }
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="System default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">System default</SelectItem>
                {available.map((font) => (
                  <SelectItem key={font} value={font}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 flex-wrap">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberRow({ label, description, value, min, max, onChange, suffix }: { label: string; description: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 flex-wrap">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= min && v <= max) onChange(v);
          }}
          className="w-20 text-right"
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function StepsRow({ label, description, value, onChange }: { label: string; description: string; value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(" "));

  const handleBlur = () => {
    const parsed = text.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n) && n > 0);
    if (parsed.length > 0) {
      onChange(parsed);
      setText(parsed.join(" "));
    } else {
      setText(value.join(" "));
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2 flex-wrap">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        className="w-28 text-right"
        placeholder="1 10"
      />
    </div>
  );
}

function WeightsRow({ label, description, value, onChange }: { label: string; description: string; value: number[] | null; onChange: (v: number[] | null) => void }) {
  const [text, setText] = useState(value ? value.join(", ") : "");

  const handleBlur = () => {
    if (text.trim() === "") {
      onChange(null);
      return;
    }
    const parsed = text.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
    if (parsed.length > 0) {
      onChange(parsed);
      setText(parsed.join(", "));
    } else {
      onChange(null);
      setText("");
    }
  };

  return (
    <div className="py-2">
      <div className="space-y-0.5 mb-2">
        <Label className="text-sm">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={2}
        className="font-mono"
        placeholder="Leave empty for FSRS-5 defaults"
      />
      {value && (
        <Button
          variant="link"
          size="sm"
          onClick={() => { onChange(null); setText(""); }}
          className="mt-1 px-0 text-red-500 hover:text-red-600 h-auto"
        >
          Reset to defaults
        </Button>
      )}
    </div>
  );
}
