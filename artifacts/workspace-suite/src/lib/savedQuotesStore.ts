/**
 * Saved Quotes — persist Quote Builder snapshots in localStorage so they
 * survive refresh. No PDF payload (those stay in IndexedDB via proposalStore).
 */
import type { QuoteLead } from '@/lib/quoteLeadStore';

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
  /** IndexedDB id of the generated PDF, when Generate Proposal has already run. */
  proposalId?: string;
};

const STORAGE_KEY = 'nexus_saved_quotes';
const PENDING_GENERATE_KEY = 'nexus_pending_generate';
const EVENT = 'nexus:saved-quotes-updated';

function readAll(): SavedQuote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as SavedQuote[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedQuote[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
}

export function listSavedQuotes(): SavedQuote[] {
  return readAll().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

export function getSavedQuote(id: string): SavedQuote | null {
  return readAll().find((q) => q.id === id) || null;
}

export function upsertSavedQuote(
  input: Omit<SavedQuote, 'savedAt'> & { savedAt?: string },
): SavedQuote {
  const next: SavedQuote = { ...input, savedAt: new Date().toISOString() };
  const list = readAll().filter((q) => q.id !== next.id);
  list.unshift(next);
  writeAll(list);
  return next;
}

export function deleteSavedQuote(id: string): boolean {
  const list = readAll();
  const next = list.filter((q) => q.id !== id);
  if (next.length === list.length) return false;
  writeAll(next);
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
