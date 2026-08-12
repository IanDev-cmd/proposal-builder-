import { motion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';

type Props = {
  color: string;
  icon: LucideIcon;
  title: string;
  value: string;
  onChange?: (value: string) => void;
  onDismiss?: () => void;
  placeholder?: string;
};

/** Shared design-system toast rectangle used by Notes and Schedule Timings. */
export function ToastRect({
  color,
  icon: Icon,
  title,
  value,
  onChange,
  onDismiss,
  placeholder,
}: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 36 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.8 }}
      className="relative flex overflow-hidden rounded-[4px] bg-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.22),0_2px_6px_rgba(15,23,42,0.08)]"
    >
      <div className="w-[4px] shrink-0" style={{ backgroundColor: color }} />
      <div className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-3 pr-1.5">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[13px] font-bold leading-none text-[#1f2937]">{title}</p>
          <textarea
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange?.(e.target.value)}
            rows={Math.min(4, Math.max(2, Math.ceil((value || placeholder || '').length / 42)))}
            className="mt-1.5 w-full resize-none border-0 bg-transparent p-0 text-[12.5px] leading-snug text-[#6b7280] outline-none placeholder:text-[#9ca3af]"
          />
        </div>
        {onDismiss ? (
          <button
            type="button"
            aria-label={`Dismiss ${title}`}
            onClick={onDismiss}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[#9ca3af] transition-colors hover:bg-gray-100 hover:text-[#4b5563]"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

export default ToastRect;
