// Bridges the Forms wizard (writer) and the Proposal Doc page (reader) so every
// generated proposal shows up there — no backend required.
//
// Storage: IndexedDB, not localStorage. Each proposal embeds a full multi-page
// PDF as a base64 data URL, which is several MB apiece. localStorage caps out
// around 5-10MB per origin, so it could hold at most one or two proposals
// before writes started failing (and previously failed *silently*, so newly
// generated proposals just vanished). IndexedDB's quota is a large share of
// free disk space, so it comfortably holds many full-size PDFs.

export type GeneratedProposal = {
  id: string;
  createdAt: string;
  eventDate: string; // ISO yyyy-mm-dd — the event date entered in the wizard
  title: string;
  vesselType: string;
  eventType: string;
  guestCount: string;
  grandTotal: number;
  pdfDataUrl: string; // data:application/pdf;base64,...
  // Whoever this quote was built for, if it was opened via a lead's "Build a
  // Quote" button — lets the Proposal Doc page share the PDF straight to the
  // exact lead's inbox instead of a blank compose window.
  leadName?: string;
  leadEmail?: string;
};

const DB_NAME = 'nexus-proposals';
const DB_VERSION = 1;
const STORE_NAME = 'proposals';
const PROPOSALS_EVENT = 'nexus:proposals-updated';

// Legacy key from the old localStorage-backed version of this store — migrated
// into IndexedDB once, on first read, so proposals generated before this
// change aren't lost.
const LEGACY_LOCALSTORAGE_KEY = 'nexus_generated_proposals';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open proposal database'));
  });
}

function migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    let legacy: GeneratedProposal[] = [];
    try {
      const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
      legacy = raw ? (JSON.parse(raw) as GeneratedProposal[]) : [];
    } catch {
      legacy = [];
    }
    if (legacy.length === 0) {
      resolve();
      return;
    }
    const tx = db.transaction(STORE_NAME, 'readwrite');
    legacy.forEach((p) => tx.objectStore(STORE_NAME).put(p));
    tx.oncomplete = () => {
      try {
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      } catch {
        // non-fatal — worst case we re-attempt this migration next load
      }
      resolve();
    };
    tx.onerror = () => resolve(); // don't block reads on a failed migration
  });
}

let migrated: Promise<void> | null = null;
async function ensureMigrated(db: IDBDatabase): Promise<void> {
  if (!migrated) migrated = migrateFromLocalStorage(db);
  return migrated;
}

/** All generated proposals, newest first. */
export async function loadProposals(): Promise<GeneratedProposal[]> {
  try {
    const db = await openDb();
    await ensureMigrated(db);
    return await new Promise<GeneratedProposal[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const rows = (req.result as GeneratedProposal[]) ?? [];
        rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        resolve(rows);
      };
      req.onerror = () => reject(req.error ?? new Error('Failed to read proposals'));
    });
  } catch {
    return [];
  }
}

/**
 * Persists a newly generated proposal. Returns whether the save actually
 * succeeded — callers should surface a real error on `false` rather than
 * assuming success (an earlier localStorage-based version of this store
 * dropped proposals silently when storage filled up).
 */
export async function addProposal(proposal: GeneratedProposal): Promise<boolean> {
  try {
    const db = await openDb();
    await ensureMigrated(db);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(proposal);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save proposal'));
    });
    window.dispatchEvent(new Event(PROPOSALS_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeProposals(cb: () => void): () => void {
  window.addEventListener(PROPOSALS_EVENT, cb);
  return () => window.removeEventListener(PROPOSALS_EVENT, cb);
}

/** Removes a generated proposal permanently. Used by the Proposal Doc page's Delete action. */
export async function deleteProposal(id: string): Promise<boolean> {
  try {
    const db = await openDb();
    await ensureMigrated(db);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete proposal'));
    });
    window.dispatchEvent(new Event(PROPOSALS_EVENT));
    return true;
  } catch {
    return false;
  }
}
