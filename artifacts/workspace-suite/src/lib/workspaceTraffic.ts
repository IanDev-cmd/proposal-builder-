/**
 * Decisions for the workspace poller.
 * The signed-in tab reconciles summaries and writes the catalog only when it changed.
 */

export const CLOUD_REFRESH_MS = 3 * 60 * 1000;

export type CatalogPushMark = {
  catalogBuiltAt: string;
  hash: string;
};

export type QuoteSyncRow = {
  id: string;
  savedAt?: string;
  reviewedAt?: string;
  data?: Record<string, unknown> | null;
  syncRevision?: number;
  syncUpdatedAt?: string;
};

function revisionOf(row?: { syncRevision?: number } | null): number | null {
  if (!row || row.syncRevision == null) return null;
  const value = Number(row.syncRevision);
  return Number.isFinite(value) ? value : null;
}

export type QuoteSyncAction = 'upload' | 'fetch' | 'keep' | 'drop-remote';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** Stable hash of the catalog document. Key order does not change the result. */
export function catalogPayloadHash(payload: unknown): string {
  const text = stableStringify(payload);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function catalogPushMark(input: {
  catalogBuiltAt?: string;
  payload: unknown;
}): CatalogPushMark {
  return {
    catalogBuiltAt: String(input.catalogBuiltAt || ''),
    hash: catalogPayloadHash(input.payload),
  };
}

/** PUT /workspace/catalog only when the build time or the payload hash changed. */
export function shouldPushCatalog(prev: CatalogPushMark | null, next: CatalogPushMark): boolean {
  if (!prev) return true;
  return prev.catalogBuiltAt !== next.catalogBuiltAt || prev.hash !== next.hash;
}

/**
 * Summary reconcile. Full quote bodies are fetched only when the remote
 * timestamps are newer and this device does not already have form data.
 * A tombstoned id is never uploaded.
 */
export function planQuoteSync(args: {
  local?: QuoteSyncRow | null;
  remote?: QuoteSyncRow | null;
  deleted: boolean;
}): QuoteSyncAction {
  const local = args.local || null;
  const remote = args.remote || null;
  if (args.deleted) return remote ? 'drop-remote' : 'keep';
  if (local && !remote) return 'upload';
  if (!local || !remote) return 'keep';
  const localRev = revisionOf(local);
  const remoteRev = revisionOf(remote);
  if (localRev != null && remoteRev != null && localRev > remoteRev) return 'upload';
  if (localRev != null && remoteRev != null && remoteRev > localRev) {
    const localHasBody = Boolean(local.data && Object.keys(local.data).length);
    if (!localHasBody) return 'fetch';
    return 'keep';
  }
  const localSaveNewer = (local.savedAt || '') > (remote.savedAt || '');
  const localReviewNewer = (local.reviewedAt || '') > (remote.reviewedAt || '');
  if (localSaveNewer || localReviewNewer) return 'upload';
  const remoteNewer =
    (remote.savedAt || '') > (local.savedAt || '') ||
    (remote.reviewedAt || '') > (local.reviewedAt || '');
  const localHasData = Boolean(local.data && Object.keys(local.data).length);
  if (remoteNewer && !localHasData) return 'fetch';
  return 'keep';
}

export function intervalSkippedWhileHidden(visibility: string): boolean {
  return visibility === 'hidden';
}

export function isWakeReason(reason: string): boolean {
  return reason === 'focus' || reason === 'visibility' || reason === 'pageshow' || reason === 'online';
}

/** Focus/visibility/online must not start a second run on top of the steady tick. */
export function wakeOverlapsTick(
  lastStartedAt: number,
  now: number,
  intervalMs = CLOUD_REFRESH_MS,
): boolean {
  return lastStartedAt > 0 && now - lastStartedAt < intervalMs;
}

/** Sheet/catalog pull rides the workspace scheduler, not its own timer. */
export function refreshesWorkbook(reason: string): boolean {
  return (
    reason === 'startup' ||
    reason === 'interval' ||
    reason === 'online' ||
    reason === 'focus' ||
    reason === 'visibility' ||
    reason === 'pageshow'
  );
}
