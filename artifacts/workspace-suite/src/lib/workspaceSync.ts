import { refreshLeadsFromNetwork } from '@/lib/leadCache';
import { getProposal, ingestRemoteProposals, loadProposals } from '@/lib/proposalStore';
import { isLegacyEventVesselProposal } from '@/lib/proposalFilename';
import { ingestRemoteQuotes, getSavedQuote, getSavedQuoteAsync, listSavedQuotes } from '@/lib/savedQuotesStore';
import { listDeletedQuoteIds } from '@/lib/quoteTombstones';
import { getTeamToken } from '@/lib/teamSession';
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
    const quote = getSavedQuote(job.entityId) || (await getSavedQuoteAsync(job.entityId));
    if (!quote) {
      await dequeueSyncOutbox(job.kind, job.entityId);
      return;
    }
    await cloudPutQuote(quote);
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
    for (const quote of remoteQuotes) {
      if (deleted.has(quote.id)) {
        void cloudDeleteQuote(quote.id).catch(() => {
          /* retry on next sync */
        });
      }
    }
    await ingestRemoteQuotes(remoteQuotes.filter((q) => !deleted.has(q.id)));
    const remoteById = new Map(remoteQuotes.map((q) => [q.id, q]));
    const quoteUploads: Promise<void>[] = [];
    for (const quote of listSavedQuotes()) {
      if (deleted.has(quote.id)) continue;
      const remote = remoteById.get(quote.id);
      const remoteHasData = Boolean(remote?.data && Object.keys(remote.data).length);
      const localHasData = Boolean(quote.data && Object.keys(quote.data).length);
      const localReviewNewer = (quote.reviewedAt || '') > (remote?.reviewedAt || '');
      if (
        !remote ||
        (quote.savedAt || '') > (remote.savedAt || '') ||
        localReviewNewer ||
        (localHasData && !remoteHasData)
      ) {
        quoteUploads.push(
          cloudPutQuote(quote)
            .then(async () => dequeueSyncOutbox('quote', quote.id))
            .catch(async (err: unknown) => {
              await enqueueSyncOutbox(
                'quote',
                quote.id,
                err instanceof Error ? err.message : String(err),
              );
            }),
        );
      }
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
    await syncWorkspaceCloud(ctx);
  });
}

export { requestWorkspaceSync };
