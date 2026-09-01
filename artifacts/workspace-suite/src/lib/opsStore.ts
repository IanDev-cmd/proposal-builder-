/**
 * Ops notes and quote snapshots — IndexedDB only.
 * Full saved quotes also sync to the Flask workspace; Sheets is not used.
 */
import {
  WORKSPACE_STORES,
  workspaceDelete,
  workspaceGetAll,
  workspaceGetAllByIndex,
  workspacePut,
} from '@/lib/nexusWorkspaceDb';
import {
  forgetDeletedQuoteIds,
  isQuoteDeleted,
  listDeletedQuoteIds,
  rememberDeletedQuoteIds,
} from '@/lib/quoteTombstones';

export type OpsNote = {
  id: string;
  createdAt: string;
  referenceNumber: string;
  email?: string;
  leadName?: string;
  tag?: string;
  note: string;
};

export type OpsQuote = {
  id: string;
  updatedAt: string;
  referenceNumber: string;
  email?: string;
  leadName?: string;
  quoteId?: string;
  status?: string;
  version?: string;
  title?: string;
  eventType?: string;
  eventDate?: string;
  guestCount?: string | number;
  guestCountHigh?: string | number;
  grandTotal?: string | number;
  costToClient?: string | number;
  vat?: string | number;
  templateId?: string;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ops-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asQuote(row: Record<string, unknown>): OpsQuote {
  const id = String(row.id || newId());
  return {
    id,
    updatedAt: String(row.updatedAt || new Date().toISOString()),
    referenceNumber: String(row.referenceNumber || ''),
    email: String(row.email || ''),
    leadName: String(row.leadName || ''),
    quoteId: String(row.quoteId || ''),
    status: String(row.status || ''),
    version: String(row.version || ''),
    title: String(row.title || ''),
    eventType: String(row.eventType || ''),
    eventDate: String(row.eventDate || ''),
    guestCount: row.guestCount as string | number | undefined,
    guestCountHigh: row.guestCountHigh as string | number | undefined,
    grandTotal: row.grandTotal as string | number | undefined,
    costToClient: row.costToClient as string | number | undefined,
    vat: row.vat as string | number | undefined,
    templateId: String(row.templateId || ''),
  };
}

export function mergeOpsNotesIntoProgress(progressNotes: string, notes: OpsNote[]): string {
  const existing = String(progressNotes || '').trim();
  const extras = notes
    .map((n) => String(n.note || '').trim())
    .filter(Boolean)
    .filter((note) => {
      if (!existing) return true;
      const needle = note.slice(0, 48).toLowerCase();
      return needle.length >= 8 ? !existing.toLowerCase().includes(needle) : !existing.includes(note);
    });
  if (!extras.length) return existing;
  return [existing, ...extras].filter(Boolean).join(' | ');
}

export async function persistOpsNote(input: {
  referenceNumber?: string;
  email?: string;
  leadName?: string;
  note: string;
  tag?: string;
}): Promise<OpsNote> {
  const local: OpsNote = {
    id: newId(),
    createdAt: new Date().toISOString(),
    referenceNumber: input.referenceNumber || '',
    email: input.email || '',
    leadName: input.leadName || '',
    tag: input.tag || '',
    note: input.note,
  };
  await workspacePut(WORKSPACE_STORES.opsNotes, local);
  return local;
}

export async function listOpsNotes(referenceNumber?: string): Promise<OpsNote[]> {
  const ref = String(referenceNumber || '').trim();
  let local: OpsNote[] = [];
  try {
    local = ref
      ? await workspaceGetAllByIndex<OpsNote>(WORKSPACE_STORES.opsNotes, 'referenceNumber', ref)
      : [];
  } catch {
    local = [];
  }
  return local.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function persistOpsQuote(payload: Record<string, unknown>): Promise<OpsQuote> {
  const local = asQuote({
    ...payload,
    id: payload.id || newId(),
    updatedAt: new Date().toISOString(),
    referenceNumber: payload.referenceNumber || '',
  });
  forgetDeletedQuoteIds([local.id, local.quoteId]);
  await workspacePut(WORKSPACE_STORES.opsQuotes, local);
  return local;
}

function isOpsQuoteDeleted(row: OpsQuote): boolean {
  return isQuoteDeleted(row.id) || isQuoteDeleted(row.quoteId);
}

export async function deleteOpsQuoteSnapshots(
  ids: string[],
  opts?: { referenceNumber?: string },
): Promise<void> {
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  const ref = String(opts?.referenceNumber || '').trim();
  if (!unique.length && !ref) return;
  rememberDeletedQuoteIds(unique);

  let local: OpsQuote[] = [];
  try {
    local = await workspaceGetAll<OpsQuote>(WORKSPACE_STORES.opsQuotes);
  } catch {
    local = [];
  }
  const related = local.filter(
    (row) =>
      unique.includes(row.id) ||
      (row.quoteId && unique.includes(row.quoteId)) ||
      (ref && row.referenceNumber === ref),
  );
  rememberDeletedQuoteIds(related.flatMap((row) => [row.id, row.quoteId]));
  for (const row of related) {
    try {
      await workspaceDelete(WORKSPACE_STORES.opsQuotes, row.id);
    } catch {
      /* keep going */
    }
  }
  for (const id of unique) {
    try {
      await workspaceDelete(WORKSPACE_STORES.opsQuotes, id);
    } catch {
      /* keep going */
    }
  }
}

export async function listOpsQuotes(referenceNumber?: string): Promise<OpsQuote[]> {
  const ref = String(referenceNumber || '').trim();
  const deleted = listDeletedQuoteIds();
  let local: OpsQuote[] = [];
  try {
    local = ref
      ? await workspaceGetAllByIndex<OpsQuote>(WORKSPACE_STORES.opsQuotes, 'referenceNumber', ref)
      : await workspaceGetAll<OpsQuote>(WORKSPACE_STORES.opsQuotes);
  } catch {
    local = [];
  }
  return local
    .filter((row) => row.id && !deleted.has(row.id) && !isOpsQuoteDeleted(row))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
