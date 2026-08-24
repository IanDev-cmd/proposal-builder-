/**
 * Saved Quotes — IndexedDB table `savedQuotes` in nexus-workspace, mirrored to
 * localStorage so list/get stay synchronous for the wizard.
 */
import type { QuoteLead } from '@/lib/quoteLeadStore';
import {
  WORKSPACE_STORES,
  workspaceGet,
  workspaceGetAll,
  workspacePut,
  workspaceDelete,
} from '@/lib/nexusWorkspaceDb';

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

function readLocal(): SavedQuote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as SavedQuote[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(list: SavedQuote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota — IndexedDB copy is the durable store */
  }
  window.dispatchEvent(new Event(EVENT));
}

function mergeQuotes(primary: SavedQuote[], secondary: SavedQuote[]): SavedQuote[] {
  const map = new Map<string, SavedQuote>();
  for (const q of secondary) {
    if (q?.id) map.set(q.id, q);
  }
  for (const q of primary) {
    if (!q?.id) continue;
    const prev = map.get(q.id);
    if (!prev || (q.savedAt || '') >= (prev.savedAt || '')) map.set(q.id, q);
  }
  return [...map.values()].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

async function putAllQuotes(list: SavedQuote[]) {
  for (const q of list) {
    try {
      await workspacePut(STORE, q);
    } catch {
      /* keep local copy */
    }
  }
}

export function listSavedQuotes(): SavedQuote[] {
  return readLocal().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export function getSavedQuote(id: string): SavedQuote | null {
  return readLocal().find((q) => q.id === id) || null;
}

export function upsertSavedQuote(
  input: Omit<SavedQuote, 'savedAt'> & { savedAt?: string },
): SavedQuote {
  const next: SavedQuote = { ...input, savedAt: new Date().toISOString() };
  const list = readLocal().filter((q) => q.id !== next.id);
  list.unshift(next);
  writeLocal(list);
  void workspacePut(STORE, next);
  return next;
}

export async function persistSavedQuote(
  input: Omit<SavedQuote, 'savedAt'> & { savedAt?: string },
): Promise<SavedQuote> {
  const next = upsertSavedQuote(input);
  try {
    await workspacePut(STORE, next);
  } catch {
    /* localStorage already holds the row */
  }
  return next;
}

export function deleteSavedQuote(id: string): boolean {
  const list = readLocal();
  const next = list.filter((q) => q.id !== id);
  if (next.length === list.length) return false;
  writeLocal(next);
  void workspaceDelete(STORE, id);
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
    localStorage.setItem(PENDING_GENERATE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function consumePendingGenerate(): string | null {
  try {
    const id = localStorage.getItem(PENDING_GENERATE_KEY);
    if (id) localStorage.removeItem(PENDING_GENERATE_KEY);
    return id;
  } catch {
    return null;
  }
}

export function peekPendingGenerate(): string | null {
  try {
    return localStorage.getItem(PENDING_GENERATE_KEY);
  } catch {
    return null;
  }
}

export function savedQuoteSharePath(id: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/saved-quotes/${encodeURIComponent(id)}`;
}

export function savedQuoteShareUrl(id: string): string {
  if (typeof window === 'undefined') return savedQuoteSharePath(id);
  return `${window.location.origin}${savedQuoteSharePath(id)}`;
}

export async function hydrateSavedQuotesDb(): Promise<void> {
  try {
    const fromDb = await workspaceGetAll<SavedQuote>(STORE);
    const merged = mergeQuotes(fromDb, readLocal());
    if (merged.length) {
      writeLocal(merged);
      if (fromDb.length < merged.length) await putAllQuotes(merged);
    }
  } catch {
    /* localStorage still available */
  }
}
