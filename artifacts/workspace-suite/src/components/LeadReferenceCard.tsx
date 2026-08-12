import { AnimatePresence, motion } from 'framer-motion';
import { StickyNote, ChevronDown } from 'lucide-react';

type Props = {
  keyItems: string;
  progressNotes: string;
  isOpen: boolean;
  onToggle: () => void;
  onKeyItemsChange: (value: string) => void;
  onProgressNotesChange: (value: string) => void;
};

/**
 * Floating Lead Notes card — yesterday’s collapsible sticky layout,
 * blue palette, editable Key Items + Progress Notes.
 */
export function LeadReferenceCard({
  keyItems,
  progressNotes,
  isOpen,
  onToggle,
  onKeyItemsChange,
  onProgressNotesChange,
}: Props) {
  return (
    <div
      className="fixed right-6 top-20 z-40 w-[min(calc(100vw-1.5rem),300px)]"
      data-testid="lead-reference-card"
    >
      <div className="overflow-hidden rounded-[12px] border border-sky-200 bg-sky-50 shadow-lg shadow-sky-900/10">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-sky-100/70"
          data-testid="lead-reference-toggle"
        >
          <StickyNote className="h-4 w-4 shrink-0 text-sky-700" strokeWidth={2} />
          <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-sky-900">
            Lead Notes
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-sky-700 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              key="lead-notes-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="scrollbar-thin max-h-72 space-y-3 overflow-y-auto border-t border-sky-200/80 px-3.5 pb-3.5 pt-3">
                <div className="rounded-[8px] border border-sky-300/70 bg-sky-100/80 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-800">
                    Key Items
                  </p>
                  <textarea
                    value={keyItems}
                    onChange={(e) => onKeyItemsChange(e.target.value)}
                    rows={3}
                    placeholder="No key items yet — add them here."
                    className="mt-1.5 w-full resize-y rounded-[6px] border border-sky-200 bg-white/80 px-2.5 py-2 text-[13px] font-semibold leading-snug text-sky-950 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700/80">
                    Full Progress Notes
                  </p>
                  <textarea
                    value={progressNotes}
                    onChange={(e) => onProgressNotesChange(e.target.value)}
                    rows={5}
                    placeholder="No progress notes yet."
                    className="mt-1.5 w-full resize-y rounded-[6px] border border-sky-200 bg-white/80 px-2.5 py-2 text-[12px] leading-relaxed text-sky-950/90 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default LeadReferenceCard;
