import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNote, X, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "careassurance_quick_notes";

interface Note {
  id: string;
  text: string;
  createdAt: number;
}

function loadNotes(): Note[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Note[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch { /* quota exceeded */ }
}

/**
 * A floating quick-notes widget. Users can jot temporary notes that persist
 * across page navigations via localStorage, useful for recording observations
 * during care work.
 */
export function QuickNotes() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist notes on every change
  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  const addNote = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setNotes((prev) => [
      { id: crypto.randomUUID(), text: trimmed, createdAt: Date.now() },
      ...prev,
    ]);
    setDraft("");
    textareaRef.current?.focus();
  }, [draft]);

  const removeNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        addNote();
      }
    },
    [addNote],
  );

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-50 h-10 w-10 rounded-full shadow-lg border-border/80 bg-background/95 backdrop-blur-sm hover:bg-muted"
        aria-label="Open quick notes"
      >
        <StickyNote className="h-4 w-4" />
        {notes.length > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
            {notes.length}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-6 left-6 z-50 w-72 rounded-xl border border-border/80 bg-background shadow-xl backdrop-blur-sm transition-all duration-200",
        isMinimized && "w-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-3.5 w-3.5 text-amber-500" />
          Quick Notes
          {notes.length > 0 && (
            <span className="text-[10px] text-muted-foreground">({notes.length})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
            aria-label={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
            aria-label="Close notes"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3 space-y-3">
          {/* Note input */}
          <div className="space-y-2">
            <Textarea
              ref={textareaRef}
              placeholder="Type a note and press Enter..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[60px] text-sm resize-none"
              rows={2}
            />
            <Button
              variant="default"
              size="sm"
              onClick={addNote}
              disabled={!draft.trim()}
              className="w-full text-xs"
            >
              Add Note
            </Button>
          </div>

          {/* Note list */}
          {notes.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="group flex items-start gap-2 rounded-lg border border-border/40 bg-muted/30 p-2 text-xs"
                >
                  <p className="flex-1 whitespace-pre-wrap break-words text-foreground/80">
                    {note.text}
                  </p>
                  <button
                    onClick={() => removeNote(note.id)}
                    className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-3 w-3 text-destructive/60" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {notes.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-2">
              No notes yet. Add one above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
