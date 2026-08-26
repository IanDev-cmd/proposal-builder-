import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right">
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map(function ({ id, title, description, action, variant, ...props }) {
          return (
            <Toast key={id} variant={variant} {...props} asChild data-testid={variant === 'success' ? 'toast-success' : undefined}>
              <motion.li
                layout
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 28, transition: { duration: 0.18 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
                className="list-none"
              >
                <div className="flex items-start gap-3">
                  {variant === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2F7CF6]" strokeWidth={2.2} />
                  ) : variant === 'destructive' ? (
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-white" strokeWidth={2.2} />
                  ) : null}
                  <div className="grid gap-1">
                    {title && <ToastTitle>{title}</ToastTitle>}
                    {description && <ToastDescription>{description}</ToastDescription>}
                  </div>
                </div>
                {action}
                <ToastClose />
              </motion.li>
            </Toast>
          );
        })}
      </AnimatePresence>
      <ToastViewport />
    </ToastProvider>
  );
}
