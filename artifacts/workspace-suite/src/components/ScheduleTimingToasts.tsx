import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  LogIn,
  ArrowRightCircle,
  ArrowLeftCircle,
  LogOut,
  Anchor,
  HelpCircle,
} from 'lucide-react';
import {
  buildItineraryProposalBlock,
  parseItineraryProposalText,
  type TimingFields,
} from '@/lib/proposalTimings';

const TOAST_META = [
  { icon: LogIn, edge: 'bg-emerald-500', ring: 'border-emerald-200', tint: 'from-emerald-50 to-white' },
  { icon: ArrowRightCircle, edge: 'bg-sky-500', ring: 'border-sky-200', tint: 'from-sky-50 to-white' },
  { icon: ArrowLeftCircle, edge: 'bg-amber-400', ring: 'border-amber-200', tint: 'from-amber-50 to-white' },
  { icon: LogOut, edge: 'bg-slate-800', ring: 'border-slate-200', tint: 'from-slate-50 to-white' },
  { icon: Anchor, edge: 'bg-teal-500', ring: 'border-teal-200', tint: 'from-teal-50 to-white' },
] as const;

type Props = {
  timings: TimingFields;
  proposalTimingsNotes: string;
  proposalTimingsAuto: boolean;
  onResetAuto: () => void;
  onNotesChange: (text: string) => void;
};

/**
 * Rectangular toast notifications for proposal timings — Schedule Timings step only.
 * Edge time icons; editable lines sync back into proposalTimingsNotes.
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
  const heading = parsed.heading;
  const items = parsed.items;

  const writeBack = (nextHeading: string, nextItems: string[]) => {
    onNotesChange([nextHeading, ...nextItems].join('\n'));
  };

  return (
    <div className="mt-7" data-testid="schedule-timing-toasts">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="mb-0 flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-700">
          Proposal timings
          <span title="Toast cards auto-fill from the schedule — edit a card to lock manual wording">
            <HelpCircle className="h-3.5 w-3.5 text-[#7c8a82]" />
          </span>
        </label>
        {!proposalTimingsAuto ? (
          <button
            type="button"
            onClick={onResetAuto}
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-600 hover:underline"
          >
            Reset from schedule
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">Auto from schedule</span>
        )}
      </div>

      <div className="space-y-2.5">
        <motion.div
          layout
          className="relative overflow-hidden rounded-[12px] border border-sky-200 bg-gradient-to-r from-sky-600 to-emerald-600 px-4 py-3 text-white shadow-md shadow-sky-900/15"
        >
          <div className="absolute left-0 top-0 h-full w-1.5 bg-white/40" />
          <div className="flex items-start gap-3 pl-1">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/20">
              <Clock className="h-4 w-4" />
            </span>
            <textarea
              value={heading}
              onChange={(e) => writeBack(e.target.value, items)}
              rows={2}
              className="min-h-[44px] w-full resize-none border-0 bg-transparent p-0 text-[13px] font-semibold leading-snug text-white outline-none placeholder:text-white/60"
            />
          </div>
        </motion.div>

        <AnimatePresence initial={false}>
          {items.map((item, i) => {
            const meta = TOAST_META[Math.min(i, TOAST_META.length - 1)];
            const Icon = meta.icon;
            return (
              <motion.div
                key={`toast-${i}`}
                layout
                initial={{ opacity: 0, x: 16, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.22, delay: i * 0.04 }}
                className={`relative overflow-hidden rounded-[12px] border ${meta.ring} bg-gradient-to-r ${meta.tint} shadow-sm`}
              >
                <div className={`absolute left-0 top-0 h-full w-1.5 ${meta.edge}`} />
                <div className="flex items-center gap-3 px-3.5 py-3 pl-4">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-white shadow-sm ${meta.edge}`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                  </span>
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = e.target.value;
                      writeBack(heading, next);
                    }}
                    className="w-full border-0 bg-transparent text-[13px] font-medium text-slate-800 outline-none"
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <p className="mt-2 text-[11.5px] text-gray-400">
        These toast cards only show on Schedule Timings and feed the proposal itinerary block.
      </p>
    </div>
  );
}

export default ScheduleTimingToasts;
