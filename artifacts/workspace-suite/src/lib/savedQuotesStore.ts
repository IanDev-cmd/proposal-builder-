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
} from '@/lib/nexusWorkspaceDb';
import { cloudDeleteQuote, cloudGetQuote, cloudPutQuote } from '@/lib/workspaceCloud';

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

function mergeQuotes(...groups: SavedQuote[][]): SavedQuote[] {
  const map = new Map<string, SavedQuote>();
  for (const group of groups) {
    for (const q of group) {
      if (!q?.id) continue;
      const prev = map.get(q.id);
      const prevHasData = prev && prev.data && Object.keys(prev.data).length > 0;
      const nextHasData = q.data && Object.keys(q.data).length > 0;
      if (!prev) {
        map.set(q.id, q);
        continue;
      }
      if ((q.savedAt || '') > (prev.savedAt || '')) {
        map.set(q.id, nextHasData || !prevHasData ? q : { ...q, data: prev.data });
        continue;
      }
      if (!prevHasData && nextHasData) map.set(q.id, { ...prev, data: q.data });
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
  return [...ensureMemory()];
}

export function getSavedQuote(id: string): SavedQuote | null {
  return ensureMemory().find((q) => q.id === id) || readLocal().find((q) => q.id === id) || null;
}

export function upsertSavedQuote(
  input: Omit<SavedQuote, 'savedAt'> & { savedAt?: string },
): SavedQuote {
  const next: SavedQuote = { ...input, savedAt: input.savedAt || new Date().toISOString() };
  const list = ensureMemory().filter((q) => q.id !== next.id);
  list.unshift(next);
  setMemory(list);
  void workspacePut(STORE, next);
  return next;
}

export async function persistSavedQuote(
  input: Omit<SavedQuote, 'savedAt'> & { savedAt?: string },
): Promise<SavedQuote> {
  const next = upsertSavedQuote(input);
  await workspacePut(STORE, next);
  void cloudPutQuote(next).catch(() => {
    /* local copy remains; next hydrate retries the upload */
  });
  return next;
}

export async function ingestRemoteQuotes(rows: SavedQuote[]): Promise<void> {
  if (!rows.length) return;
  const merged = mergeQuotes(ensureMemory(), rows);
  setMemory(merged);
  try {
    await workspacePutAll(STORE, merged);
  } catch {
    /* memory copy remains */
  }
}

export function deleteSavedQuote(id: string): boolean {
  const list = ensureMemory();
  const next = list.filter((q) => q.id !== id);
  if (next.length === list.length) return false;
  setMemory(next);
  void workspaceDelete(STORE, id);
  void cloudDeleteQuote(id).catch(() => {
    /* ignore */
  });
  return true;
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
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/saved-quotes/${encodeURIComponent(id)}`;
}

export function savedQuoteShareUrl(id: string): string {
  if (typeof window === 'undefined') return `${savedQuoteSharePath(id)}?view=cost`;
  return `${window.location.origin}${savedQuoteSharePath(id)}?view=cost`;
}

export async function getSavedQuoteAsync(id: string): Promise<SavedQuote | null> {
  if (!id) return null;
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
    const merged = mergeQuotes(fromDb, readLocal(), ensureMemory());
    memory = merged;
    writeLocal(merged);
    const dbIds = new Set(fromDb.map((q) => q.id));
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
