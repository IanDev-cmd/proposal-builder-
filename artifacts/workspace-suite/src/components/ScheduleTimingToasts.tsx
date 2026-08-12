import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Clock,
  LogIn,
  ArrowRightCircle,
  ArrowLeftCircle,
  LogOut,
  Anchor,
  RotateCcw,
} from 'lucide-react';
import { ToastRect } from '@/components/ToastRect';
import {
  buildItineraryProposalBlock,
  parseItineraryProposalText,
  type TimingFields,
} from '@/lib/proposalTimings';

type ToastMeta = {
  id: string;
  label: string;
  icon: typeof Clock;
  color: string;
};

const TOAST_META: ToastMeta[] = [
  { id: 'heading', label: 'Itinerary', icon: Clock, color: '#16a34a' },
  { id: 'embark', label: 'Embarkation', icon: LogIn, color: '#16a34a' },
  { id: 'depart', label: 'Departure', icon: ArrowRightCircle, color: '#2563eb' },
  { id: 'return', label: 'Return', icon: ArrowLeftCircle, color: '#2563eb' },
  { id: 'disembark', label: 'Disembarkation', icon: LogOut, color: '#eab308' },
  { id: 'pier', label: 'Pier stop', icon: Anchor, color: '#eab308' },
];

type Props = {
  timings: TimingFields;
  proposalTimingsNotes: string;
  proposalTimingsAuto: boolean;
  onResetAuto: () => void;
  onNotesChange: (text: string) => void;
};

type VisibleToast = {
  key: string;
  metaIndex: number;
  text: string;
};

/**
 * Proposal timings as design-system toasts, docked in the right rail.
 * One toast per second; stay until ×. Never overlay the form.
 */
export function ScheduleTimingToasts({
  timings,
  proposalTimingsNotes,
  proposalTimingsAuto: _proposalTimingsAuto,
  onResetAuto,
  onNotesChange,
}: Props) {
  const parsed =
    parseItineraryProposalText(proposalTimingsNotes) || buildItineraryProposalBlock(timings);
  const lines = useMemo(() => [parsed.heading, ...parsed.items], [parsed.heading, parsed.items]);

  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [revealedCount, setRevealedCount] = useState(0);
  const [revealSeed, setRevealSeed] = useState(1);
  const seqRef = useRef(0);

  useEffect(() => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setRevealedCount(0);
    const timers: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      timers.push(
        window.setTimeout(() => {
          if (seqRef.current !== seq) return;
          setRevealedCount((n) => Math.max(n, i + 1));
        }, 1000 + i * 1000),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealSeed]);

  const visible: VisibleToast[] = [];
  for (let i = 0; i < Math.min(revealedCount, lines.length); i++) {
    const key = `${TOAST_META[Math.min(i, TOAST_META.length - 1)].id}-${i}`;
    if (dismissed.has(key)) continue;
    visible.push({ key, metaIndex: i, text: lines[i] });
  }

  const writeBackLine = (lineIndex: number, value: string) => {
    const next = [...lines];
    next[lineIndex] = value;
    onNotesChange(next.join('\n'));
  };

  const restoreAll = () => {
    setDismissed(new Set());
    setRevealSeed((s) => s + 1);
    onResetAuto();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pb-4" data-testid="schedule-timing-toasts-rail">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Proposal timings
        </p>
        <button
          type="button"
          onClick={restoreAll}
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-600 hover:underline"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2.5 overflow-y-auto" aria-live="polite">
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {visible.map((toast) => {
              const meta = TOAST_META[Math.min(toast.metaIndex, TOAST_META.length - 1)];
              return (
                <ToastRect
                  key={toast.key}
                  color={meta.color}
                  icon={meta.icon}
                  title={meta.label}
                  value={toast.text}
                  onChange={(v) => writeBackLine(toast.metaIndex, v)}
                  onDismiss={() =>
                    setDismissed((prev) => {
                      const next = new Set(prev);
                      next.add(toast.key);
                      return next;
                    })
                  }
                />
              );
            })}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}

export default ScheduleTimingToasts;
