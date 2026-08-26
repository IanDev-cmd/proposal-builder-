import { AlertCircle, CheckCircle2 } from 'lucide-react';
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
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props} data-testid={variant === 'success' ? 'toast-success' : undefined}>
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
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
