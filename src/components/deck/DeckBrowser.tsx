import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useDeckStore, type DeckWithCounts } from "@/store/deck-store";
import { renameDeck, deleteDeck, resetDeckProgress, getNoteTypesForDeck, updateNoteTypeTemplates } from "@/lib/queries";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResponsiveAlert } from "@/components/ui/responsive-alert";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
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
      <div className="flex items-center justify-center h-64">
        <Icon name="progress_activity" size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Decks</h2>
          {totalDue > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
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
          {decks.map((deck, index) => (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.2 }}
            >
              <DeckRow
                deck={deck}
                onStartReview={onStartReview}
                onRefresh={loadDecks}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeckRow
// ---------------------------------------------------------------------------

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

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(deck.name);
  const [showDelete, setShowDelete] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== deck.name) {
      await renameDeck(deck.id, trimmed);
      onRefresh();
    }
    setRenaming(false);
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
            ${hasCards
              ? "border-border hover:border-blue-300 dark:hover:border-blue-700 hover:bg-accent cursor-pointer"
              : "border-border/50 opacity-60 cursor-default"
            }
          `}
        >
          <div className="min-w-0">
            {renaming ? (
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") { setRenaming(false); setRenameValue(deck.name); }
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-7 font-medium"
                autoFocus
              />
            ) : (
              <p className="font-medium truncate">{deck.name}</p>
            )}
          </div>

          <div className="flex items-center gap-3 ml-4 shrink-0 text-sm font-medium tabular-nums">
            {new_count > 0 && <span className="text-blue-600 dark:text-blue-400">{new_count}</span>}
            {learning_count > 0 && <span className="text-orange-600 dark:text-orange-400">{learning_count}</span>}
            {due_count > 0 && <span className="text-green-600 dark:text-green-400">{due_count}</span>}
            {total === 0 && <span className="text-muted-foreground">done</span>}
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0">
              <Icon name="more_vert" size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setRenameValue(deck.name); setRenaming(true); }}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowEdit(true)}>
              Edit templates
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowReset(true)}>
              Reset progress
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ResponsiveAlert
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete deck"
        description={`Are you sure you want to delete "${deck.name}"? This will remove all cards, notes, and review history for this deck. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await deleteDeck(deck.id);
          onRefresh();
        }}
      />

      <ResponsiveAlert
        open={showReset}
        onOpenChange={setShowReset}
        title="Reset progress"
        description={`Are you sure you want to reset all progress for "${deck.name}"? This will clear all review history and set every card back to new. This cannot be undone.`}
        confirmLabel="Reset"
        destructive
        onConfirm={async () => {
          await resetDeckProgress(deck.id);
          onRefresh();
        }}
      />

      <EditTemplatesDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        deckId={deck.id}
        deckName={deck.name}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// EditTemplatesDialog
// ---------------------------------------------------------------------------

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

function EditTemplatesDialog({
  open,
  onOpenChange,
  deckId,
  deckName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
}) {
  const [noteTypes, setNoteTypes] = useState<NoteTypeWithTemplates[]>([]);
  const [activeNtIndex, setActiveNtIndex] = useState(0);
  const [activeTmplIndex, setActiveTmplIndex] = useState(0);
  const [editingCss, setEditingCss] = useState(false);

  useEffect(() => {
    if (!open) return;
    getNoteTypesForDeck(deckId).then((rows) => {
      const nts: NoteTypeWithTemplates[] = rows.map((nt) => {
        const templates: TemplateData[] = typeof nt.card_templates === "string"
          ? JSON.parse(nt.card_templates)
          : nt.card_templates;
        return { id: nt.id, name: nt.name, templates, css: templates[0]?.css ?? "" };
      });
      setNoteTypes(nts);
    });
  }, [deckId, open]);

  const activeNt = noteTypes[activeNtIndex];
  const activeTmpl = activeNt?.templates[activeTmplIndex];

  const updateTemplate = useCallback(
    (field: "front" | "back", value: string) => {
      setNoteTypes((prev) =>
        prev.map((nt, ni) =>
          ni === activeNtIndex
            ? { ...nt, templates: nt.templates.map((t, ti) => ti === activeTmplIndex ? { ...t, [field]: value } : t) }
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
            ? { ...nt, css: value, templates: nt.templates.map((t) => ({ ...t, css: value })) }
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
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit Templates — ${deckName}`}
      className="max-w-3xl max-h-[90vh] flex flex-col"
    >
      {noteTypes.length === 0 ? (
        <div>
          <p className="text-sm text-muted-foreground">No card templates found for this deck.</p>
          <Button className="mt-4" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b overflow-x-auto pb-0">
            {noteTypes.length > 1 &&
              noteTypes.map((nt, i) => (
                <button
                  key={nt.id}
                  onClick={() => { setActiveNtIndex(i); setActiveTmplIndex(0); setEditingCss(false); }}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                    i === activeNtIndex ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
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
                      i === activeTmplIndex && !editingCss ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.name || `Card ${i + 1}`}
                  </button>
                ))}
                <button
                  onClick={() => setEditingCss(true)}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                    editingCss ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  CSS
                </button>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {editingCss ? (
              <div className="space-y-2">
                <Label>Shared CSS</Label>
                <Textarea
                  value={activeNt?.css ?? ""}
                  onChange={(e) => updateCss(e.target.value)}
                  rows={16}
                  className="font-mono"
                  spellCheck={false}
                />
              </div>
            ) : activeTmpl ? (
              <>
                <div className="space-y-2">
                  <Label>Front Template</Label>
                  <Textarea
                    value={activeTmpl.front}
                    onChange={(e) => updateTemplate("front", e.target.value)}
                    rows={8}
                    className="font-mono"
                    spellCheck={false}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Back Template</Label>
                  <Textarea
                    value={activeTmpl.back}
                    onChange={(e) => updateTemplate("back", e.target.value)}
                    rows={8}
                    className="font-mono"
                    spellCheck={false}
                  />
                </div>
              </>
            ) : null}
          </div>

          <Separator />
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </>
      )}
    </ResponsiveModal>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-muted-foreground mb-4"><Icon name="inbox" size={48} /></div>
      <h3 className="text-lg font-medium mb-2">No decks yet</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Import an Anki deck (.apkg file) to get started. Your flashcards,
        media, and deck structure will be preserved.
      </p>
    </div>
  );
}
