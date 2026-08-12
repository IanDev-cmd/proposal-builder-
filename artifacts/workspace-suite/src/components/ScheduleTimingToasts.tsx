import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  Clock,
  LogIn,
  ArrowRightCircle,
  ArrowLeftCircle,
  LogOut,
  Anchor,
  X,
  RotateCcw,
} from 'lucide-react';
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
              const Icon = meta.icon;
              return (
                <motion.div
                  key={toast.key}
                  layout
                  initial={{ opacity: 0, x: 36 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 34,
                    mass: 0.8,
                  }}
                  className="relative flex overflow-hidden rounded-[4px] bg-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.22),0_2px_6px_rgba(15,23,42,0.08)]"
                >
                  <div className="w-[4px] shrink-0" style={{ backgroundColor: meta.color }} />
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-3 pr-1.5">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[13px] font-bold leading-none text-[#1f2937]">{meta.label}</p>
                      <input
                        type="text"
                        value={toast.text}
                        onChange={(e) => writeBackLine(toast.metaIndex, e.target.value)}
                        className="mt-1.5 w-full border-0 bg-transparent p-0 text-[12.5px] leading-snug text-[#6b7280] outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={`Dismiss ${meta.label}`}
                      onClick={() =>
                        setDismissed((prev) => {
                          const next = new Set(prev);
                          next.add(toast.key);
                          return next;
                        })
                      }
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[#9ca3af] transition-colors hover:bg-gray-100 hover:text-[#4b5563]"
                    >
                      <X className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}

export default ScheduleTimingToasts;
