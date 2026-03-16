import { useState } from "react";
import { getFiles } from "@/platform/adapter";
import { importApkg, type ImportResult } from "@/import/index";

interface ImportButtonProps {
  onImportComplete: () => void;
}

export function ImportButton({ onImportComplete }: ImportButtonProps) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    setError(null);
    setResult(null);
    setImporting(true);

    try {
      const buffer = await getFiles().pickApkgFile();
      const importResult = await importApkg(buffer);
      setResult(importResult);
      onImportComplete();
    } catch (e) {
      if (e instanceof Error && e.message === "File picker cancelled") {
        // User cancelled
      } else {
        console.error("Import failed:", e);
        setError(e instanceof Error ? e.message : "Import failed");
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleImport}
        disabled={importing}
        className="
          flex items-center gap-2 px-4 py-3 rounded-lg
          bg-blue-600 text-white font-medium text-sm
          hover:bg-blue-700 active:bg-blue-800
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors
        "
      >
        {importing ? (
          <>
            <span className="animate-spin">⏳</span>
            Importing…
          </>
        ) : (
          <>
            <span>+</span>
            Import .apkg
          </>
        )}
      </button>

      {error && (
        <p className="absolute top-full mt-2 right-0 text-sm text-red-600 dark:text-red-400 whitespace-nowrap">
          {error}
        </p>
      )}

      {result && (
        <ImportSummary result={result} onDismiss={() => setResult(null)} />
      )}
    </div>
  );
}

function ImportSummary({
  result,
  onDismiss,
}: {
  result: ImportResult;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute top-full mt-2 right-0 z-50 w-72 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">Import Complete</h3>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
        >
          ×
        </button>
      </div>
      <dl className="space-y-1 text-sm">
        <SummaryRow label="Decks" value={result.decksCreated} />
        <SummaryRow label="Cards" value={result.cardsCreated} />
        <SummaryRow label="Notes" value={result.notesCreated} />
        <SummaryRow label="Media files" value={result.mediaStored} />
        {result.reviewLogsImported > 0 && (
          <SummaryRow label="Reviews imported" value={result.reviewLogsImported} />
        )}
        {result.notesSkipped > 0 && (
          <SummaryRow label="Skipped (duplicates)" value={result.notesSkipped} />
        )}
      </dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}