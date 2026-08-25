/**
 * Browser database for Leads, Saved Quotes, and Created Proposals.
 * IndexedDB is the durable store; callers may also mirror small records to localStorage.
 */

export const WORKSPACE_DB_NAME = 'nexus-workspace';
export const WORKSPACE_DB_VERSION = 3;

export const WORKSPACE_STORES = {
  leads: 'leads',
  savedQuotes: 'savedQuotes',
  proposals: 'proposals',
  opsNotes: 'opsNotes',
  opsQuotes: 'opsQuotes',
} as const;

export type WorkspaceStoreName = (typeof WORKSPACE_STORES)[keyof typeof WORKSPACE_STORES];

const MIGRATED_FLAG = 'nexus.workspace.migrated.v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion || 0;
      if (oldVersion < 2 && db.objectStoreNames.contains(WORKSPACE_STORES.leads)) {
        db.deleteObjectStore(WORKSPACE_STORES.leads);
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORES.leads)) {
        db.createObjectStore(WORKSPACE_STORES.leads, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORES.savedQuotes)) {
        const quotes = db.createObjectStore(WORKSPACE_STORES.savedQuotes, { keyPath: 'id' });
        quotes.createIndex('leadKey', 'leadKey', { unique: false });
        quotes.createIndex('savedAt', 'savedAt', { unique: false });
        quotes.createIndex('reviewStatus', 'reviewStatus', { unique: false });
      } else if (oldVersion < 3) {
        const quotes = req.transaction?.objectStore(WORKSPACE_STORES.savedQuotes);
        if (quotes && !quotes.indexNames.contains('reviewStatus')) {
          quotes.createIndex('reviewStatus', 'reviewStatus', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORES.proposals)) {
        const proposals = db.createObjectStore(WORKSPACE_STORES.proposals, { keyPath: 'id' });
        proposals.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORES.opsNotes)) {
        const notes = db.createObjectStore(WORKSPACE_STORES.opsNotes, { keyPath: 'id' });
        notes.createIndex('referenceNumber', 'referenceNumber', { unique: false });
      }
      if (!db.objectStoreNames.contains(WORKSPACE_STORES.opsQuotes)) {
        const opsQuotes = db.createObjectStore(WORKSPACE_STORES.opsQuotes, { keyPath: 'id' });
        opsQuotes.createIndex('referenceNumber', 'referenceNumber', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open Nexus workspace database'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getWorkspaceDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function workspaceGetAll<T>(store: WorkspaceStoreName): Promise<T[]> {
  const db = await getWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error ?? new Error(`Failed to read ${store}`));
  });
}

export async function workspaceGetAllByIndex<T>(
  store: WorkspaceStoreName,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  const db = await getWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const index = tx.objectStore(store).index(indexName);
    const req = index.getAll(key);
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error ?? new Error(`Failed to read ${store}.${indexName}`));
  });
}

export async function workspaceGet<T>(store: WorkspaceStoreName, key: IDBValidKey): Promise<T | null> {
  const db = await getWorkspaceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error ?? new Error(`Failed to read ${store}`));
  });
}

export async function workspacePut<T>(store: WorkspaceStoreName, value: T): Promise<void> {
  const db = await getWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to save ${store}`));
  });
}

export async function workspacePutAll<T>(store: WorkspaceStoreName, values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await getWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    values.forEach((v) => os.put(v));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to save ${store}`));
  });
}

export async function workspaceDelete(store: WorkspaceStoreName, key: IDBValidKey): Promise<void> {
  const db = await getWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to delete from ${store}`));
  });
}

export function workspaceMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_FLAG) === '1';
  } catch {
    return false;
  }
}

export function markWorkspaceMigrated() {
  try {
    localStorage.setItem(MIGRATED_FLAG, '1');
  } catch {
    /* ignore */
  }
}

/** Copy records from a legacy IndexedDB (e.g. nexus-proposals) into a workspace store. */
export function copyLegacyIdbStore<T>(opts: {
  dbName: string;
  storeName: string;
  into: WorkspaceStoreName;
}): Promise<T[]> {
  return new Promise((resolve) => {
    const req = indexedDB.open(opts.dbName);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const old = req.result;
      if (!old.objectStoreNames.contains(opts.storeName)) {
        old.close();
        resolve([]);
        return;
      }
      const tx = old.transaction(opts.storeName, 'readonly');
      const getAll = tx.objectStore(opts.storeName).getAll();
      getAll.onsuccess = () => {
        const rows = (getAll.result as T[]) || [];
        old.close();
        resolve(rows);
      };
      getAll.onerror = () => {
        old.close();
        resolve([]);
      };
    };
  });
}
