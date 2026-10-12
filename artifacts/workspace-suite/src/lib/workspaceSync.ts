import { refreshLeadsFromNetwork } from '@/lib/leadCache';
import { getProposal, ingestRemoteProposals, loadProposals } from '@/lib/proposalStore';
import { isLegacyEventVesselProposal } from '@/lib/proposalFilename';
import {
  discardDeletedQuote,
  ingestRemoteQuotes,
  getSavedQuote,
  getSavedQuoteAsync,
  listSavedQuotes,
  type SavedQuote,
} from '@/lib/savedQuotesStore';
import { isQuoteDeleted, listDeletedQuoteIds } from '@/lib/quoteTombstones';
import { getTeamToken } from '@/lib/teamSession';
import { pullWorkbookToUx } from '@/lib/workbookSync';
import { planQuoteSync, refreshesWorkbook } from '@/lib/workspaceTraffic';
import {
  dequeueSyncOutbox,
  enqueueSyncOutbox,
  listSyncOutbox,
  markSyncOutboxAttempt,
  type SyncOutboxJob,
} from '@/lib/syncOutbox';
import {
  requestWorkspaceSync,
  startSyncManager,
  type SyncRunContext,
} from '@/lib/syncManager';
import {
  cloudDeleteProposal,
  cloudDeleteQuote,
  cloudGetProposal,
  cloudGetQuote,
  cloudListProposals,
  cloudListQuotes,
  cloudPutProposal,
  cloudPutQuote,
  isQuoteDeletedConflict,
} from '@/lib/workspaceCloud';

async function drainSyncOutbox(): Promise<void> {
  const jobs = await listSyncOutbox();
  for (const job of jobs) {
    try {
      await flushOutboxJob(job);
      await dequeueSyncOutbox(job.kind, job.entityId);
    } catch (err) {
      await markSyncOutboxAttempt(
        job.kind,
        job.entityId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

async function flushOutboxJob(job: SyncOutboxJob): Promise<void> {
  if (job.kind === 'quote-delete') {
    await cloudDeleteQuote(job.entityId);
    return;
  }
  if (job.kind === 'proposal-delete') {
    await cloudDeleteProposal(job.entityId);
    return;
  }
  if (job.kind === 'quote') {
    if (isQuoteDeleted(job.entityId)) return;
    const quote = getSavedQuote(job.entityId) || (await getSavedQuoteAsync(job.entityId));
    if (!quote || isQuoteDeleted(quote.id)) return;
    await putQuoteRespectingDelete(quote);
    return;
  }
  const proposal = await getProposal(job.entityId);
  if (!proposal?.pdfDataUrl) {
    throw new Error('Proposal PDF is not on this device yet');
  }
  await cloudPutProposal(proposal);
}

async function prefetchDeepLink(ctx?: SyncRunContext): Promise<void> {
  if (ctx?.quoteId) {
    const remote = await cloudGetQuote(ctx.quoteId);
    if (remote) await ingestRemoteQuotes([remote]);
  }
  if (ctx?.proposalId) {
    const remote = await cloudGetProposal(ctx.proposalId);
    if (remote) await ingestRemoteProposals([remote]);
  }
}

async function putQuoteRespectingDelete(quote: SavedQuote): Promise<void> {
  if (isQuoteDeleted(quote.id)) return;
  try {
    await cloudPutQuote(quote);
    await dequeueSyncOutbox('quote', quote.id);
  } catch (err) {
    if (isQuoteDeletedConflict(err)) {
      await discardDeletedQuote(quote.id);
      return;
    }
    throw err;
  }
}

/** Pull shared quotes/proposals from the proposal engine, then upload any local-only rows. */
export async function syncWorkspaceCloud(ctx?: SyncRunContext): Promise<void> {
  if (!getTeamToken()) return;
  try {
    await prefetchDeepLink(ctx);
  } catch {
    /* list sync still runs */
  }

  try {
    await drainSyncOutbox();
  } catch {
    /* full pull/push still reconciles */
  }

  try {
    const remoteQuotes = await cloudListQuotes();
    const deleted = listDeletedQuoteIds();
    const remoteById = new Map(remoteQuotes.map((q) => [q.id, q]));
    const localById = new Map(listSavedQuotes().map((q) => [q.id, q]));
    const fetches: Promise<void>[] = [];
    for (const remote of remoteQuotes) {
      const action = planQuoteSync({
        local: localById.get(remote.id) || null,
        remote,
        deleted: deleted.has(remote.id),
      });
      if (action === 'drop-remote') {
        void cloudDeleteQuote(remote.id).catch(() => {
          /* retry on next sync */
        });
        continue;
      }
      if (action === 'fetch') {
        fetches.push(
          (async () => {
            const full = await cloudGetQuote(remote.id);
            if (full && !listDeletedQuoteIds().has(full.id)) await ingestRemoteQuotes([full]);
          })(),
        );
      }
    }
    await Promise.all(fetches);
    await ingestRemoteQuotes(remoteQuotes.filter((q) => !deleted.has(q.id)));
    const quoteUploads: Promise<void>[] = [];
    for (const quote of listSavedQuotes()) {
      const remote = remoteById.get(quote.id) || null;
      if (planQuoteSync({ local: quote, remote, deleted: isQuoteDeleted(quote.id) }) !== 'upload') {
        continue;
      }
      quoteUploads.push(
        putQuoteRespectingDelete(quote).catch(async (err: unknown) => {
          await enqueueSyncOutbox(
            'quote',
            quote.id,
            err instanceof Error ? err.message : String(err),
          );
        }),
      );
    }
    await Promise.all(quoteUploads);
  } catch {
    /* engine asleep or offline — local IndexedDB still used */
  }

  try {
    const remoteMeta = await cloudListProposals();
    for (const meta of remoteMeta) {
      if (isLegacyEventVesselProposal(meta)) {
        void cloudDeleteProposal(meta.id).catch(() => {
          /* list hide still applies */
        });
      }
    }
    const local = await loadProposals();
    const localById = new Map(local.map((p) => [p.id, p]));
    const fetched = await Promise.all(
      remoteMeta.map(async (meta) => {
        if (isLegacyEventVesselProposal(meta)) return null;
        if (ctx?.proposalId && meta.id === ctx.proposalId) {
          try {
            return await cloudGetProposal(meta.id);
          } catch {
            return null;
          }
        }
        const localRow = localById.get(meta.id);
        if (localRow?.pdfDataUrl && (localRow.createdAt || '') >= (meta.createdAt || '')) {
          return null;
        }
        try {
          return await cloudGetProposal(meta.id);
        } catch {
          return null;
        }
      }),
    );
    await ingestRemoteProposals(fetched.filter((row): row is NonNullable<typeof row> => Boolean(row)));
    const remoteById = new Map(remoteMeta.map((p) => [p.id, p]));
    const proposalUploads: Promise<void>[] = [];
    for (const proposal of local) {
      if (isLegacyEventVesselProposal(proposal)) continue;
      if (!proposal.pdfDataUrl) continue;
      const remote = remoteById.get(proposal.id);
      const localNewer = (proposal.createdAt || '') > (remote?.createdAt || '');
      if (!remote || !remote.hasPdf || localNewer) {
        proposalUploads.push(
          cloudPutProposal(proposal)
            .then(async () => dequeueSyncOutbox('proposal', proposal.id))
            .catch(async (err: unknown) => {
              await enqueueSyncOutbox(
                'proposal',
                proposal.id,
                err instanceof Error ? err.message : String(err),
              );
            }),
        );
      }
    }
    await Promise.all(proposalUploads);
  } catch {
    /* engine asleep or offline */
  }
}

export async function syncSharedWorkspace(): Promise<void> {
  await Promise.all([refreshLeadsFromNetwork(), syncWorkspaceCloud()]);
}

/** After PIN login: pull/push shared quotes, then keep retrying while this tab is signed in. */
export function startWorkspaceCloudSync(): void {
  if (typeof window === 'undefined') return;
  startSyncManager(async (ctx) => {
    if (!getTeamToken()) return;
    const tasks: Promise<void>[] = [syncWorkspaceCloud(ctx)];
    if (refreshesWorkbook(ctx.reason)) tasks.push(pullWorkbookToUx());
    await Promise.all(tasks);
  });
}

export { requestWorkspaceSync };
