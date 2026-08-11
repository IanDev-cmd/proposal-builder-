import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText,
  Plus,
  ChevronDown,
  X,
  StickyNote,
} from 'lucide-react';
import {
  addNote,
  deleteNote,
  detectTag,
  loadNotes,
  saveQuoteNotesDraft,
  updateNote,
  type LeadNote,
} from '@/lib/leadNotes';

type Props = {
  leadKey: string;
  keyItems: string;
  progressNotes: string;
  isOpen: boolean;
  onToggle: () => void;
  onKeyItemsChange: (value: string) => void;
  onProgressNotesChange: (value: string) => void;
};

/**
 * Floating Lead Notes sticky — blue/green palette.
 * Collapses to a page icon; expands with editable Key Items, Progress Notes,
 * and freeform notes. "Go" persists draft + notes to localStorage.
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
  const [draftText, setDraftText] = useState('');
  const [adding, setAdding] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setNotes(loadNotes(leadKey));
  }, [leadKey]);

  const handleGo = () => {
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

  const noteCount = notes.length + (keyItems?.trim() ? 1 : 0) + (progressNotes?.trim() ? 1 : 0);
  const subtitle = useMemo(() => {
    if (savedFlash) return 'Saved locally';
    if (noteCount === 0) return 'Add notes';
    return `${noteCount} note${noteCount === 1 ? '' : 's'}`;
  }, [noteCount, savedFlash]);

  return (
    <div
      className="fixed right-5 top-[4.75rem] z-40 flex flex-col items-end"
      data-testid="lead-reference-card"
    >
      <AnimatePresence initial={false} mode="wait">
        {!isOpen ? (
          <motion.button
            key="collapsed"
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            aria-label="Open lead notes"
            data-testid="lead-reference-toggle"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="group relative flex h-12 w-12 items-center justify-center rounded-[14px] border border-emerald-300/80 bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-lg shadow-sky-900/20 transition-transform hover:scale-105"
          >
            <FileText className="h-5 w-5" strokeWidth={2.2} />
            {noteCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-sky-700 shadow">
                {noteCount > 9 ? '9+' : noteCount}
              </span>
            ) : null}
          </motion.button>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="w-[min(calc(100vw-1.5rem),320px)] overflow-hidden rounded-[16px] border border-sky-200/90 bg-gradient-to-b from-sky-50 via-white to-emerald-50 shadow-xl shadow-sky-900/15"
          >
            <div className="flex items-center gap-2 border-b border-sky-100/90 bg-gradient-to-r from-sky-500/10 to-emerald-500/10 px-3.5 py-2.5">
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={true}
                data-testid="lead-reference-toggle"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-sm">
                  <StickyNote className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold uppercase tracking-[0.08em] text-sky-900">
                    Lead Notes
                  </span>
                  <span className="block truncate text-[11px] text-emerald-700/90">{subtitle}</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 rotate-180 text-sky-700" />
              </button>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                aria-label="Add note"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm transition-colors hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="scrollbar-thin max-h-[min(60vh,420px)] space-y-3 overflow-y-auto px-3.5 py-3">
              <div className="rounded-[10px] border border-sky-200/80 bg-white/90 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">Key Items</p>
                <textarea
                  value={keyItems}
                  onChange={(e) => onKeyItemsChange(e.target.value)}
                  rows={2}
                  placeholder="HFB, bar tab, casino…"
                  className="mt-1.5 w-full resize-y rounded-[8px] border border-sky-100 bg-sky-50/50 px-2.5 py-2 text-[12.5px] font-semibold leading-snug text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                />
              </div>

              <div className="rounded-[10px] border border-emerald-200/80 bg-white/90 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                  Progress Notes
                </p>
                <textarea
                  value={progressNotes}
                  onChange={(e) => onProgressNotesChange(e.target.value)}
                  rows={4}
                  placeholder="Editable progress notes…"
                  className="mt-1.5 w-full resize-y rounded-[8px] border border-emerald-100 bg-emerald-50/40 px-2.5 py-2 text-[12px] leading-relaxed text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              <AnimatePresence initial={false}>
                {adding ? (
                  <motion.div
                    key="add-note"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-[10px] border border-dashed border-sky-300 bg-sky-50/70 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">
                        New note
                      </p>
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Type a note… #calls #logistics"
                        className="mt-1.5 w-full resize-y rounded-[8px] border border-sky-200 bg-white px-2.5 py-2 text-[12px] leading-relaxed text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {notes.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800/80">
                    Saved notes
                  </p>
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="group relative rounded-[10px] border border-emerald-100 bg-white px-3 py-2 shadow-sm"
                    >
                      <textarea
                        value={n.text}
                        onChange={(e) => setNotes(updateNote(leadKey, n.id, e.target.value))}
                        rows={2}
                        className="w-full resize-y border-0 bg-transparent p-0 text-[12px] leading-relaxed text-slate-800 outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Delete note"
                        onClick={() => setNotes(deleteNote(leadKey, n.id))}
                        className="absolute right-1.5 top-1.5 rounded-full p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 border-t border-sky-100/90 bg-white/70 px-3.5 py-2.5">
              <button
                type="button"
                onClick={handleGo}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-sky-600 to-emerald-600 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.1em] text-white shadow-sm transition-opacity hover:opacity-95"
              >
                Go
              </button>
              <button
                type="button"
                onClick={onToggle}
                className="rounded-full border border-sky-200 px-3 py-2 text-[11px] font-semibold text-sky-800 hover:bg-sky-50"
              >
                Collapse
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LeadReferenceCard;
