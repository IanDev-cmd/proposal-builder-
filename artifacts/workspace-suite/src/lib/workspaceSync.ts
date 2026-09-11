import { refreshLeadsFromNetwork } from '@/lib/leadCache';
import { ingestRemoteProposals, loadProposals } from '@/lib/proposalStore';
import { isLegacyEventVesselProposal } from '@/lib/proposalFilename';
import { ingestRemoteQuotes, listSavedQuotes } from '@/lib/savedQuotesStore';
import { listDeletedQuoteIds } from '@/lib/quoteTombstones';
import { getTeamToken } from '@/lib/teamSession';
import {
  cloudDeleteProposal,
  cloudDeleteQuote,
  cloudGetProposal,
  cloudListProposals,
  cloudListQuotes,
  cloudPutProposal,
  cloudPutQuote,
} from '@/lib/workspaceCloud';

const CLOUD_REFRESH_MS = 30_000;
let cloudLoopStarted = false;

/** Pull shared quotes/proposals from the proposal engine, then upload any local-only rows. */
export async function syncWorkspaceCloud(): Promise<void> {
  if (!getTeamToken()) return;
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
          cloudPutQuote(quote).catch(() => {
            /* retry on next sync */
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
      if (!remote || !remote.hasPdf) {
        proposalUploads.push(
          cloudPutProposal(proposal).catch(() => {
            /* retry on next sync */
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
  void syncWorkspaceCloud();
  if (cloudLoopStarted) return;
  cloudLoopStarted = true;
  window.setInterval(() => {
    if (!getTeamToken()) return;
    void syncWorkspaceCloud();
  }, CLOUD_REFRESH_MS);
  const onVisible = () => {
    if (document.visibilityState === 'hidden') return;
    if (!getTeamToken()) return;
    void syncWorkspaceCloud();
  };
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);
}
