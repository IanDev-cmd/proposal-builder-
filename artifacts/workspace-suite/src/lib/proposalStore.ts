/**
 * Created Proposals — durable IndexedDB table inside nexus-workspace.
 * PDFs are too large for localStorage; they live only in this database.
 */
import {
  WORKSPACE_STORES,
  workspaceGet,
  workspaceGetAll,
  workspacePut,
  workspaceDelete,
  copyLegacyIdbStore,
  workspaceMigrated,
  markWorkspaceMigrated,
} from '@/lib/nexusWorkspaceDb';
import { cloudDeleteProposal, cloudGetProposal, cloudPutProposal } from '@/lib/workspaceCloud';

export type GeneratedProposal = {
  id: string;
  createdAt: string;
  eventDate: string;
  title: string;
  vesselType: string;
  eventType: string;
  guestCount: string;
  grandTotal: number;
  pdfDataUrl: string;
  leadName?: string;
  leadEmail?: string;
};

const STORE = WORKSPACE_STORES.proposals;
const PROPOSALS_EVENT = 'nexus:proposals-updated';
const LEGACY_LOCALSTORAGE_KEY = 'nexus_generated_proposals';
const LEGACY_IDB_NAME = 'nexus-proposals';

function readLegacyLocal(): GeneratedProposal[] {
  try {
    const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as GeneratedProposal[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let migrated: Promise<void> | null = null;

async function workspacePutAllSafe(rows: GeneratedProposal[]) {
  for (const row of rows) {
    try {
      await workspacePut(STORE, row);
    } catch {
      /* one bad PDF must not block the rest */
    }
  }
}

async function ensureMigrated(): Promise<void> {
  if (migrated) return migrated;
  migrated = (async () => {
    const existing = await workspaceGetAll<GeneratedProposal>(STORE);
    const have = new Set(existing.map((p) => p.id));
    const fromIdb = await copyLegacyIdbStore<GeneratedProposal>({
      dbName: LEGACY_IDB_NAME,
      storeName: 'proposals',
      into: STORE,
    });
    const fromLs = readLegacyLocal();
    const incoming = [...fromIdb, ...fromLs].filter((p) => p?.id && !have.has(p.id));
    if (incoming.length) await workspacePutAllSafe(incoming);
    if (fromLs.length) {
      try {
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    if (!workspaceMigrated()) markWorkspaceMigrated();
  })().catch((err) => {
    migrated = null;
    throw err;
  });
  return migrated;
}

export async function getProposal(id: string): Promise<GeneratedProposal | null> {
  if (!id) return null;
  await ensureMigrated();
  const local = await workspaceGet<GeneratedProposal>(STORE, id);
  if (local?.pdfDataUrl) return local;
  try {
    const remote = await cloudGetProposal(id);
    if (remote) {
      await workspacePut(STORE, remote);
      window.dispatchEvent(new Event(PROPOSALS_EVENT));
      return remote;
    }
  } catch {
    /* local row still usable for the card */
  }
  return local;
}

export async function loadProposals(): Promise<GeneratedProposal[]> {
  await ensureMigrated();
  const rows = await workspaceGetAll<GeneratedProposal>(STORE);
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows;
}

export async function addProposal(proposal: GeneratedProposal): Promise<boolean> {
  try {
    await ensureMigrated();
    await workspacePut(STORE, proposal);
    window.dispatchEvent(new Event(PROPOSALS_EVENT));
    void cloudPutProposal(proposal).catch(() => {
      /* local copy remains; next hydrate retries the upload */
    });
    return true;
  } catch {
    return false;
  }
}

export function subscribeProposals(cb: () => void): () => void {
  window.addEventListener(PROPOSALS_EVENT, cb);
  return () => window.removeEventListener(PROPOSALS_EVENT, cb);
}

export async function deleteProposal(id: string): Promise<boolean> {
  try {
    await ensureMigrated();
    await workspaceDelete(STORE, id);
    window.dispatchEvent(new Event(PROPOSALS_EVENT));
    void cloudDeleteProposal(id).catch(() => {
      /* ignore */
    });
    return true;
  } catch {
    return false;
  }
}

export async function ingestRemoteProposals(rows: GeneratedProposal[]): Promise<void> {
  let changed = false;
  for (const row of rows) {
    if (!row?.id) continue;
    const existing = await workspaceGet<GeneratedProposal>(STORE, row.id);
    const incomingHasPdf = Boolean(row.pdfDataUrl);
    const existingHasPdf = Boolean(existing?.pdfDataUrl);
    if (!existing) {
      await workspacePut(STORE, row);
      changed = true;
      continue;
    }
    if (incomingHasPdf && !existingHasPdf) {
      await workspacePut(STORE, { ...existing, ...row });
      changed = true;
      continue;
    }
    if ((row.createdAt || '') > (existing.createdAt || '')) {
      await workspacePut(
        STORE,
        incomingHasPdf || !existingHasPdf ? row : { ...row, pdfDataUrl: existing.pdfDataUrl },
      );
      changed = true;
    }
  }
  if (changed) window.dispatchEvent(new Event(PROPOSALS_EVENT));
}

export async function hydrateProposalsDb(): Promise<void> {
  await ensureMigrated();
  window.dispatchEvent(new Event(PROPOSALS_EVENT));
}
