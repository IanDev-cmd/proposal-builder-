/**
 * Live Cost Mother catalog → UX, IndexedDB fallback, Flask workspace share.
 * Last successful fetch is the fallback so bundled git JSON is only first-run.
 */
import { parseCostRatesPayload } from '@/lib/contracts';
import {
  parseCostMotherRows,
  setLiveCostMotherRates,
  getCostMotherMeta,
  type CostMotherBundle,
} from '@/lib/costMotherLookup';
import { setLiveCatalogLines } from '@/lib/quoteBuilderCatalog';
import { fetchCostRates, type CostRatesPayload } from '@/lib/sheetsSync';
import { WORKSPACE_STORES, workspaceGet, workspacePut } from '@/lib/nexusWorkspaceDb';
import { cloudGetCatalog, cloudPutCatalog } from '@/lib/workspaceCloud';

export const CATALOG_EVENT = 'nexus:catalog-updated';
export const CATALOG_REFRESH_MS = 30_000;
export const CATALOG_STALE_MS = 12 * 60 * 1000;
const RECORD_ID = 'cost-rates';
const STORE = WORKSPACE_STORES.catalog;

export type CatalogCachePayload = {
  id: typeof RECORD_ID;
  fetchedAt: number;
  catalogBuiltAt?: string;
  payload: CostRatesPayload;
};

let lastNote = '';
let lastFetchedAt = 0;

export function getCatalogRatesNote(): string {
  return lastNote;
}

function catalogTimestamp(row: { catalogBuiltAt?: string; fetchedAt?: number; savedAt?: string } | null): number {
  if (!row) return 0;
  const built = Date.parse(String(row.catalogBuiltAt || ''));
  if (Number.isFinite(built) && built > 0) return built;
  const saved = Date.parse(String(row.savedAt || ''));
  if (Number.isFinite(saved) && saved > 0) return saved;
  return Number(row.fetchedAt) || 0;
}

function applyPayload(rates: CostRatesPayload): boolean {
  const structured =
    rates.costMother ||
    parseCostMotherRows((rates.costMotherItems || rates.cateringRates || []) as Record<string, unknown>[]);
  if (structured?.items?.length) {
    const liveMargins =
      Array.isArray(structured.margins) && structured.margins.length
        ? structured.margins
        : Array.isArray(rates.margins) && rates.margins.length
          ? (rates.margins as NonNullable<(typeof structured)['margins']>)
          : structured.margins;
    setLiveCostMotherRates(
      (liveMargins ? { ...structured, margins: liveMargins } : structured) as CostMotherBundle,
    );
  } else {
    return false;
  }
  if (Array.isArray(rates.lines) && rates.lines.length) {
    setLiveCatalogLines(rates.lines);
  }
  const meta = getCostMotherMeta();
  const n = rates.counts?.costMotherItems ?? rates.counts?.cateringRates ?? meta.itemCount;
  const extra = Array.isArray(rates.lines) ? rates.lines.length : 0;
  const extraKinds = [
    rates.counts?.margins ? `${rates.counts.margins} margins` : '',
    rates.counts?.staffRatios ? `${rates.counts.staffRatios} staff ratios` : '',
    rates.counts?.cutleryRatios ? `${rates.counts.cutleryRatios} cutlery ratios` : '',
  ].filter(Boolean);
  const builtAt = Date.parse(String(rates.catalogBuiltAt || ''));
  const stale = Number.isFinite(builtAt) && Date.now() - builtAt > CATALOG_STALE_MS;
  lastNote = meta.live
    ? `Live catalog (${n} Cost Mother lines${extra ? ` · ${extra} sheet cards` : ''}${extraKinds.length ? ` · ${extraKinds.join(' · ')}` : ''}${stale ? ' · catalog save overdue' : ''}).`
    : `Using last-good Cost Mother cache (${meta.itemCount} lines).`;
  try {
    window.dispatchEvent(new CustomEvent(CATALOG_EVENT, { detail: { note: lastNote, stale } }));
  } catch {
    /* ignore */
  }
  return true;
}

async function persistCache(payload: CostRatesPayload): Promise<CatalogCachePayload> {
  const row: CatalogCachePayload = {
    id: RECORD_ID,
    fetchedAt: Date.now(),
    catalogBuiltAt: payload.catalogBuiltAt,
    payload,
  };
  lastFetchedAt = row.fetchedAt;
  try {
    await workspacePut(STORE, row);
  } catch {
    /* memory overlay already applied */
  }
  void cloudPutCatalog({
    id: RECORD_ID,
    savedAt: new Date(row.fetchedAt).toISOString(),
    catalogBuiltAt: row.catalogBuiltAt,
    payload: payload as Record<string, unknown>,
  }).catch(() => {
    /* next poll retries */
  });
  return row;
}

async function readLocalCache(): Promise<CatalogCachePayload | null> {
  try {
    return await workspaceGet<CatalogCachePayload>(STORE, RECORD_ID);
  } catch {
    return null;
  }
}

export async function hydrateCatalogCache(): Promise<void> {
  const local = await readLocalCache();
  let cloud: Awaited<ReturnType<typeof cloudGetCatalog>> = null;
  try {
    cloud = await cloudGetCatalog();
  } catch {
    cloud = null;
  }
  const cloudRow: CatalogCachePayload | null =
    cloud?.payload && typeof cloud.payload === 'object'
      ? {
          id: RECORD_ID,
          fetchedAt: catalogTimestamp(cloud) || Date.now(),
          catalogBuiltAt: cloud.catalogBuiltAt,
          payload: cloud.payload as CostRatesPayload,
        }
      : null;
  const best =
    catalogTimestamp(cloudRow) > catalogTimestamp(local) ? cloudRow : local;
  if (best?.payload) {
    try {
      const parsed = parseCostRatesPayload(best.payload);
      applyPayload(parsed);
    } catch {
      applyPayload(best.payload);
    }
    lastFetchedAt = best.fetchedAt;
  }
}

export async function refreshCostCatalog(): Promise<void> {
  const ratesRaw = await fetchCostRates();
  let rates: CostRatesPayload;
  try {
    rates = parseCostRatesPayload(ratesRaw);
  } catch {
    rates = ratesRaw as CostRatesPayload;
  }
  if (!applyPayload(rates)) return;
  await persistCache(rates);
}

export function subscribeCatalog(cb: (note: string) => void): () => void {
  const handler = (ev: Event) => {
    const note = (ev as CustomEvent<{ note?: string }>).detail?.note || lastNote;
    cb(note);
  };
  window.addEventListener(CATALOG_EVENT, handler);
  return () => window.removeEventListener(CATALOG_EVENT, handler);
}

export function lastCatalogFetchedAt(): number {
  return lastFetchedAt;
}
