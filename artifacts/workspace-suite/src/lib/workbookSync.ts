/**
 * Pull every workbook change (leads + Cost Mother catalog) into the UX.
 * Apps Script rebuilds on edit/change; this loop guarantees a system-wide pull
 * within 30 seconds, including last-good fallback from IndexedDB / Flask.
 */
import { refreshLeadsFromNetwork } from '@/lib/leadCache';
import { CATALOG_REFRESH_MS, hydrateCatalogCache, refreshCostCatalog } from '@/lib/catalogSync';

let started = false;

export async function pullWorkbookToUx(): Promise<void> {
  await Promise.all([
    refreshLeadsFromNetwork().catch(() => undefined),
    refreshCostCatalog().catch(() => undefined),
  ]);
}

export function startWorkbookSync(): void {
  if (typeof window === 'undefined' || started) return;
  started = true;
  void hydrateCatalogCache().then(() => pullWorkbookToUx());
  window.setInterval(() => {
    void pullWorkbookToUx();
  }, CATALOG_REFRESH_MS);
  const onVisible = () => {
    if (document.visibilityState === 'hidden') return;
    void pullWorkbookToUx();
  };
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);
}
