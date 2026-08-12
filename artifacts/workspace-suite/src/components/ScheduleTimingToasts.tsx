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

/** Design-system toast palette (Success / Info / Warning style) with time icons. */
type ToastMeta = {
  id: string;
  label: string;
  icon: typeof Clock;
  /** Left accent bar + icon circle */
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
 * Proposal timings as design-system toast notifications.
 * Slide in from the right; stack pushes older toasts up; dismiss only via ×.
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

  const dismiss = (key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
  };

  const restoreAll = () => {
    setDismissed(new Set());
    setRevealSeed((s) => s + 1);
    onResetAuto();
  };

  return (
    <>
      <div className="mt-7 flex items-center justify-between gap-3" data-testid="schedule-timing-toasts">
        <p className="text-[12.5px] font-semibold text-gray-700">
          Proposal timings
          <span className="ml-2 text-[11px] font-normal text-gray-400">
            Pop up from the right — close with ×
          </span>
        </p>
        <button
          type="button"
          onClick={restoreAll}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-600 hover:underline"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset toasts
        </button>
      </div>

      {/* Fixed right-edge stack — newest at bottom pushes older ones up */}
      <div
        className="pointer-events-none fixed bottom-6 right-5 z-[60] flex w-[min(calc(100vw-1.75rem),380px)] flex-col justify-end gap-3"
        aria-live="polite"
      >
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {visible.map((toast) => {
              const meta = TOAST_META[Math.min(toast.metaIndex, TOAST_META.length - 1)];
              const Icon = meta.icon;
              return (
                <motion.div
                  key={toast.key}
                  layout
                  initial={{ opacity: 0, x: 96 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 80 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 34,
                    mass: 0.8,
                  }}
                  className="pointer-events-auto relative flex overflow-hidden rounded-[4px] bg-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.22),0_2px_6px_rgba(15,23,42,0.08)]"
                >
                  {/* Left accent bar — matches design-system encyclopedia toasts */}
                  <div className="w-[4px] shrink-0" style={{ backgroundColor: meta.color }} />

                  <div className="flex min-w-0 flex-1 items-start gap-3 px-3.5 py-3.5 pr-2">
                    {/* Circular status / time icon */}
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.4} />
                    </span>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[14px] font-bold leading-none text-[#1f2937]">{meta.label}</p>
                      <input
                        type="text"
                        value={toast.text}
                        onChange={(e) => writeBackLine(toast.metaIndex, e.target.value)}
                        className="mt-1.5 w-full border-0 bg-transparent p-0 text-[13px] leading-snug text-[#6b7280] outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      aria-label={`Dismiss ${meta.label}`}
                      onClick={() => dismiss(toast.key)}
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
    </>
  );
}

export default ScheduleTimingToasts;
