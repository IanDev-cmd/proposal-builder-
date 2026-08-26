/**
 * Toast notifications (Radix). Failures are blue error cards; Save Quote uses a success card.
 */
import { toast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/errors';

const DEDUPE_MS = 4000;
const recentKeys = new Map<string, number>();

function shouldShow(key: string): boolean {
  const now = Date.now();
  const last = recentKeys.get(key);
  if (last != null && now - last < DEDUPE_MS) return false;
  recentKeys.set(key, now);
  return true;
}

export type ToastErrorOpts = {
  /** Dedupe key — same key within 4s shows once. */
  key?: string;
  title: string;
  description?: string;
  err?: unknown;
};

/** Show a blue toast for failures. Errors only — no success toasts. */
export function toastError(opts: ToastErrorOpts): void {
  const description =
    opts.description?.trim() ||
    (opts.err != null ? errorMessage(opts.err) : undefined);
  const dedupeKey = opts.key || `${opts.title}:${description || ''}`;
  if (!shouldShow(dedupeKey)) return;

  toast({
    variant: 'destructive',
    title: opts.title,
    description,
  });
}

export type ToastSuccessOpts = {
  key?: string;
  title: string;
  description?: string;
};

/** Success card — used after Save Quote so it is visible on Saved Quotes. */
export function toastSuccess(opts: ToastSuccessOpts): void {
  const dedupeKey = opts.key || `ok:${opts.title}:${opts.description || ''}`;
  if (!shouldShow(dedupeKey)) return;
  toast({
    variant: 'success',
    title: opts.title,
    description: opts.description,
    duration: 5200,
  });
}
