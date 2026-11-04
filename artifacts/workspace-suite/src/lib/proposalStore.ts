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
  workspaceClear,
  copyLegacyIdbStore,
  workspaceMigrated,
  markWorkspaceMigrated,
} from '@/lib/nexusWorkspaceDb';
import { cloudDeleteProposal, cloudGetProposal, cloudPutProposal, cloudClearProposals } from '@/lib/workspaceCloud';
import { dequeueSyncOutbox, enqueueSyncOutbox } from '@/lib/syncOutbox';
import { noteCloudWriteSettled, noteSyncPendingCount, requestWorkspaceSync } from '@/lib/syncManager';
import { isLegacyEventVesselProposal } from '@/lib/proposalFilename';

export type GeneratedProposal = {
  id: string;
  createdAt: string;
  eventDate: string;
  title: string;
  filename?: string;
  vesselType: string;
  eventType: string;
  guestCount: string;
  grandTotal: number;
  pdfDataUrl: string;
  hasPdf?: boolean;
  leadName?: string;
  leadEmail?: string;
  leadCompany?: string;
  referenceNumber?: string;
  updatedAt?: string;
};

const STORE = WORKSPACE_STORES.proposals;
const PROPOSALS_EVENT = 'nexus:proposals-updated';
const LEGACY_LOCALSTORAGE_KEY = 'nexus_generated_proposals';
const INDEX_KEY = 'nexus_proposal_index';
const LEGACY_IDB_NAME = 'nexus-proposals';

let memory: GeneratedProposal[] | null = null;

function readIndex(): GeneratedProposal[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as GeneratedProposal[]) : [];
    return Array.isArray(list) ? list.filter((row) => row && row.id) : [];
  } catch {
    return [];
  }
}

function sameProposalList(a: GeneratedProposal[], b: GeneratedProposal[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, index) => {
    const other = b[index];
    return other
      && row.id === other.id
      && row.createdAt === other.createdAt
      && row.title === other.title
      && (row.pdfDataUrl || '') === (other.pdfDataUrl || '')
      && Boolean(row.hasPdf) === Boolean(other.hasPdf);
  });
}

function remember(rows: GeneratedProposal[]) {
  const next = [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const prev = memory || [];
  memory = next;
  try {
    const slim = next.map(({ pdfDataUrl: _pdf, ...rest }) => ({
      ...rest,
      pdfDataUrl: '',
      hasPdf: Boolean(rest.hasPdf || _pdf),
    }));
    localStorage.setItem(INDEX_KEY, JSON.stringify(slim));
  } catch {
    /* the list still renders from memory */
  }
  if (!sameProposalList(prev, next)) window.dispatchEvent(new Event(PROPOSALS_EVENT));
}

/** Synchronous list for the first paint. IndexedDB fills PDFs in the background. */
export function listProposals(): GeneratedProposal[] {
  if (!memory) memory = readIndex();
  return memory.filter((row) => !isLegacyEventVesselProposal(row));
}

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
  const keep: GeneratedProposal[] = [];
  let purged = false;
  for (const row of rows) {
    if (isLegacyEventVesselProposal(row)) {
      await workspaceDelete(STORE, row.id);
      void cloudDeleteProposal(row.id).catch(() => {
        /* list hide still applies if the engine copy cannot be removed */
      });
      purged = true;
      continue;
    }
    keep.push(row);
  }
  remember(keep);
  return listProposals();
}

export async function addProposal(proposal: GeneratedProposal): Promise<boolean> {
  try {
    await ensureMigrated();
    await workspacePut(STORE, proposal);
    remember([proposal, ...listProposals().filter((row) => row.id !== proposal.id)]);
    void cloudPutProposal(proposal)
      .then(async () => {
        await dequeueSyncOutbox('proposal', proposal.id);
        void noteCloudWriteSettled();
      })
      .catch(async (err: unknown) => {
        await enqueueSyncOutbox(
          'proposal',
          proposal.id,
          err instanceof Error ? err.message : String(err),
        );
        void noteSyncPendingCount();
        void requestWorkspaceSync('manual');
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
    remember(listProposals().filter((row) => row.id !== id));
    void cloudDeleteProposal(id)
      .then(async () => {
        await dequeueSyncOutbox('proposal-delete', id);
        await dequeueSyncOutbox('proposal', id);
        void noteSyncPendingCount();
      })
      .catch(async () => {
        await enqueueSyncOutbox('proposal-delete', id);
        void noteSyncPendingCount();
      });
    return true;
  } catch {
    return false;
  }
}

export async function clearAllProposals(): Promise<void> {
  await ensureMigrated();
  try {
    await cloudClearProposals();
  } catch {
    /* still wipe the local copy */
  }
  try {
    localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    /* ignore */
  }
  await workspaceClear(STORE);
  try {
    localStorage.removeItem(INDEX_KEY);
  } catch {
    /* ignore */
  }
  memory = [];
  window.dispatchEvent(new Event(PROPOSALS_EVENT));
}

export async function ingestRemoteProposals(rows: GeneratedProposal[]): Promise<void> {
  let changed = false;
  for (const row of rows) {
    if (!row?.id) continue;
    if (isLegacyEventVesselProposal(row)) {
      await workspaceDelete(STORE, row.id);
      void cloudDeleteProposal(row.id).catch(() => {
        /* ignore */
      });
      changed = true;
      continue;
    }
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
  if (changed) await loadProposals();
}

export async function hydrateProposalsDb(): Promise<void> {
  await loadProposals();
}
