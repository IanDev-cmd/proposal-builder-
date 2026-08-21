/**
 * Quote Builder wizard drafts — IndexedDB so REPs can leave and resume.
 * One latest draft per lead key (reference / email / quote-draft).
 */

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

export async function loadQuoteDraft<T>(leadKey: string): Promise<QuoteWizardDraft<T> | null> {
  if (!leadKey) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(leadKey);
      req.onsuccess = () => resolve((req.result as QuoteWizardDraft<T>) || null);
      req.onerror = () => reject(req.error ?? new Error('Failed to read quote draft'));
    });
  } catch {
    return null;
  }
}

export async function saveQuoteDraft<T>(
  draft: Omit<QuoteWizardDraft<T>, 'savedAt'> & { savedAt?: string },
): Promise<boolean> {
  if (!draft.leadKey) return false;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ ...draft, savedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save quote draft'));
    });
    return true;
  } catch {
    return false;
  }
}
