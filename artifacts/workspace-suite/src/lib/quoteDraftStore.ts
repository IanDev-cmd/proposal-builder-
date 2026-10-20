/**
 * Quote Builder wizard drafts — IndexedDB so REPs can leave and resume.
 * One draft per lead and quote version, so V2 does not replace the V1 draft.
 */

const OPEN_DRAFT_KEY = 'nexus.openDraftKey';

/** Storage key for one lead version. Bare lead keys stay readable for older V1 drafts. */
export function quoteDraftKey(leadKey: string, quoteVersion?: string): string {
  const version = String(quoteVersion || 'V1').trim() || 'V1';
  return `${leadKey}::${version}`;
}

export function markOpenQuoteDraft(leadKey: string, quoteVersion?: string): string {
  const key = quoteDraftKey(leadKey, quoteVersion);
  try {
    sessionStorage.setItem(OPEN_DRAFT_KEY, key);
  } catch {
    /* ignore */
  }
  return key;
}

export function consumeOpenQuoteDraftKey(): string | null {
  try {
    const key = sessionStorage.getItem(OPEN_DRAFT_KEY);
    sessionStorage.removeItem(OPEN_DRAFT_KEY);
    return key;
  } catch {
    return null;
  }
}

export type QuoteWizardDraft<T = Record<string, unknown>> = {
  leadKey: string;
  savedAt: string;
  step: number;
  data: T;
  leadName?: string;
  referenceNumber?: string;
};

const DB_NAME = 'nexus-quote-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const LS_KEY = 'nexus_quote_builder_drafts';

function readLocalStore(): Record<string, QuoteWizardDraft> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as Record<string, QuoteWizardDraft>;
  } catch {
    return {};
  }
}

function writeLocalDraft(draft: QuoteWizardDraft) {
  try {
    const store = readLocalStore();
    store[draft.leadKey] = draft;
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'leadKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open quote draft database'));
  });
}

function getDraftDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb()
      .then((db) => {
        db.onclose = () => {
          dbPromise = null;
        };
        return db;
      })
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}

export async function loadQuoteDraft<T>(leadKey: string): Promise<QuoteWizardDraft<T> | null> {
  if (!leadKey) return null;
  try {
    const db = await getDraftDb();
    const fromIdb = await new Promise<QuoteWizardDraft<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(leadKey);
      req.onsuccess = () => resolve((req.result as QuoteWizardDraft<T>) || null);
      req.onerror = () => reject(req.error ?? new Error('Failed to read quote draft'));
    });
    if (fromIdb) {
      writeLocalDraft(fromIdb as QuoteWizardDraft);
      return fromIdb;
    }
  } catch {
    /* fall through to localStorage */
  }
  const local = readLocalStore()[leadKey];
  return (local as QuoteWizardDraft<T>) || null;
}

export async function clearQuoteDraft(leadKey: string): Promise<void> {
  if (!leadKey) return;
  try {
    const store = readLocalStore();
    delete store[leadKey];
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
  try {
    const db = await getDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(leadKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to clear quote draft'));
    });
  } catch {
    /* IndexedDB optional */
  }
}

export async function saveQuoteDraft<T>(
  draft: Omit<QuoteWizardDraft<T>, 'savedAt'> & { savedAt?: string },
): Promise<boolean> {
  if (!draft.leadKey) return false;
  const row = { ...draft, savedAt: new Date().toISOString() } as QuoteWizardDraft<T>;
  writeLocalDraft(row as QuoteWizardDraft);
  try {
    const db = await getDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save quote draft'));
    });
    return true;
  } catch {
    return true;
  }
}
