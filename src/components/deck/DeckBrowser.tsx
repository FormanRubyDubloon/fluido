import { useState, useRef, useEffect, useCallback } from "react";
import { useDeckStore, type DeckWithCounts } from "@/store/deck-store";
import { renameDeck, deleteDeck, resetDeckProgress, getNoteTypesForDeck, updateNoteTypeTemplates } from "@/lib/queries";
import { ImportButton } from "./ImportButton";

interface DeckBrowserProps {
  onStartReview: (deckId: string) => void;
}

export function DeckBrowser({ onStartReview }: DeckBrowserProps) {
  const { decks, loading, loadDecks } = useDeckStore();

  const totalDue = decks.reduce(
    (sum, d) =>
      sum + d.counts.new_count + d.counts.learning_count + d.counts.due_count,
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading decks…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Decks</h2>
          {totalDue > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {totalDue} card{totalDue === 1 ? "" : "s"} to review
            </p>
          )}
        </div>
        <ImportButton onImportComplete={loadDecks} />
      </div>

      {decks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2">
          {decks.map((deck) => (
            <DeckRow
              key={deck.id}
              deck={deck}
              onStartReview={onStartReview}
              onRefresh={loadDecks}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeckRow({
  deck,
  onStartReview,
  onRefresh,
}: {
  deck: DeckWithCounts;
  onStartReview: (deckId: string) => void;
  onRefresh: () => void;
}) {
  const { new_count, learning_count, due_count } = deck.counts;
  const total = new_count + learning_count + due_count;
  const hasCards = total > 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(deck.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== deck.name) {
      await renameDeck(deck.id, trimmed);
      onRefresh();
    }
    setRenaming(false);
  };

  const handleDelete = async () => {
    await deleteDeck(deck.id);
    setShowDeleteConfirm(false);
    onRefresh();
  };

  const handleReset = async () => {
    await resetDeckProgress(deck.id);
    setShowResetConfirm(false);
    onRefresh();
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => hasCards && onStartReview(deck.id)}
          disabled={!hasCards}
          className={`
            flex-1 flex items-center justify-between px-4 py-4 rounded-xl
            border transition-colors text-left min-w-0
            ${
              hasCards
                ? "border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                : "border-gray-100 dark:border-gray-900 opacity-60 cursor-default"
            }
          `}
        >
          <div className="min-w-0">
            {renaming ? (
              <input
                ref={renameRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") { setRenaming(false); setRenameValue(deck.name); }
                }}
                onClick={(e) => e.stopPropagation()}
                className="font-medium bg-transparent border-b-2 border-blue-500 outline-none w-full"
              />
            ) : (
              <p className="font-medium truncate">{deck.name}</p>
            )}
          </div>

          <div className="flex items-center gap-3 ml-4 shrink-0 text-sm font-medium tabular-nums">
            {new_count > 0 && (
              <span className="text-blue-600 dark:text-blue-400">{new_count}</span>
            )}
            {learning_count > 0 && (
              <span className="text-orange-600 dark:text-orange-400">{learning_count}</span>
            )}
            {due_count > 0 && (
              <span className="text-green-600 dark:text-green-400">{due_count}</span>
            )}
            {total === 0 && (
              <span className="text-gray-400 dark:text-gray-600">done</span>
            )}
          </div>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-lg
                       text-gray-400 hover:text-gray-600 hover:bg-gray-100
                       dark:hover:text-gray-300 dark:hover:bg-gray-800
                       transition-colors shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-44 py-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg">
              <MenuButton
                label="Rename"
                onClick={() => {
                  setMenuOpen(false);
                  setRenameValue(deck.name);
                  setRenaming(true);
                }}
              />
              <MenuButton
                label="Edit templates"
                onClick={() => {
                  setMenuOpen(false);
                  setShowEditModal(true);
                }}
              />
              <MenuButton
                label="Reset progress"
                onClick={() => {
                  setMenuOpen(false);
                  setShowResetConfirm(true);
                }}
              />
              <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
              <MenuButton
                label="Delete"
                danger
                onClick={() => {
                  setMenuOpen(false);
                  setShowDeleteConfirm(true);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete deck"
          message={`Are you sure you want to delete "${deck.name}"? This will remove all cards, notes, and review history for this deck. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showResetConfirm && (
        <ConfirmDialog
          title="Reset progress"
          message={`Are you sure you want to reset all progress for "${deck.name}"? This will clear all review history and set every card back to new. This cannot be undone.`}
          confirmLabel="Reset"
          danger
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {showEditModal && (
        <EditTemplatesModal
          deckId={deck.id}
          deckName={deck.name}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  );
}

function MenuButton({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-2 text-sm transition-colors
        ${danger
          ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        }
      `}
    >
      {label}
    </button>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-sm w-full p-6">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                       hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium text-white transition-colors ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TemplateData {
  name: string;
  front: string;
  back: string;
  css: string;
}

interface NoteTypeWithTemplates {
  id: string;
  name: string;
  templates: TemplateData[];
  css: string;
}

function EditTemplatesModal({
  deckId,
  deckName,
  onClose,
}: {
  deckId: string;
  deckName: string;
  onClose: () => void;
}) {
  const [noteTypes, setNoteTypes] = useState<NoteTypeWithTemplates[]>([]);
  const [activeNtIndex, setActiveNtIndex] = useState(0);
  const [activeTmplIndex, setActiveTmplIndex] = useState(0);
  const [editingCss, setEditingCss] = useState(false);

  useEffect(() => {
    getNoteTypesForDeck(deckId).then((rows) => {
      const nts: NoteTypeWithTemplates[] = rows.map((nt) => {
        const templates: TemplateData[] = JSON.parse(nt.card_templates);
        return {
          id: nt.id,
          name: nt.name,
          templates,
          css: templates[0]?.css ?? "",
        };
      });
      setNoteTypes(nts);
    });
  }, [deckId]);

  const activeNt = noteTypes[activeNtIndex];
  const activeTmpl = activeNt?.templates[activeTmplIndex];

  const updateTemplate = useCallback(
    (field: "front" | "back", value: string) => {
      setNoteTypes((prev) =>
        prev.map((nt, ni) =>
          ni === activeNtIndex
            ? {
                ...nt,
                templates: nt.templates.map((t, ti) =>
                  ti === activeTmplIndex ? { ...t, [field]: value } : t
                ),
              }
            : nt
        )
      );
    },
    [activeNtIndex, activeTmplIndex]
  );

  const updateCss = useCallback(
    (value: string) => {
      setNoteTypes((prev) =>
        prev.map((nt, ni) =>
          ni === activeNtIndex
            ? {
                ...nt,
                css: value,
                templates: nt.templates.map((t) => ({ ...t, css: value })),
              }
            : nt
        )
      );
    },
    [activeNtIndex]
  );

  const handleSave = async () => {
    for (const nt of noteTypes) {
      await updateNoteTypeTemplates(nt.id, JSON.stringify(nt.templates));
    }
    onClose();
  };

  if (noteTypes.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl max-w-md w-full p-6">
          <p className="text-sm text-gray-500">No card templates found for this deck.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold">Edit Templates — {deckName}</h3>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-3 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          {noteTypes.length > 1 &&
            noteTypes.map((nt, i) => (
              <button
                key={nt.id}
                onClick={() => { setActiveNtIndex(i); setActiveTmplIndex(0); setEditingCss(false); }}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  i === activeNtIndex
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {nt.name}
              </button>
            ))}
          {activeNt && (
            <>
              {activeNt.templates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setActiveTmplIndex(i); setEditingCss(false); }}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                    i === activeTmplIndex && !editingCss
                      ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
                >
                  {t.name || `Card ${i + 1}`}
                </button>
              ))}
              <button
                onClick={() => setEditingCss(true)}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  editingCss
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                CSS
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {editingCss ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Shared CSS
              </label>
              <textarea
                value={activeNt?.css ?? ""}
                onChange={(e) => updateCss(e.target.value)}
                rows={16}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-700
                           bg-gray-50 dark:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500
                           resize-y"
                spellCheck={false}
              />
            </div>
          ) : activeTmpl ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Front Template
                </label>
                <textarea
                  value={activeTmpl.front}
                  onChange={(e) => updateTemplate("front", e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-700
                             bg-gray-50 dark:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500
                             resize-y"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Back Template
                </label>
                <textarea
                  value={activeTmpl.back}
                  onChange={(e) => updateTemplate("back", e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-gray-300 dark:border-gray-700
                             bg-gray-50 dark:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500
                             resize-y"
                  spellCheck={false}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700
                       hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium
                       hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">📦</div>
      <h3 className="text-lg font-medium mb-2">No decks yet</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
        Import an Anki deck (.apkg file) to get started. Your flashcards,
        media, and deck structure will be preserved.
      </p>
    </div>
  );
}