import { useState, useEffect } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { getFiles, getAdapter } from "@/platform/adapter";
import { detectLanguagesFromCards, getAvailableFonts } from "@/lib/fonts";

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

      <Section title="Fonts">
        <FontSettings
          fontPreferences={fontPreferences}
          onSetFont={setFontForLanguage}
          onClearFont={clearFontForLanguage}
        />
      </Section>

      <Section title="Review">
        <NumberRow label="New cards per day" description="Maximum number of new cards introduced each day" value={newCardsPerDay} min={0} max={999} onChange={setNewCardsPerDay} />
        <StepsRow label="Learning steps (minutes)" description="Steps for new cards before graduating to review" value={learningSteps} onChange={setLearningSteps} />
        <StepsRow label="Relearning steps (minutes)" description="Steps for lapsed cards before returning to review" value={relearningSteps} onChange={setRelearningSteps} />
        <ToggleRow label="Simple rating mode" description="Show only Again and Good buttons (hide Hard and Easy)" checked={simpleRatingMode} onChange={setSimpleRatingMode} />
      </Section>

      <Section title="FSRS Parameters">
        <NumberRow label="Desired retention" description="Target probability of remembering a card at review time (0.70–0.99)" value={Math.round(requestRetention * 100)} min={70} max={99} onChange={(v) => setRequestRetention(v / 100)} suffix="%" />
        <WeightsRow label="Custom weights" description="Paste optimised FSRS weights from Anki. Leave empty for defaults." value={fsrsWeights} onChange={setFsrsWeights} />
      </Section>

      <Section title="Data">
        <SaveFileRow />
        <ExportRow />
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
    const detected = detectLanguagesFromCards();
    setLanguages(detected);

    const cache: Record<string, string[]> = {};
    for (const lang of detected) {
      cache[lang.id] = getAvailableFonts(lang.id);
    }
    setFontsCache(cache);
    setLoading(false);
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-400">Detecting languages…</p>;
  }

  if (languages.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Import a deck to configure fonts per language.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Choose a display font for each language detected in your cards.
      </p>
      {languages.map((lang) => {
        const available = fontsCache[lang.id] ?? [];
        const selected = fontPreferences[lang.id] ?? "";

        return (
          <div key={lang.id} className="flex items-center justify-between gap-3 py-2 flex-wrap">
            <div>
              <div className="text-sm font-medium">{lang.name}</div>
              {selected && (
                <div
                  className="text-xs text-gray-400 mt-0.5"
                  style={{ fontFamily: `"${selected}", system-ui` }}
                >
                  {lang.id === "ja" ? "あいうえお 漢字" :
                   lang.id === "zh" ? "你好世界" :
                   lang.id === "ko" ? "안녕하세요" :
                   lang.id === "ar" ? "مرحبا بالعالم" :
                   lang.id === "he" ? "שלום עולם" :
                   lang.id === "th" ? "สวัสดีชาวโลก" :
                   lang.id === "hi" ? "नमस्ते दुनिया" :
                   lang.id === "ru" ? "Привет мир" :
                   lang.id === "el" ? "Γεια σου κόσμε" :
                   "The quick brown fox"}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={selected}
                onChange={(e) => {
                  if (e.target.value) {
                    onSetFont(lang.id, e.target.value);
                  } else {
                    onClearFont(lang.id);
                  }
                }}
                className="px-2 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                           bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500
                           max-w-[180px] truncate"
              >
                <option value="">System default</option>
                {available.map((font) => (
                  <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>
                    {font}
                  </option>
                ))}
              </select>
            </div>
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
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 flex-wrap">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function NumberRow({ label, description, value, min, max, onChange, suffix }: { label: string; description: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 flex-wrap">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v >= min && v <= max) onChange(v);
          }}
          className="w-20 px-2 py-2 text-sm text-right rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {suffix && <span className="text-sm text-gray-500 dark:text-gray-400">{suffix}</span>}
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
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
      </div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        className="w-28 px-2 py-2 text-sm text-right rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
      <div className="mb-2">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={2}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        placeholder="Leave empty for FSRS-5 defaults"
      />
      {value && (
        <button onClick={() => { onChange(null); setText(""); }} className="mt-1 text-xs text-red-500 hover:text-red-600">
          Reset to defaults
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data section
// ---------------------------------------------------------------------------

function SaveFileRow() {
  const [status, setStatus] = useState<{
    linked: boolean;
    name: string | null;
    needsPermission: boolean;
  } | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    const adapter = getAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adapter.db as any;
    if (typeof db.getSaveFileStatus === "function") {
      setStatus(await db.getSaveFileStatus());
    }
  }

  async function handleLink() {
    const adapter = getAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adapter.db as any;
    if (typeof db.linkSaveFile === "function") {
      try {
        await db.linkSaveFile();
        await checkStatus();
      } catch {
        // Cancelled
      }
    }
  }

  async function handleUnlink() {
    const adapter = getAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = adapter.db as any;
    if (typeof db.unlinkSaveFile === "function") {
      await db.unlinkSaveFile();
      await checkStatus();
    }
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Save file</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {status?.linked
              ? `Auto-saving to ${status.name}`
              : "Link a file on disk to auto-save your database"}
          </div>
        </div>
        {status?.linked ? (
          <button
            onClick={handleUnlink}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                       hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0
                       text-red-600 dark:text-red-400"
          >
            Unlink
          </button>
        ) : (
          <button
            onClick={handleLink}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium
                       hover:bg-blue-700 transition-colors shrink-0"
          >
            Choose file
          </button>
        )}
      </div>
      {status?.linked && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
          ✓ Database auto-saves after every review
        </p>
      )}
    </div>
  );
}

function ExportRow() {
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      await getFiles().exportBackup();
      setMessage("Backup downloaded");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">Export backup</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Download your database as a file for safekeeping</div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 shrink-0"
        >
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>
      {message && <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">{message}</p>}
    </div>
  );
}