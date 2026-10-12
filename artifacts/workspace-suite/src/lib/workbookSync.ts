/**
 * Pull workbook changes (leads + Cost Mother catalog) into the UX.
 * The workspace sync manager owns the timer. This module only hydrates once
 * and coalesces overlapping pulls from that scheduler.
 */
import { refreshLeadsFromNetwork } from '@/lib/leadCache';
import { hydrateCatalogCache, refreshCostCatalog } from '@/lib/catalogSync';
import { getTeamToken } from '@/lib/teamSession';

let started = false;
let pullInflight: Promise<void> | null = null;

export function pullWorkbookToUx(): Promise<void> {
  if (!getTeamToken()) return Promise.resolve();
  if (pullInflight) return pullInflight;
  pullInflight = Promise.all([
    refreshLeadsFromNetwork().catch(() => undefined),
    refreshCostCatalog().catch(() => undefined),
  ])
    .then(() => undefined)
    .finally(() => {
      pullInflight = null;
    });
  return pullInflight;
}

/** After PIN login: read the last catalog. The 3-minute loop lives in the sync manager. */
export function startWorkbookSync(): void {
  if (typeof window === 'undefined' || started) return;
  started = true;
  void hydrateCatalogCache();
}
