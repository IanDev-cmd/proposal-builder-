/** Normalize unknown thrown values into a user-facing message. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  return fallback;
}

/** n8n webhook failure — path + HTTP status when available. */
export class N8nWebhookError extends Error {
  readonly path: string;
  readonly status?: number;

  constructor(path: string, status?: number, message?: string) {
    const statusPart = status != null ? ` (${status})` : '';
    super(message?.trim() || `${path} failed${statusPart}`);
    this.name = 'N8nWebhookError';
    this.path = path;
    this.status = status;
  }
}

export function isN8nWebhookError(err: unknown): err is N8nWebhookError {
  return err instanceof N8nWebhookError;
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
