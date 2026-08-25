import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Send, StickyNote, X } from 'lucide-react';
import {
  appendProgressNoteEntry,
  detectPointKinds,
  detectTag,
  NOTE_CATEGORIES,
  pointsFromProgressNotes,
  replaceProgressNoteEntry,
  removeProgressNoteEntry,
  type NotePoint,
  type NoteTag,
  type PointKind,
} from '@/lib/leadNotes';
import { requestLeadNotesSummary } from '@/lib/leadNotesSummary';
import {
  listOpsNotes,
  mergeOpsNotesIntoProgress,
  persistOpsNote,
} from '@/lib/opsStore';
import {
  LeadNotesTimeline,
  NoteKindAvatar,
  NOTES_BLUE,
  type TimelineCard,
} from '@/components/LeadNotesTimeline';

type Props = {
  initialEnquiry: string;
  updatedEnquiry: string;
  progressNotes: string;
  isOpen: boolean;
  onToggle: () => void;
  onUpdatedEnquiryChange: (value: string) => void;
  onProgressNotesChange: (value: string) => void;
  leadKey?: string;
  leadName?: string;
  referenceNumber?: string;
  email?: string;
};

/**
 * Docked Lead Notes — timeline of enquiry + progress points, cloned from the
 * schedule-card reference (rounded cards, rail, expand, plus).
 */
export function LeadReferenceCard({
  initialEnquiry,
  updatedEnquiry,
  progressNotes,
  isOpen,
  onToggle,
  onUpdatedEnquiryChange,
  onProgressNotesChange,
  leadKey,
  leadName,
  referenceNumber,
  email,
}: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>('enquiry');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [manualTag, setManualTag] = useState<NoteTag | null>(null);
  const [geminiPoints, setGeminiPoints] = useState<NotePoint[] | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const hydratedRef = useRef<string | null>(null);

  const showUpdated =
    updatedEnquiry.trim() &&
    updatedEnquiry.trim() !== initialEnquiry.trim();

  const localProgress = useMemo(
    () => pointsFromProgressNotes(progressNotes).map((p) => ({ ...p, editable: true })),
    [progressNotes],
  );

  const progressCards: TimelineCard[] = useMemo(() => {
    if (geminiPoints?.length) {
      return geminiPoints.map((p) => ({
        ...p,
        editable: p.sourceIndex != null,
      }));
    }
    return localProgress;
  }, [geminiPoints, localProgress]);

  const cards: TimelineCard[] = useMemo(() => {
    const list: TimelineCard[] = [
      {
        id: 'enquiry',
        title: 'Enquiry',
        summary: initialEnquiry.trim() || 'No initial enquiry on the lead sheet.',
        body: initialEnquiry.trim() || 'No initial enquiry on the lead sheet.',
        kind: 'enquiry',
        kinds: ['enquiry'] as PointKind[],
        when: 'Initial',
        sourceIndex: null,
      },
    ];
    if (showUpdated) {
      list.push({
        id: 'discovery',
        title: 'Key items',
        summary: updatedEnquiry.trim(),
        body: updatedEnquiry.trim(),
        kind: 'discovery',
        kinds: ['discovery'] as PointKind[],
        when: 'Updated',
        sourceIndex: null,
        editable: true,
      });
    }
    return [...list, ...progressCards];
  }, [initialEnquiry, showUpdated, updatedEnquiry, progressCards]);

  const fetchSummary = useCallback(
    async (force = false) => {
      if (!progressNotes.trim()) {
        setGeminiPoints(null);
        return;
      }
      setSummarizing(true);
      try {
        const points = await requestLeadNotesSummary({
          notes: progressNotes,
          leadKey,
          leadName,
          referenceNumber,
        });
        if (points && (force || points.length)) setGeminiPoints(points);
      } finally {
        setSummarizing(false);
      }
    },
    [progressNotes, leadKey, leadName, referenceNumber],
  );

  useEffect(() => {
    if (!progressNotes.trim()) {
      setGeminiPoints(null);
      return;
    }
    let cancelled = false;
    requestLeadNotesSummary({
      notes: progressNotes,
      leadKey,
      leadName,
      referenceNumber,
    }).then((points) => {
      if (!cancelled && points?.length) setGeminiPoints(points);
    });
    return () => {
      cancelled = true;
    };
    // Lead change or first notes payload — edits stay local until sparkle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadKey, Boolean(progressNotes.trim())]);

  useEffect(() => {
    const ref = String(referenceNumber || '').trim();
    if (!ref || hydratedRef.current === ref) return;
    let cancelled = false;
    void listOpsNotes(ref).then((notes) => {
      if (cancelled || !notes.length) {
        if (!cancelled) hydratedRef.current = ref;
        return;
      }
      hydratedRef.current = ref;
      onProgressNotesChange(mergeOpsNotesIntoProgress(progressNotes, notes));
    });
    return () => {
      cancelled = true;
    };
    // Hydrate once per lead so typing is not overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceNumber]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen]);

  function handleSelect(id: string) {
    setActiveId((cur) => (cur === id ? null : id));
  }

  function handleEditBody(card: TimelineCard, value: string) {
    if (card.id === 'discovery') {
      onUpdatedEnquiryChange(value);
      return;
    }
    if (card.sourceIndex == null) return;
    onProgressNotesChange(replaceProgressNoteEntry(progressNotes, card.sourceIndex, value));
    setGeminiPoints((prev) =>
      prev
        ? prev.map((p) => (p.id === card.id ? { ...p, body: value, summary: value } : p))
        : prev,
    );
  }

  function handleDeleteCard(card: TimelineCard) {
    if (card.id === 'enquiry') return;
    if (card.id === 'discovery') {
      onUpdatedEnquiryChange('');
      setActiveId('enquiry');
      return;
    }
    if (card.sourceIndex == null) return;
    onProgressNotesChange(removeProgressNoteEntry(progressNotes, card.sourceIndex));
    setGeminiPoints(null);
    setActiveId('enquiry');
  }

  function handleSaveNote() {
    if (!draft.trim()) return;
    const tag = manualTag ?? detectTag(draft);
    const tagged = tag ? `${draft.trim()} #${tag}` : draft.trim();
    onProgressNotesChange(appendProgressNoteEntry(progressNotes, tagged));
    void persistOpsNote({
      referenceNumber,
      email,
      leadName,
      note: tagged,
      tag: tag || undefined,
    });
    setDraft('');
    setManualTag(null);
    setAdding(false);
    setGeminiPoints(null);
    setActiveId(`progress-${pointsFromProgressNotes(appendProgressNoteEntry(progressNotes, tagged)).length - 1}`);
  }

  const composer = adding ? (
    <AddNoteComposer
      draft={draft}
      onDraft={setDraft}
      manualTag={manualTag}
      onManualTag={setManualTag}
      onSave={handleSaveNote}
      onClose={() => setAdding(false)}
    />
  ) : null;

  const timeline = (
    <LeadNotesTimeline
      cards={cards}
      activeId={activeId}
      onSelect={handleSelect}
      fullscreen={fullscreen}
      onToggleFullscreen={() => setFullscreen((v) => !v)}
      onAdd={() => setAdding(true)}
      onSummarize={() => fetchSummary(true)}
      summarizing={summarizing}
      onEditBody={handleEditBody}
      onDelete={handleDeleteCard}
    >
      {composer}
    </LeadNotesTimeline>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white" data-testid="lead-reference-card">
      <button
        type="button"
        onClick={() => {
          if (fullscreen) setFullscreen(false);
          onToggle();
        }}
        aria-expanded={isOpen}
        className={`flex shrink-0 items-center text-left transition-colors hover:bg-slate-50 ${
          isOpen ? 'gap-2 px-5 py-4' : 'justify-center px-2 py-4'
        }`}
        data-testid="lead-reference-toggle"
      >
        <StickyNote className="h-4 w-4 shrink-0" style={{ color: NOTES_BLUE }} strokeWidth={2} />
        {isOpen ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-slate-800">
              Lead Notes
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 rotate-180 text-slate-500 transition-transform duration-200" />
          </>
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && !fullscreen ? (
          <motion.div
            key="lead-notes-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {timeline}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {fullscreen
        ? createPortal(
            <div
              className="fixed inset-0 z-[320] flex flex-col bg-white"
              role="dialog"
              aria-modal="true"
              aria-label="Lead notes full screen"
              data-testid="lead-notes-fullscreen"
            >
              <div className="flex shrink-0 items-center gap-2 px-6 py-4">
                <StickyNote className="h-4 w-4" style={{ color: NOTES_BLUE }} strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-slate-800">
                  Lead Notes
                  {leadName ? ` · ${leadName}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreen(false)}
                  aria-label="Close full screen"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {timeline}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function AddNoteComposer({
  draft,
  onDraft,
  manualTag,
  onManualTag,
  onSave,
  onClose,
}: {
  draft: string;
  onDraft: (v: string) => void;
  manualTag: NoteTag | null;
  onManualTag: (t: NoteTag | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const detected = manualTag ?? (draft.trim() ? detectTag(draft) : null);
  const kinds = detectPointKinds(draft || (detected ? `#${detected}` : ''));

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="rounded-[22px] bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)] ring-1 ring-slate-100"
      data-testid="lead-notes-composer"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-700">Add a note</p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close composer">
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        placeholder="e.g. Budget £12k, 60 guests, Avontuur evening…"
        rows={3}
        className="w-full resize-none rounded-[14px] bg-[#F3F4F6] px-3 py-2.5 text-[13px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {NOTE_CATEGORIES.map((cat) => {
          const active = (manualTag ?? detected) === cat.tag;
          return (
            <button
              key={cat.tag}
              type="button"
              onClick={() => onManualTag(active && manualTag === cat.tag ? null : cat.tag)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                active ? 'text-white' : 'bg-slate-100 text-slate-500'
              }`}
              style={active ? { backgroundColor: cat.color } : undefined}
            >
              {cat.hashtag}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex">
          {kinds.slice(0, 4).map((kind, i) => (
            <NoteKindAvatar key={kind} kind={kind} size={24} className={i === 0 ? '' : '-ml-1.5'} />
          ))}
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!draft.trim()}
          className="flex items-center gap-1.5 rounded-[12px] px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: NOTES_BLUE }}
        >
          <Send className="h-3.5 w-3.5" />
          Save
        </button>
      </div>
    </div>
  );
}

export default LeadReferenceCard;
