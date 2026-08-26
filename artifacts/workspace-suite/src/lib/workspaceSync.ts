import { refreshLeadsFromNetwork } from '@/lib/leadCache';
import { ingestRemoteProposals, loadProposals } from '@/lib/proposalStore';
import { isLegacyEventVesselProposal } from '@/lib/proposalFilename';
import { ingestRemoteQuotes, listSavedQuotes } from '@/lib/savedQuotesStore';
import { listDeletedQuoteIds } from '@/lib/quoteTombstones';
import {
  cloudDeleteProposal,
  cloudDeleteQuote,
  cloudGetProposal,
  cloudListProposals,
  cloudListQuotes,
  cloudPutProposal,
  cloudPutQuote,
} from '@/lib/workspaceCloud';

/** Pull shared quotes/proposals from the proposal engine, then upload any local-only rows. */
export async function syncWorkspaceCloud(): Promise<void> {
  try {
    const remoteQuotes = await cloudListQuotes();
    const deleted = listDeletedQuoteIds();
    for (const quote of remoteQuotes) {
      if (deleted.has(quote.id)) {
        void cloudDeleteQuote(quote.id).catch(() => {
          /* retry on next boot */
        });
      }
    }
    await ingestRemoteQuotes(remoteQuotes.filter((q) => !deleted.has(q.id)));
    const remoteById = new Map(remoteQuotes.map((q) => [q.id, q]));
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
        void cloudPutQuote(quote).catch(() => {
          /* retry on next boot */
        });
      }
    }
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
    const remoteIds = new Set(remoteMeta.map((p) => p.id));
    for (const proposal of local) {
      if (isLegacyEventVesselProposal(proposal)) continue;
      if (proposal.pdfDataUrl && !remoteIds.has(proposal.id)) {
        void cloudPutProposal(proposal).catch(() => {
          /* retry on next boot */
        });
      }
    }
  } catch {
    /* engine asleep or offline */
  }
}

export async function syncSharedWorkspace(): Promise<void> {
  await Promise.all([refreshLeadsFromNetwork(), syncWorkspaceCloud()]);
}
