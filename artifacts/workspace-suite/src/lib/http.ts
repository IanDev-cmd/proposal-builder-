import { TimeoutError } from '@/lib/errors';

export type FetchTimeoutInit = RequestInit & { timeoutMs?: number };

/**
 * fetch() with a hard timeout. Caller aborts still win (no TimeoutError).
 * Default 45s matches the proposal-engine workspace client.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = 45_000, signal, ...rest } = init;
  const ctrl = new AbortController();
  const timer = globalThis.setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort);
  }
  try {
    return await fetch(input, { ...rest, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted && !signal?.aborted) {
      throw new TimeoutError(`Request timed out after ${Math.round(timeoutMs / 1000)}s`, timeoutMs);
    }
    throw err;
  } finally {
    globalThis.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(blob);
  });
}
