/**
 * Global wake-up / deep-link sync coordinator.
 * IndexedDB remains the working copy; this layer only schedules cloud pull/push.
 */
import { parseShareDeepLink } from '@/lib/homeLanding';
import { listSyncOutbox } from '@/lib/syncOutbox';

export type SyncReason =
  | 'startup'
  | 'interval'
  | 'focus'
  | 'visibility'
  | 'online'
  | 'pageshow'
  | 'route'
  | 'deep-link'
  | 'manual';

export type SyncPhase = 'offline' | 'idle' | 'syncing' | 'synced' | 'error';

export type SyncStatusLabel = 'Saved locally' | 'Syncing...' | 'Synced';

export type SyncRunContext = {
  reason: SyncReason;
  quoteId?: string;
  proposalId?: string;
};

export type SyncSnapshot = {
  phase: SyncPhase;
  label: SyncStatusLabel;
  online: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  pendingCount: number;
  reason: SyncReason | null;
};

export const SYNC_STATUS_EVENT = 'nexus:sync-status';
const LAST_SYNCED_KEY = 'nexus.sync.lastSyncedAt';
const CLOUD_REFRESH_MS = 30_000;

type SyncRunner = (ctx: SyncRunContext) => Promise<void>;

let runner: SyncRunner | null = null;
let listenersBound = false;
let intervalId: number | null = null;
let inflight: Promise<void> | null = null;
let queued: SyncRunContext | null = null;

let snapshot: SyncSnapshot = {
  phase: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle',
  label: 'Saved locally',
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  lastSyncedAt: readLastSyncedAt(),
  lastError: null,
  pendingCount: 0,
  reason: null,
};

snapshot.label = syncStatusLabel(snapshot);

export function syncStatusLabel(
  snap: Pick<SyncSnapshot, 'online' | 'phase' | 'pendingCount'>,
): SyncStatusLabel {
  if (snap.phase === 'syncing') return 'Syncing...';
  if (snap.online && snap.phase === 'synced' && snap.pendingCount === 0) return 'Synced';
  return 'Saved locally';
}

function readLastSyncedAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNCED_KEY);
  } catch {
    return null;
  }
}

function writeLastSyncedAt(iso: string) {
  try {
    localStorage.setItem(LAST_SYNCED_KEY, iso);
  } catch {
    /* ignore */
  }
}

function emit() {
  snapshot = { ...snapshot, label: syncStatusLabel(snapshot) };
  try {
    window.dispatchEvent(new Event(SYNC_STATUS_EVENT));
  } catch {
    /* ignore */
  }
}

function setSnapshot(patch: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function subscribeSyncStatus(cb: () => void): () => void {
  window.addEventListener(SYNC_STATUS_EVENT, cb);
  return () => window.removeEventListener(SYNC_STATUS_EVENT, cb);
}

export function buildSyncRunContext(
  reason: SyncReason,
  opts?: { path?: string; search?: string; quoteId?: string; proposalId?: string },
): SyncRunContext {
  const path = opts?.path ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const search = opts?.search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const deep = parseShareDeepLink(path, search);
  return {
    reason: deep && (reason === 'route' || reason === 'startup') ? 'deep-link' : reason,
    quoteId: opts?.quoteId || (deep?.kind === 'quote' ? deep.id : undefined),
    proposalId: opts?.proposalId || (deep?.kind === 'proposal' ? deep.id : undefined),
  };
}

async function refreshPendingCount(): Promise<number> {
  const jobs = await listSyncOutbox();
  return jobs.length;
}

export async function noteSyncPendingCount(): Promise<void> {
  const pendingCount = await refreshPendingCount();
  if (pendingCount !== snapshot.pendingCount) {
    setSnapshot({ pendingCount });
  }
}

export async function noteCloudWriteSettled(): Promise<void> {
  const pendingCount = await refreshPendingCount();
  if (pendingCount === 0 && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
    const lastSyncedAt = new Date().toISOString();
    writeLastSyncedAt(lastSyncedAt);
    setSnapshot({
      phase: 'synced',
      online: true,
      lastSyncedAt,
      lastError: null,
      pendingCount: 0,
    });
    return;
  }
  setSnapshot({ pendingCount });
}

export function noteSyncError(message: string) {
  setSnapshot({
    phase: navigator.onLine === false ? 'offline' : 'error',
    online: navigator.onLine !== false,
    lastError: message,
  });
}

export function noteSyncSuccess() {
  const lastSyncedAt = new Date().toISOString();
  writeLastSyncedAt(lastSyncedAt);
  setSnapshot({
    phase: 'synced',
    online: true,
    lastSyncedAt,
    lastError: null,
  });
}

function mergeSyncContext(prev: SyncRunContext | null, next: SyncRunContext): SyncRunContext {
  return {
    reason: next.reason,
    quoteId: next.quoteId || prev?.quoteId,
    proposalId: next.proposalId || prev?.proposalId,
  };
}

async function runQueued(ctx: SyncRunContext): Promise<void> {
  queued = mergeSyncContext(queued, ctx);
  if (!runner) return;
  if (inflight) {
    await inflight;
    return;
  }
  inflight = (async () => {
    while (queued && runner) {
      const next = queued;
      queued = null;
      const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
      if (!online) {
        setSnapshot({ phase: 'offline', online: false, reason: next.reason });
        continue;
      }
      setSnapshot({
        phase: 'syncing',
        online: true,
        reason: next.reason,
        pendingCount: await refreshPendingCount(),
      });
      try {
        await runner(next);
        const pendingCount = await refreshPendingCount();
        const lastSyncedAt = new Date().toISOString();
        writeLastSyncedAt(lastSyncedAt);
        setSnapshot({
          phase: pendingCount ? 'error' : 'synced',
          online: true,
          lastSyncedAt,
          lastError: pendingCount ? snapshot.lastError : null,
          pendingCount,
          reason: next.reason,
        });
      } catch (err) {
        const pendingCount = await refreshPendingCount();
        setSnapshot({
          phase: navigator.onLine === false ? 'offline' : 'error',
          online: navigator.onLine !== false,
          lastError: err instanceof Error ? err.message : String(err),
          pendingCount,
          reason: next.reason,
        });
      }
    }
  })().finally(() => {
    inflight = null;
  });
  await inflight;
}

export function requestWorkspaceSync(
  reason: SyncReason,
  opts?: { path?: string; search?: string; quoteId?: string; proposalId?: string },
): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return runQueued(buildSyncRunContext(reason, opts));
}

function onVisible(reason: 'focus' | 'visibility' | 'pageshow') {
  if (document.visibilityState === 'hidden') return;
  void requestWorkspaceSync(reason);
}

function bindListeners() {
  if (typeof window === 'undefined' || listenersBound) return;
  listenersBound = true;
  window.addEventListener('focus', () => onVisible('focus'));
  document.addEventListener('visibilitychange', () => onVisible('visibility'));
  window.addEventListener('pageshow', () => onVisible('pageshow'));
  window.addEventListener('online', () => {
    setSnapshot({ online: true });
    void requestWorkspaceSync('online');
  });
  window.addEventListener('offline', () => {
    setSnapshot({ phase: 'offline', online: false });
  });
}

/** After PIN login: attach wake-up listeners and keep a 30s pull/push loop. */
export function startSyncManager(run: SyncRunner): void {
  runner = run;
  bindListeners();
  if (typeof window !== 'undefined' && intervalId == null) {
    intervalId = window.setInterval(() => {
      void requestWorkspaceSync('interval');
    }, CLOUD_REFRESH_MS);
  }
  const pending = queued;
  queued = null;
  void requestWorkspaceSync(pending?.reason || 'startup', {
    quoteId: pending?.quoteId,
    proposalId: pending?.proposalId,
  });
}
