import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FileText,
  Plus,
  X,
  Package,
  ClipboardList,
  Check,
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

/** Flash-message style sticky card (curved header + icon) — Key Items / Progress Notes. */
function FlashStickyCard({
  tone,
  title,
  icon: Icon,
  value,
  onChange,
  placeholder,
  rows,
}: {
  tone: 'green' | 'blue';
  title: string;
  icon: typeof Package;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
}) {
  const header = tone === 'green' ? 'bg-[#22c55e]' : 'bg-[#3b82f6]';
  const btn = tone === 'green' ? 'bg-[#22c55e] hover:bg-[#16a34a]' : 'bg-[#3b82f6] hover:bg-[#2563eb]';

  return (
    <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_14px_36px_-12px_rgba(15,23,42,0.28)]">
      {/* Colored header with icon — curved bottom like flash-message reference */}
      <div className={`relative h-[88px] ${header}`}>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className="h-10 w-10 text-white/95" strokeWidth={1.6} />
        </div>
        <svg
          className="absolute -bottom-px left-0 h-8 w-full text-white"
          viewBox="0 0 320 32"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0 32 C80 4 240 4 320 32 L320 32 L0 32 Z" fill="currentColor" />
        </svg>
      </div>

      <div className="px-4 pb-4 pt-1 text-center">
        <p className="text-[15px] font-black uppercase tracking-[0.04em] text-slate-900">{title}</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="mt-2 w-full resize-y rounded-[10px] border border-slate-100 bg-slate-50/80 px-2.5 py-2 text-left text-[12.5px] leading-relaxed text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
        />
        <div className={`mx-auto mt-3 h-2 w-10 rounded-full ${tone === 'green' ? 'bg-emerald-200' : 'bg-sky-200'}`} />
        <button
          type="button"
          tabIndex={-1}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[12px] font-bold text-white shadow-sm ${btn}`}
          onClick={(e) => e.preventDefault()}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          Edit
        </button>
      </div>
    </div>
  );
}

/**
 * Sticky notes panel — flash-message cards for Key Items (green) + Progress Notes (blue).
 * Collapses smoothly to a page icon.
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
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="w-[min(calc(100vw-1.5rem),300px)]"
          >
            <div className="mb-2 flex items-center gap-2 rounded-[14px] border border-slate-200/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={true}
                data-testid="lead-reference-toggle"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-sky-500 to-emerald-500 text-white">
                  <FileText className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-bold uppercase tracking-[0.08em] text-slate-800">
                    Sticky notes
                  </span>
                  <span className="block text-[11px] text-slate-500">{subtitle}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                aria-label="Add note"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="scrollbar-thin max-h-[min(70vh,560px)] space-y-3 overflow-y-auto pb-1 pr-0.5">
              <FlashStickyCard
                tone="green"
                title="Key Items"
                icon={Package}
                value={keyItems}
                onChange={onKeyItemsChange}
                placeholder="HFB, bar tab, casino…"
                rows={3}
              />
              <FlashStickyCard
                tone="blue"
                title="Progress Notes"
                icon={ClipboardList}
                value={progressNotes}
                onChange={onProgressNotesChange}
                placeholder="Editable progress notes…"
                rows={4}
              />

              <AnimatePresence initial={false}>
                {adding ? (
                  <motion.div
                    key="add-note"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-[14px] border border-dashed border-sky-300 bg-white px-3 py-2.5 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">
                        New note
                      </p>
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Type a note… #calls #logistics"
                        className="mt-1.5 w-full resize-y rounded-[8px] border border-sky-200 bg-sky-50/50 px-2.5 py-2 text-[12px] leading-relaxed text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {notes.length > 0 ? (
                <div className="space-y-2">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="group relative rounded-[12px] border border-slate-200 bg-white px-3 py-2 shadow-sm"
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

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleGo}
                  className="flex flex-1 items-center justify-center rounded-full bg-gradient-to-r from-sky-600 to-emerald-600 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-white shadow-sm"
                >
                  Go
                </button>
                <button
                  type="button"
                  onClick={onToggle}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Collapse
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LeadReferenceCard;
