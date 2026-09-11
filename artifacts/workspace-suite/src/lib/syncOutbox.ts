/**
 * Local retry queue for quote/proposal cloud pushes that failed while offline.
 * Payloads live in the main IndexedDB stores; this table only tracks ids.
 */
import {
  WORKSPACE_STORES,
  workspaceDelete,
  workspaceGetAll,
  workspacePut,
} from '@/lib/nexusWorkspaceDb';

export type SyncOutboxKind = 'quote' | 'proposal' | 'quote-delete' | 'proposal-delete';

export type SyncOutboxJob = {
  id: string;
  kind: SyncOutboxKind;
  entityId: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
};

const STORE = WORKSPACE_STORES.syncOutbox;

export function syncOutboxId(kind: SyncOutboxKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

export async function listSyncOutbox(): Promise<SyncOutboxJob[]> {
  try {
    const rows = await workspaceGetAll<SyncOutboxJob>(STORE);
    return rows.filter((row) => row?.id && row.entityId);
  } catch {
    return [];
  }
}

export async function enqueueSyncOutbox(
  kind: SyncOutboxKind,
  entityId: string,
  lastError?: string,
): Promise<void> {
  const id = syncOutboxId(kind, entityId);
  const now = new Date().toISOString();
  const existing = (await listSyncOutbox()).find((row) => row.id === id);
  const row: SyncOutboxJob = {
    id,
    kind,
    entityId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    attempts: existing?.attempts || 0,
    lastAttemptAt: existing?.lastAttemptAt,
    lastError: lastError || existing?.lastError,
  };
  try {
    await workspacePut(STORE, row);
  } catch {
    /* next wake still compares local vs remote */
  }
}

export async function markSyncOutboxAttempt(
  kind: SyncOutboxKind,
  entityId: string,
  error?: string,
): Promise<void> {
  const id = syncOutboxId(kind, entityId);
  const existing = (await listSyncOutbox()).find((row) => row.id === id);
  const now = new Date().toISOString();
  const row: SyncOutboxJob = {
    id,
    kind,
    entityId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    attempts: (existing?.attempts || 0) + 1,
    lastAttemptAt: now,
    lastError: error,
  };
  try {
    await workspacePut(STORE, row);
  } catch {
    /* ignore */
  }
}

export async function dequeueSyncOutbox(kind: SyncOutboxKind, entityId: string): Promise<void> {
  try {
    await workspaceDelete(STORE, syncOutboxId(kind, entityId));
  } catch {
    /* ignore */
  }
}
