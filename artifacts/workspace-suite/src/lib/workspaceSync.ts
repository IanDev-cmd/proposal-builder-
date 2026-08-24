import { refreshLeadsFromNetwork } from '@/lib/leadCache';
import { ingestRemoteProposals, loadProposals } from '@/lib/proposalStore';
import { ingestRemoteQuotes, listSavedQuotes } from '@/lib/savedQuotesStore';
import {
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
    await ingestRemoteQuotes(remoteQuotes);
    const remoteById = new Map(remoteQuotes.map((q) => [q.id, q]));
    for (const quote of listSavedQuotes()) {
      const remote = remoteById.get(quote.id);
      const remoteHasData = Boolean(remote?.data && Object.keys(remote.data).length);
      const localHasData = Boolean(quote.data && Object.keys(quote.data).length);
      if (!remote || (quote.savedAt || '') > (remote.savedAt || '') || (localHasData && !remoteHasData)) {
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
    const local = await loadProposals();
    const localById = new Map(local.map((p) => [p.id, p]));
    const fetched = await Promise.all(
      remoteMeta.map(async (meta) => {
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
