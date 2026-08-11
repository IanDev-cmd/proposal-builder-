import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText,
  Plus,
  X,
  Package,
  ClipboardList,
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
 * Photographic sticky-note pad: paper grain, soft curl, blue→green wash.
 * Key Items + Progress Notes each carry a related icon. Collapses to a page icon.
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
            initial={{ scale: 0.85, opacity: 0, rotate: -4 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
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
            initial={{ opacity: 0, y: -10, rotate: 2, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, rotate: -1.2, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="relative w-[min(calc(100vw-1.5rem),300px)]"
          >
            {/* Tape strip */}
            <div
              aria-hidden
              className="absolute -top-2 left-1/2 z-10 h-4 w-16 -translate-x-1/2 rotate-[-2deg] rounded-[2px] bg-sky-200/70 shadow-sm backdrop-blur-[1px]"
            />

            {/* Sticky pad body — photographic paper look */}
            <div
              className="relative overflow-hidden rounded-[4px] border border-sky-200/60 shadow-[0_18px_40px_-12px_rgba(14,116,144,0.35),0_6px_14px_-6px_rgba(16,185,129,0.25)]"
              style={{
                background:
                  'linear-gradient(165deg, #e0f2fe 0%, #ecfeff 28%, #d1fae5 72%, #a7f3d0 100%)',
              }}
            >
              {/* Paper grain overlay */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-multiply"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 30%, rgba(15,23,42,0.12) 0.6px, transparent 0.7px), radial-gradient(circle at 80% 70%, rgba(15,23,42,0.1) 0.5px, transparent 0.65px)',
                  backgroundSize: '5px 5px, 7px 7px',
                }}
              />
              {/* Soft top highlight / curl */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/55 to-transparent"
              />
              {/* Folded corner */}
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 right-0 h-10 w-10"
                style={{
                  background: 'linear-gradient(225deg, transparent 48%, rgba(255,255,255,0.55) 50%, #86efac 52%)',
                  boxShadow: '-2px -2px 6px rgba(15,23,42,0.08)',
                }}
              />

              <div className="relative px-4 pb-4 pt-5">
                <div className="mb-3 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={true}
                    data-testid="lead-reference-toggle"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-md shadow-sky-700/20">
                      <StickyNote className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-[Georgia,Cambria,'Times_New_Roman',serif] text-[15px] font-bold tracking-tight text-slate-800">
                        Sticky notes
                      </span>
                      <span className="block text-[11px] font-medium text-emerald-800/80">{subtitle}</span>
                    </span>
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

                <div className="scrollbar-thin max-h-[min(58vh,400px)] space-y-3 overflow-y-auto pr-0.5">
                  {/* Key Items */}
                  <div className="rounded-[10px] border border-sky-300/40 bg-white/55 px-3 py-2.5 shadow-sm backdrop-blur-[2px]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm">
                        <Package className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">
                        Key Items
                      </p>
                    </div>
                    <textarea
                      value={keyItems}
                      onChange={(e) => onKeyItemsChange(e.target.value)}
                      rows={2}
                      placeholder="HFB, bar tab, casino…"
                      className="w-full resize-y rounded-[8px] border border-sky-100/80 bg-white/70 px-2.5 py-2 font-[Georgia,Cambria,'Times_New_Roman',serif] text-[13px] font-semibold leading-snug text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    />
                  </div>

                  {/* Progress Notes */}
                  <div className="rounded-[10px] border border-emerald-300/40 bg-white/55 px-3 py-2.5 shadow-sm backdrop-blur-[2px]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                        <ClipboardList className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-800">
                        Progress Notes
                      </p>
                    </div>
                    <textarea
                      value={progressNotes}
                      onChange={(e) => onProgressNotesChange(e.target.value)}
                      rows={4}
                      placeholder="Editable progress notes…"
                      className="w-full resize-y rounded-[8px] border border-emerald-100/80 bg-white/70 px-2.5 py-2 font-[Georgia,Cambria,'Times_New_Roman',serif] text-[12.5px] leading-relaxed text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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
                        <div className="rounded-[10px] border border-dashed border-sky-400/70 bg-white/60 px-3 py-2.5">
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
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-900/70">
                        Saved notes
                      </p>
                      {notes.map((n) => (
                        <div
                          key={n.id}
                          className="group relative rounded-[10px] border border-white/70 bg-white/70 px-3 py-2 shadow-sm"
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

                <div className="mt-3 flex items-center gap-2">
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
                    className="rounded-full border border-sky-300/70 bg-white/70 px-3 py-2 text-[11px] font-semibold text-sky-900 hover:bg-white"
                  >
                    Collapse
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LeadReferenceCard;
