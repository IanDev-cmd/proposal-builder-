import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Send, StickyNote, X } from 'lucide-react';
import {
  buildItineraryProposalBlock,
  formatClockLabel,
  itineraryHours,
  parseItineraryProposalText,
  type TimingFields,
} from '@/lib/proposalTimings';
import { timeLabelFromNote, type PointKind } from '@/lib/leadNotes';
import {
  LeadNotesTimeline,
  NoteKindAvatar,
  NOTES_BLUE,
  type TimelineCard,
} from '@/components/LeadNotesTimeline';

type Props = {
  timings: TimingFields;
  proposalTimingsNotes: string;
  isOpen: boolean;
  onToggle: () => void;
  onNotesChange: (text: string) => void;
  onResetAuto: () => void;
};

const SLOT_META: {
  id: string;
  title: string;
  kind: PointKind;
  kinds: PointKind[];
  match: RegExp;
  when: (t: TimingFields) => string;
}[] = [
  {
    id: 'heading',
    title: 'Itinerary',
    kind: 'timing',
    kinds: ['timing'],
    match: /hours private venue|itinerary/i,
    when: (t) => {
      const h = itineraryHours(t);
      return `${Number.isInteger(h) ? h : h} hrs`;
    },
  },
  {
    id: 'embark',
    title: 'Embarkation',
    kind: 'logistics',
    kinds: ['logistics', 'timing'],
    match: /embark/i,
    when: (t) => formatClockLabel(t.embarkation) || 'TBC',
  },
  {
    id: 'depart',
    title: 'Departure',
    kind: 'logistics',
    kinds: ['logistics', 'timing'],
    match: /depart/i,
    when: (t) => formatClockLabel(t.departure) || 'TBC',
  },
  {
    id: 'return',
    title: 'Return',
    kind: 'logistics',
    kinds: ['logistics', 'timing'],
    match: /return/i,
    when: (t) => formatClockLabel(t.returnTime) || 'TBC',
  },
  {
    id: 'disembark',
    title: 'Disembarkation',
    kind: 'timing',
    kinds: ['timing', 'logistics'],
    match: /disembark/i,
    when: (t) => formatClockLabel(t.disembarkation) || 'TBC',
  },
];

function linesFromNotes(notes: string, timings: TimingFields): string[] {
  const parsed = parseItineraryProposalText(notes) || buildItineraryProposalBlock(timings);
  return [parsed.heading, ...parsed.items].filter(Boolean);
}

function classifyLine(line: string, index: number, used: Set<string>) {
  if (index === 0 && !used.has('heading')) {
    used.add('heading');
    return SLOT_META[0];
  }
  for (const slot of SLOT_META) {
    if (used.has(slot.id)) continue;
    if (slot.match.test(line)) {
      used.add(slot.id);
      return slot;
    }
  }
  return {
    id: `extra-${index}`,
    title: 'Timing',
    kind: 'timing' as PointKind,
    kinds: ['timing'] as PointKind[],
    when: () => timeLabelFromNote(line, `Note ${index + 1}`),
  };
}

/**
 * Schedule Timings rail — same timeline UX as Lead Notes, proposal-timings copy.
 */
export function ProposalTimingsCard({
  timings,
  proposalTimingsNotes,
  isOpen,
  onToggle,
  onNotesChange,
  onResetAuto,
}: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>('embark');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const lines = useMemo(
    () => linesFromNotes(proposalTimingsNotes, timings),
    [proposalTimingsNotes, timings],
  );

  const cards: TimelineCard[] = useMemo(() => {
    const used = new Set<string>();
    return lines.map((body, i) => {
      const slot = classifyLine(body, i, used);
      const when = slot.when(timings);
      return {
        id: slot.id,
        title: slot.title,
        summary: body,
        body,
        kind: slot.kind,
        kinds: slot.kinds,
        when,
        sourceIndex: i,
        editable: true,
      };
    });
  }, [lines, timings]);

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

  function writeLines(next: string[]) {
    onNotesChange(next.map((s) => s.trim()).filter(Boolean).join('\n'));
  }

  function handleEditBody(card: TimelineCard, value: string) {
    if (card.sourceIndex == null) return;
    const next = [...lines];
    next[card.sourceIndex] = value;
    writeLines(next);
  }

  function handleSaveLine() {
    if (!draft.trim()) return;
    writeLines([...lines, draft.trim()]);
    setActiveId(`extra-${lines.length}`);
    setDraft('');
    setAdding(false);
  }

  const composer = adding ? (
    <AddTimingComposer
      draft={draft}
      onDraft={setDraft}
      onSave={handleSaveLine}
      onClose={() => setAdding(false)}
    />
  ) : null;

  const timeline = (
    <LeadNotesTimeline
      cards={cards}
      activeId={activeId}
      onSelect={(id) => setActiveId((cur) => (cur === id ? null : id))}
      fullscreen={fullscreen}
      onToggleFullscreen={() => setFullscreen((v) => !v)}
      onAdd={() => setAdding(true)}
      onSummarize={onResetAuto}
      onEditBody={handleEditBody}
      onDelete={(card) => {
        if (card.sourceIndex == null) return;
        writeLines(lines.filter((_, i) => i !== card.sourceIndex));
        setActiveId(null);
      }}
    >
      {composer}
    </LeadNotesTimeline>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white" data-testid="proposal-timings-card">
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
        data-testid="proposal-timings-toggle"
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
            key="proposal-timings-body"
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
              aria-label="Proposal timings full screen"
              data-testid="proposal-timings-fullscreen"
            >
              <div className="flex shrink-0 items-center gap-2 px-6 py-4">
                <StickyNote className="h-4 w-4" style={{ color: NOTES_BLUE }} strokeWidth={2} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-slate-800">
                  Lead Notes
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

function AddTimingComposer({
  draft,
  onDraft,
  onSave,
  onClose,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="rounded-[22px] bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)] ring-1 ring-slate-100"
      data-testid="proposal-timings-composer"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-700">Add a timing</p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close composer">
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        placeholder="e.g. Guests board from Embankment pier…"
        rows={3}
        className="w-full resize-none rounded-[14px] bg-[#F3F4F6] px-3 py-2.5 text-[13px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
      />
      <div className="mt-3 flex items-center justify-between">
        <NoteKindAvatar kind="timing" size={24} />
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

export default ProposalTimingsCard;
