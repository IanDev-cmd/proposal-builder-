import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Plus, X, Package, ClipboardList, Minus } from 'lucide-react';
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

function SentenceList({
  value,
  onChange,
  placeholder,
  accent,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  accent: 'green' | 'blue';
}) {
  const sentences = splitSentences(value);
  const ring = accent === 'green' ? 'focus:ring-emerald-200' : 'focus:ring-sky-200';
  const border = accent === 'green' ? 'border-emerald-100' : 'border-sky-100';

  if (sentences.length === 0) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className={`w-full resize-y rounded-[10px] border ${border} bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-700 outline-none focus:ring-2 ${ring}`}
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {sentences.map((sentence, i) => (
        <textarea
          key={`sent-${i}`}
          value={sentence}
          onChange={(e) => {
            const next = [...sentences];
            next[i] = e.target.value;
            onChange(joinSentences(next));
          }}
          rows={Math.min(4, Math.max(2, Math.ceil(sentence.length / 48)))}
          className={`w-full resize-y rounded-[10px] border ${border} bg-white px-3.5 py-3 text-[13px] leading-[1.65] text-slate-700 outline-none focus:ring-2 ${ring}`}
        />
      ))}
    </div>
  );
}

/**
 * Docked Notes panel — one card for Key Items + Progress Notes (per-sentence spacing).
 * Collapses to a "notes" rectangle. Does not overlay the form.
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

  const noteCount = notes.length + (keyItems?.trim() ? 1 : 0) + (progressNotes?.trim() ? 1 : 0);
  const subtitle = useMemo(() => {
    if (savedFlash) return 'Saved locally';
    if (noteCount === 0) return 'Add notes';
    return `${noteCount} note${noteCount === 1 ? '' : 's'}`;
  }, [noteCount, savedFlash]);

  return (
    <div className="flex h-full flex-col items-stretch px-3 py-5" data-testid="lead-reference-card">
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
            {noteCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-sky-700 shadow">
                {noteCount > 9 ? '9+' : noteCount}
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
            <div className="mb-3 flex items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-3 py-2 shadow-sm">
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
                  <span className="block text-[12px] font-bold uppercase tracking-[0.1em] text-slate-800">
                    Notes
                  </span>
                  <span className="block text-[11px] text-slate-500">{subtitle}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAdding((v) => !v)}
                aria-label="Add note"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Collapse notes"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto pb-2 pr-0.5">
              <div className="overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-sm">
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-sky-500" />
                <div className="space-y-5 px-4 py-4">
                  <section>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Package className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-emerald-800">
                        Key Items
                      </p>
                    </div>
                    <SentenceList
                      value={keyItems}
                      onChange={onKeyItemsChange}
                      placeholder="HFB, bar tab, casino…"
                      accent="green"
                    />
                  </section>

                  <div className="h-px bg-slate-100" />

                  <section>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-white">
                        <ClipboardList className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                      <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-sky-800">
                        Progress Notes
                      </p>
                    </div>
                    <SentenceList
                      value={progressNotes}
                      onChange={onProgressNotesChange}
                      placeholder="Editable progress notes…"
                      accent="blue"
                    />
                  </section>
                </div>
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
                    <div className="rounded-[14px] border border-dashed border-sky-300 bg-white px-3.5 py-3 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700">
                        New note
                      </p>
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Type a note… #calls #logistics"
                        className="mt-2 w-full resize-y rounded-[8px] border border-sky-200 bg-sky-50/50 px-3 py-2.5 text-[12px] leading-relaxed text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {notes.length > 0 ? (
                <div className="space-y-2.5">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="group relative rounded-[12px] border border-slate-200 bg-white px-3.5 py-3 shadow-sm"
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
                        className="absolute right-1.5 top-1.5 rounded-full p-1 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleSave}
                className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-sky-600 to-emerald-600 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-white shadow-sm"
              >
                Save
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LeadReferenceCard;
