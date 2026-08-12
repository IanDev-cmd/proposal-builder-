import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { FileText, Plus, Package, ClipboardList, StickyNote, Minus } from 'lucide-react';
import {
  addNote,
  deleteNote,
  detectTag,
  loadNotes,
  saveQuoteNotesDraft,
  updateNote,
  type LeadNote,
} from '@/lib/leadNotes';
import { ToastRect } from '@/components/ToastRect';

type Props = {
  leadKey: string;
  keyItems: string;
  progressNotes: string;
  isOpen: boolean;
  onToggle: () => void;
  onKeyItemsChange: (value: string) => void;
  onProgressNotesChange: (value: string) => void;
};

function splitSentences(text: string): string[] {
  const raw = (text || '').trim();
  if (!raw) return [];
  return raw
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinSentences(parts: string[]): string {
  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Notes rail — Key Items / Progress Notes as collapsible toast rectangles.
 * Same UX as Schedule Timings toasts: left bar, circular icon, title, body, ×.
 */
export function LeadReferenceCard({
  leadKey,
  keyItems,
  progressNotes,
  isOpen,
  onToggle,
  onKeyItemsChange,
  onProgressNotesChange,
}: Props) {
  const [notes, setNotes] = useState<LeadNote[]>(() => loadNotes(leadKey));
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [page, setPage] = useState(0);
  const userPagedRef = useRef(false);

  useEffect(() => {
    setNotes(loadNotes(leadKey));
    setPage(0);
    userPagedRef.current = false;
  }, [leadKey]);

  const keySentences = splitSentences(keyItems);
  const progressSentences = splitSentences(progressNotes);

  const queued = useMemo(
    () => [
      ...keySentences.map((text, index) => ({
        key: `key-${index}`,
        kind: 'key' as const,
        index,
        text,
      })),
      ...progressSentences.map((text, index) => ({
        key: `prog-${index}`,
        kind: 'prog' as const,
        index,
        text,
      })),
    ],
    [keyItems, progressNotes],
  );

  const PAGE_SIZE = 4;
  const pageCount = Math.max(1, Math.ceil(queued.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleQueued = queued.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const remaining = Math.max(0, queued.length - (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  // After the first 4 are up, show the rest (next page) unless the REP paged manually
  useEffect(() => {
    if (!isOpen || remaining <= 0 || userPagedRef.current) return;
    const t = window.setTimeout(() => {
      setPage((p) => Math.min(p + 1, pageCount - 1));
    }, 4000);
    return () => window.clearTimeout(t);
  }, [isOpen, remaining, pageCount, safePage]);

  const handleSave = () => {
    saveQuoteNotesDraft(leadKey, {
      keyItems: keyItems || '',
      progressNotes: progressNotes || '',
    });
    if (draftText.trim()) {
      const note: LeadNote = {
        id: `n_${Date.now().toString(36)}`,
        text: draftText.trim(),
        tag: detectTag(draftText),
        createdAt: new Date().toISOString(),
      };
      setNotes(addNote(leadKey, note));
      setDraftText('');
      setAdding(false);
    }
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  const updateKey = (index: number, value: string) => {
    const next = [...keySentences];
    next[index] = value;
    onKeyItemsChange(joinSentences(next));
  };

  const dismissKey = (index: number) => {
    const next = keySentences.filter((_, i) => i !== index);
    onKeyItemsChange(joinSentences(next));
  };

  const updateProgress = (index: number, value: string) => {
    const next = [...progressSentences];
    next[index] = value;
    onProgressNotesChange(joinSentences(next));
  };

  const dismissProgress = (index: number) => {
    const next = progressSentences.filter((_, i) => i !== index);
    onProgressNotesChange(joinSentences(next));
  };

  const toastCount =
    keySentences.length +
    progressSentences.length +
    notes.length +
    (adding ? 1 : 0);

  const subtitle = useMemo(() => {
    if (savedFlash) return 'Saved locally';
    if (toastCount === 0) return 'Add notes';
    return `${toastCount} note${toastCount === 1 ? '' : 's'}`;
  }, [savedFlash, toastCount]);

  return (
    <div className="flex h-full flex-col items-stretch px-2 py-4" data-testid="lead-reference-card">
      <AnimatePresence initial={false} mode="wait">
        {!isOpen ? (
          <motion.button
            key="collapsed"
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            aria-label="Open notes"
            data-testid="lead-reference-toggle"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.22 }}
            className="relative mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-sky-200 bg-gradient-to-r from-sky-500 to-emerald-500 px-3 text-white shadow-md shadow-sky-900/15"
          >
            <FileText className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span className="text-[12px] font-bold uppercase tracking-[0.12em]">notes</span>
            {toastCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-sky-700 shadow">
                {toastCount > 9 ? '9+' : toastCount}
              </span>
            ) : null}
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={true}
                data-testid="lead-reference-toggle"
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Notes
                </span>
                <span className="truncate text-[11px] text-slate-400">{subtitle}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAdding((v) => !v)}
                  aria-label="Add note"
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-sky-600 hover:bg-sky-50"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="Collapse notes"
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <Minus className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-y-auto pb-2">
              <LayoutGroup>
                <AnimatePresence initial={false}>
                  {visibleQueued.map((item) =>
                    item.kind === 'key' ? (
                      <ToastRect
                        key={item.key}
                        color="#16a34a"
                        icon={Package}
                        title="Key Items"
                        value={item.text}
                        onChange={(v) => updateKey(item.index, v)}
                        onDismiss={() => dismissKey(item.index)}
                      />
                    ) : (
                      <ToastRect
                        key={item.key}
                        color="#2563eb"
                        icon={ClipboardList}
                        title="Progress Notes"
                        value={item.text}
                        onChange={(v) => updateProgress(item.index, v)}
                        onDismiss={() => dismissProgress(item.index)}
                      />
                    ),
                  )}

                  {notes.map((n) => (
                    <ToastRect
                      key={n.id}
                      color="#0ea5e9"
                      icon={StickyNote}
                      title="Note"
                      value={n.text}
                      onChange={(v) => setNotes(updateNote(leadKey, n.id, v))}
                      onDismiss={() => setNotes(deleteNote(leadKey, n.id))}
                    />
                  ))}

                  {adding ? (
                    <ToastRect
                      key="draft"
                      color="#eab308"
                      icon={Plus}
                      title="New note"
                      value={draftText}
                      placeholder="Type a note…"
                      onChange={setDraftText}
                      onDismiss={() => {
                        setAdding(false);
                        setDraftText('');
                      }}
                    />
                  ) : null}
                </AnimatePresence>
              </LayoutGroup>
              {queued.length > PAGE_SIZE ? (
                <button
                  type="button"
                  onClick={() => {
                    userPagedRef.current = true;
                    setPage((p) => (p + 1) % pageCount);
                  }}
                  className="text-center text-[11px] font-semibold text-sky-600 hover:underline"
                >
                  {remaining > 0
                    ? `Show ${remaining} more`
                    : 'Show first notes'}
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleSave}
              className="mt-2 flex w-full items-center justify-center rounded-[4px] bg-[#2563eb] px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-[#1d4ed8]"
            >
              Save
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LeadReferenceCard;
