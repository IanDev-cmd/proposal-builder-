import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Share2, X } from 'lucide-react';

export type ShareOverlayTarget = {
  label: string;
  icon: LucideIcon;
  color: string;
  onClick: () => void;
};

export function ShareTriggerButton({
  onClick,
  label = 'Share',
  color = 'green',
  fullWidth = false,
}: {
  onClick: () => void;
  label?: string;
  color?: 'green' | 'blue';
  fullWidth?: boolean;
}) {
  const bg = color === 'green' ? 'bg-[#16a34a] hover:bg-[#15803d]' : 'bg-blue-600 hover:bg-blue-700';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="share-trigger"
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[12.5px] font-bold text-white shadow-sm transition-colors ${bg} ${
        fullWidth ? 'w-full' : 'shrink-0'
      }`}
    >
      <Share2 className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function ShareOverlay({
  open,
  title,
  subtitle,
  targets,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  targets: ShareOverlayTarget[];
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="share-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-[calc(100vw-2rem)] rounded-[20px] bg-white p-7 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-overlay-title"
            data-testid="share-overlay"
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 id="share-overlay-title" className="text-[16px] font-bold text-black/85">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-black/35 hover:bg-black/5 hover:text-black transition-colors"
                aria-label="Close share menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {subtitle ? <p className="mb-6 truncate text-[12.5px] text-black/40">{subtitle}</p> : <div className="mb-6" />}
            <div className={`grid gap-3 ${targets.length > 5 ? 'grid-cols-4' : 'grid-cols-5'}`}>
              {targets.map(({ label, icon: Icon, color, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="flex flex-col items-center gap-2 rounded-[14px] p-2 transition-colors hover:bg-black/4"
                >
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-center text-[10px] font-semibold leading-tight text-black/60">{label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
