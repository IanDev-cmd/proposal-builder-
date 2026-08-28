/** Normalize unknown thrown values into a user-facing message. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  return fallback;
}

/** Apps Script / Sheets API failure — action + HTTP status when available. */
export class SheetsApiError extends Error {
  readonly path: string;
  readonly status?: number;

  constructor(path: string, status?: number, message?: string) {
    const statusPart = status != null ? ` (${status})` : '';
    super(message?.trim() || `${path} failed${statusPart}`);
    this.name = 'SheetsApiError';
    this.path = path;
    this.status = status;
  }
}

export function isSheetsApiError(err: unknown): err is SheetsApiError {
  return err instanceof SheetsApiError;
}

export class TimeoutError extends Error {
  readonly timeoutMs?: number;

  constructor(message = 'Request timed out', timeoutMs?: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export function isTimeoutError(err: unknown): err is TimeoutError {
  return err instanceof TimeoutError;
}
