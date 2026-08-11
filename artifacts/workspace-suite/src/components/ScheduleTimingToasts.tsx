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
  edge: string;
  ring: string;
  tint: string;
  accent: string;
};

const TOAST_META: ToastMeta[] = [
  {
    id: 'heading',
    label: 'Itinerary',
    icon: Clock,
    edge: 'bg-sky-600',
    ring: 'border-sky-200',
    tint: 'bg-white',
    accent: 'from-sky-600 to-emerald-600',
  },
  {
    id: 'embark',
    label: 'Embarkation',
    icon: LogIn,
    edge: 'bg-emerald-500',
    ring: 'border-emerald-200',
    tint: 'bg-white',
    accent: 'from-emerald-500 to-emerald-600',
  },
  {
    id: 'depart',
    label: 'Departure',
    icon: ArrowRightCircle,
    edge: 'bg-sky-500',
    ring: 'border-sky-200',
    tint: 'bg-white',
    accent: 'from-sky-500 to-sky-600',
  },
  {
    id: 'return',
    label: 'Return',
    icon: ArrowLeftCircle,
    edge: 'bg-amber-400',
    ring: 'border-amber-200',
    tint: 'bg-white',
    accent: 'from-amber-400 to-amber-500',
  },
  {
    id: 'disembark',
    label: 'Disembarkation',
    icon: LogOut,
    edge: 'bg-slate-800',
    ring: 'border-slate-200',
    tint: 'bg-white',
    accent: 'from-slate-700 to-slate-900',
  },
  {
    id: 'pier',
    label: 'Pier stop',
    icon: Anchor,
    edge: 'bg-teal-500',
    ring: 'border-teal-200',
    tint: 'bg-white',
    accent: 'from-teal-500 to-teal-600',
  },
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
 * Real toast popups for proposal timings — Schedule Timings step only.
 * Slide in from the right edge; newer toasts push older ones up.
 * Persist until the X button is pressed (no auto-dismiss).
 */
export function ScheduleTimingToasts({
  timings,
  proposalTimingsNotes,
  proposalTimingsAuto,
  onResetAuto,
  onNotesChange,
}: Props) {
  const parsed =
    parseItineraryProposalText(proposalTimingsNotes) || buildItineraryProposalBlock(timings);
  const lines = useMemo(() => [parsed.heading, ...parsed.items], [parsed.heading, parsed.items]);

  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [revealedCount, setRevealedCount] = useState(0);
  const [revealSeed, setRevealSeed] = useState(0);
  const seqRef = useRef(0);

  // Staggered reveal from the right — only on mount / Reset, not on every keystroke
  useEffect(() => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setRevealedCount(0);
    const timers: number[] = [];
    const total = Math.max(lines.length, TOAST_META.length);
    for (let i = 0; i < total; i++) {
      timers.push(
        window.setTimeout(() => {
          if (seqRef.current !== seq) return;
          setRevealedCount((n) => Math.max(n, i + 1));
        }, 160 + i * 200),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revealSeed gates restagger
  }, [revealSeed]);

  useEffect(() => {
    setRevealSeed(1);
  }, []);

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
      {/* Inline control strip — toasts themselves are viewport-fixed */}
      <div className="mt-7 flex items-center justify-between gap-3" data-testid="schedule-timing-toasts">
        <p className="text-[12.5px] font-semibold text-gray-700">
          Proposal timings
          <span className="ml-2 text-[11px] font-normal text-gray-400">
            Toast popups on the right — close with ×
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

      {/* Fixed right-edge toast stack — new items at bottom push older ones up */}
      <div
        className="pointer-events-none fixed bottom-6 right-5 z-[60] flex w-[min(calc(100vw-1.5rem),360px)] flex-col justify-end gap-2.5"
        aria-live="polite"
      >
        <LayoutGroup>
          <AnimatePresence initial={false}>
            {visible.map((toast) => {
              const meta = TOAST_META[Math.min(toast.metaIndex, TOAST_META.length - 1)];
              const Icon = meta.icon;
              const isHeading = toast.metaIndex === 0;
              return (
                <motion.div
                  key={toast.key}
                  layout
                  initial={{ opacity: 0, x: 80, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 64, scale: 0.96 }}
                  transition={{
                    type: 'spring',
                    stiffness: 380,
                    damping: 32,
                    mass: 0.85,
                  }}
                  className={`pointer-events-auto relative overflow-hidden rounded-[14px] border ${meta.ring} ${meta.tint} shadow-[0_12px_32px_-8px_rgba(15,23,42,0.28)]`}
                >
                  <div className={`absolute left-0 top-0 h-full w-1.5 ${meta.edge}`} />
                  {isHeading ? (
                    <div className={`absolute inset-0 bg-gradient-to-r ${meta.accent} opacity-[0.08]`} />
                  ) : null}
                  <div className="relative flex items-start gap-3 px-3.5 py-3 pl-4">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white shadow-sm ${meta.edge}`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                        {meta.label}
                      </p>
                      {isHeading ? (
                        <textarea
                          value={toast.text}
                          onChange={(e) => writeBackLine(toast.metaIndex, e.target.value)}
                          rows={2}
                          className="w-full resize-none border-0 bg-transparent p-0 text-[13px] font-semibold leading-snug text-slate-800 outline-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={toast.text}
                          onChange={(e) => writeBackLine(toast.metaIndex, e.target.value)}
                          className="w-full border-0 bg-transparent p-0 text-[13px] font-medium text-slate-800 outline-none"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Dismiss ${meta.label}`}
                      onClick={() => dismiss(toast.key)}
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" strokeWidth={2.2} />
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
