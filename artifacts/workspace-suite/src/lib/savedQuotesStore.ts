/**
 * Saved Quotes — IndexedDB `savedQuotes` in nexus-workspace is the source of
 * truth. An in-memory list is updated on every write so the current tab always
 * sees the quote. localStorage is a best-effort mirror (full payload, then a
 * slim copy if quota is exceeded).
 */
import type { QuoteLead } from '@/lib/quoteLeadStore';
import {
  WORKSPACE_STORES,
  workspaceGet,
  workspaceGetAll,
  workspacePut,
  workspacePutAll,
  workspaceDelete,
  workspaceClear,
} from '@/lib/nexusWorkspaceDb';
import { cloudDeleteQuote, cloudGetQuote, cloudPutQuote, cloudClearQuotes } from '@/lib/workspaceCloud';
import { deleteOpsQuoteSnapshots } from '@/lib/opsStore';
import {
  forgetDeletedQuoteIds,
  isQuoteDeleted,
  listDeletedQuoteIds,
  rememberDeletedQuoteIds,
} from '@/lib/quoteTombstones';
import { pickReviewFields, quoteReviewStatus, type QuoteReviewStatus } from '@/lib/quoteReview';

export type SavedQuote = {
  id: string;
  savedAt: string;
  leadKey: string;
  leadName?: string;
  referenceNumber?: string;
  title: string;
  vesselType: string;
  eventType: string;
  guestCount: string;
  eventDate: string;
  grandTotal: number;
  step: number;
  data: Record<string, unknown>;
  lead: QuoteLead | null;
  proposalId?: string;
  /** pending = not yet approved or disapproved */
  reviewStatus?: QuoteReviewStatus;
  reviewedAt?: string;
};

const STORAGE_KEY = 'nexus_saved_quotes';
const PENDING_GENERATE_KEY = 'nexus_pending_generate';
const EVENT = 'nexus:saved-quotes-updated';
const STORE = WORKSPACE_STORES.savedQuotes;

let memory: SavedQuote[] | null = null;
let hydratePromise: Promise<void> | null = null;

function sortQuotes(list: SavedQuote[]): SavedQuote[] {
  return [...list].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

function readLocal(): SavedQuote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as SavedQuote[]) : [];
    return Array.isArray(list) ? list.filter((q) => q && q.id) : [];
  } catch {
    return [];
  }
}

function writeLocal(list: SavedQuote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return;
  } catch {
    /* quota — drop bulky form snapshots and keep the list visible */
  }
  try {
    const slim = list.map(({ data: _data, ...rest }) => ({ ...rest, data: {} }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    /* IndexedDB + memory still hold the real rows */
  }
}

function emit() {
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

function mergeQuotePair(prev: SavedQuote, next: SavedQuote): SavedQuote {
  const prevHasData = Boolean(prev.data && Object.keys(prev.data).length);
  const nextHasData = Boolean(next.data && Object.keys(next.data).length);
  const nextNewerSave = (next.savedAt || '') > (prev.savedAt || '');
  const base = nextNewerSave ? next : prev;
  const other = nextNewerSave ? prev : next;
  const data =
    base.data && Object.keys(base.data).length ? base.data : other.data;
  const review = pickReviewFields(prev, next);
  return {
    ...base,
    data: prevHasData || nextHasData ? data : base.data,
    reviewStatus: review.reviewStatus,
    reviewedAt: review.reviewedAt,
  };
}

function mergeQuotes(...groups: SavedQuote[][]): SavedQuote[] {
  const map = new Map<string, SavedQuote>();
  for (const group of groups) {
    for (const q of group) {
      if (!q?.id) continue;
      const prev = map.get(q.id);
      map.set(q.id, prev ? mergeQuotePair(prev, q) : { ...q, reviewStatus: quoteReviewStatus(q) });
    }
  }
  return sortQuotes([...map.values()]);
}

function setMemory(list: SavedQuote[]) {
  memory = sortQuotes(list);
  writeLocal(memory);
  emit();
}

function ensureMemory(): SavedQuote[] {
  if (memory) return memory;
  memory = sortQuotes(readLocal());
  return memory;
}

export function listSavedQuotes(): SavedQuote[] {
  return ensureMemory().filter((q) => !isQuoteDeleted(q.id));
}

export function getSavedQuote(id: string): SavedQuote | null {
  if (!id || isQuoteDeleted(id)) return null;
  return ensureMemory().find((q) => q.id === id) || readLocal().find((q) => q.id === id) || null;
}

export function upsertSavedQuote(
  input: Omit<SavedQuote, 'savedAt'> & { savedAt?: string },
): SavedQuote {
  const prev = getSavedQuote(input.id);
  const reviewStatus = input.reviewStatus
    ? quoteReviewStatus(input)
    : prev
      ? quoteReviewStatus(prev)
      : 'pending';
  const next: SavedQuote = {
    ...input,
    savedAt: input.savedAt || new Date().toISOString(),
    reviewStatus,
    reviewedAt: input.reviewedAt ?? prev?.reviewedAt,
  };
  forgetDeletedQuoteIds([next.id]);
  const list = ensureMemory().filter((q) => q.id !== next.id);
  list.unshift(next);
  setMemory(list);
  void workspacePut(STORE, next);
  return next;
}

export async function setQuoteReviewStatus(
  id: string,
  status: QuoteReviewStatus,
): Promise<SavedQuote | null> {
  const current = getSavedQuote(id) || (await getSavedQuoteAsync(id));
  if (!current) return null;
  return persistSavedQuote({
    ...current,
    savedAt: current.savedAt,
    reviewStatus: status,
    reviewedAt: new Date().toISOString(),
  });
}

export async function persistSavedQuote(
  input: Omit<SavedQuote, 'savedAt'> & { savedAt?: string },
): Promise<SavedQuote> {
  const next = upsertSavedQuote(input);
  await workspacePut(STORE, next);
  try {
    await cloudPutQuote(next);
  } catch (err) {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    (wrapped as Error & { localSaved?: boolean }).localSaved = true;
    throw wrapped;
  }
  return next;
}

export async function ingestRemoteQuotes(rows: SavedQuote[]): Promise<void> {
  if (!rows.length) return;
  const deleted = listDeletedQuoteIds();
  const keep = rows.filter((q) => q?.id && !deleted.has(q.id));
  const stale = rows.filter((q) => q?.id && deleted.has(q.id));
  for (const row of stale) {
    void cloudDeleteQuote(row.id).catch(() => {
      /* retry on next sync */
    });
  }
  if (!keep.length) return;
  const merged = mergeQuotes(
    ensureMemory().filter((q) => !deleted.has(q.id)),
    keep,
  );
  setMemory(merged);
  try {
    await workspacePutAll(STORE, merged);
  } catch {
    /* memory copy remains */
  }
}

export type DeleteSavedQuoteOpts = {
  extraIds?: Array<string | undefined | null>;
  quoteId?: string;
  referenceNumber?: string;
};

export async function deleteSavedQuote(id: string, opts?: DeleteSavedQuoteOpts): Promise<boolean> {
  const ids = [
    ...new Set(
      [id, opts?.quoteId, ...(opts?.extraIds || [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return false;
  rememberDeletedQuoteIds(ids);
  const list = ensureMemory().filter((q) => !ids.includes(q.id));
  setMemory(list);
  await Promise.all(
    ids.map(async (qid) => {
      try {
        await workspaceDelete(STORE, qid);
      } catch {
        /* memory already dropped the row */
      }
    }),
  );
  await deleteOpsQuoteSnapshots(ids, { referenceNumber: opts?.referenceNumber });
  await Promise.all(ids.map((qid) => cloudDeleteQuote(qid).catch(() => undefined)));
  return true;
}

export async function clearAllSavedQuotes(): Promise<void> {
  rememberDeletedQuoteIds(ensureMemory().map((q) => q.id));
  try {
    await cloudClearQuotes();
  } catch {
    /* still wipe the local copy */
  }
  hydratePromise = null;
  memory = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PENDING_GENERATE_KEY);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(PENDING_GENERATE_KEY);
  } catch {
    /* ignore */
  }
  await workspaceClear(STORE);
  emit();
}

export function subscribeSavedQuotes(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function markPendingGenerate(id: string) {
  try {
    sessionStorage.setItem(PENDING_GENERATE_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(PENDING_GENERATE_KEY);
  } catch {
    /* ignore */
  }
}

export function consumePendingGenerate(): string | null {
  let id: string | null = null;
  try {
    id = sessionStorage.getItem(PENDING_GENERATE_KEY);
    if (id) sessionStorage.removeItem(PENDING_GENERATE_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(PENDING_GENERATE_KEY);
  } catch {
    /* ignore */
  }
  return id;
}

export function peekPendingGenerate(): string | null {
  try {
    return sessionStorage.getItem(PENDING_GENERATE_KEY);
  } catch {
    return null;
  }
}

export function savedQuoteSharePath(id: string): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const base = (env?.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/saved-quotes/${encodeURIComponent(id)}`;
}

/** True for `/saved-quotes/:id` share/review URLs — not the Saved Quotes list. */
export function isSavedQuoteReviewPath(pathname: string): boolean {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  return /^\/saved-quotes\/[^/]+$/.test(path);
}

export function savedQuoteShareUrl(id: string): string {
  if (typeof window === 'undefined') return savedQuoteSharePath(id);
  return `${window.location.origin}${savedQuoteSharePath(id)}`;
}

export function savedQuoteIsCostView(search?: string): boolean {
  const q = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  return new URLSearchParams(q).get('view') === 'cost';
}

export async function getSavedQuoteAsync(id: string): Promise<SavedQuote | null> {
  if (!id) return null;
  if (isQuoteDeleted(id)) return null;
  const local = getSavedQuote(id);
  if (local?.data && Object.keys(local.data).length) return local;
  try {
    const row = await workspaceGet<SavedQuote>(STORE, id);
    if (row?.data && Object.keys(row.data).length) {
      setMemory(mergeQuotes(ensureMemory(), [row]));
      return getSavedQuote(id);
    }
  } catch {
    /* fall through to shared workspace */
  }
  try {
    const remote = await cloudGetQuote(id);
    if (remote) {
      setMemory(mergeQuotes(ensureMemory(), [remote]));
      void workspacePut(STORE, remote).catch(() => {
        /* overlay can still render from memory */
      });
      return getSavedQuote(id) || remote;
    }
  } catch {
    /* engine offline */
  }
  return local;
}

export async function hydrateSavedQuotesDb(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    let fromDb: SavedQuote[] = [];
    try {
      fromDb = await workspaceGetAll<SavedQuote>(STORE);
    } catch {
      fromDb = [];
    }
    const merged = mergeQuotes(fromDb, readLocal(), ensureMemory()).filter(
      (q) => !isQuoteDeleted(q.id),
    );
    memory = merged;
    writeLocal(merged);
    const dbIds = new Set(fromDb.map((q) => q.id));
    for (const row of fromDb) {
      if (!isQuoteDeleted(row.id)) continue;
      try {
        await workspaceDelete(STORE, row.id);
      } catch {
        /* keep filtering on read */
      }
    }
    const missing = merged.filter((q) => !dbIds.has(q.id));
    for (const q of missing) {
      try {
        await workspacePut(STORE, q);
      } catch {
        /* keep memory copy */
      }
    }
    emit();
  })().finally(() => {
    /* allow a later refresh after a save */
    window.setTimeout(() => {
      hydratePromise = null;
    }, 0);
  });
  return hydratePromise;
}
