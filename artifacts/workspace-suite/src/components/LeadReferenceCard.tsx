import { useEffect, useRef } from 'react';
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

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      placeholder={placeholder}
      className={`w-full resize-none overflow-hidden bg-transparent outline-none ring-0 ${className}`}
    />
  );
}

/**
 * Docked Lead Notes — blue palette, editable, full text visible (no inner scroll).
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
    <div className="flex h-full min-h-0 flex-col bg-sky-50" data-testid="lead-reference-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex shrink-0 items-center text-left transition-colors hover:bg-sky-100/60 ${
          isOpen ? 'gap-2 px-5 py-4' : 'justify-center px-2 py-4'
        }`}
        data-testid="lead-reference-toggle"
      >
        <StickyNote className="h-4 w-4 shrink-0 text-sky-700" strokeWidth={2} />
        {isOpen ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-sky-900">
              Lead Notes
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 rotate-180 text-sky-700 transition-transform duration-200" />
          </>
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="lead-notes-body"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="px-5 pb-6"
          >
            <div className="space-y-8">
              <div>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700/70">
                  Key Items
                </p>
                <AutoTextarea
                  value={keyItems}
                  onChange={onKeyItemsChange}
                  placeholder="No key items yet — add them here."
                  className="text-[14px] font-semibold leading-[1.65] text-sky-950"
                />
              </div>
              <div>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700/70">
                  Full Progress Notes
                </p>
                <AutoTextarea
                  value={progressNotes}
                  onChange={onProgressNotesChange}
                  placeholder="No progress notes yet."
                  className="text-[13px] leading-[1.75] text-sky-950/90"
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default LeadReferenceCard;
