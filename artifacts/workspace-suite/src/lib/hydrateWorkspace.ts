import { hydrateLeadsDb } from './leadCache';
import { getWorkspaceDb } from './nexusWorkspaceDb';
import { hydrateProposalsDb } from './proposalStore';
import { hydrateSavedQuotesDb } from './savedQuotesStore';

let started: Promise<void> | null = null;

/** Opens IndexedDB and hydrates Leads, Saved Quotes, and Generated Proposals. Safe to call many times. */
export function hydrateWorkspace(): Promise<void> {
  if (started) return started;
  started = (async () => {
    await getWorkspaceDb();
    await Promise.all([hydrateLeadsDb(), hydrateSavedQuotesDb(), hydrateProposalsDb()]);
    window.dispatchEvent(new Event('nexus:workspace-ready'));
  })();
  return started;
}

if (typeof window !== 'undefined') {
  void hydrateWorkspace();
}
