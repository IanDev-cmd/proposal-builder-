/**
 * Persistent lead cache — IndexedDB `leads` table (nexus-workspace) plus localStorage
 * so the Leads page paints instantly while n8n refreshes in the background.
 * Keyed by Demo/Live mode so the two Sheets never cross-contaminate.
 */

import type { Lead } from '@/components/LeadPanel';
import { getSheetsMode, type SheetsMode } from '@/lib/sheetsSync';
import { WORKSPACE_STORES, workspaceGet, workspacePut } from '@/lib/nexusWorkspaceDb';

const CACHE_PREFIX = 'nexus.leadsCache.v1';
const STORE = WORKSPACE_STORES.leads;
const LEADS_EVENT = 'nexus:leads-updated';
/** Background poll interval (regular fetch without blocking UI). */
export const LEADS_REFRESH_MS = 90_000;
/** Treat cache newer than this as "fresh" (still poll, but skip if user just loaded). */
export const LEADS_FRESH_MS = 30_000;

export type LeadsCachePayload = {
  mode: SheetsMode;
  fetchedAt: number;
  leads: Lead[];
};

function cacheKey(mode: SheetsMode = getSheetsMode()): string {
  return `${CACHE_PREFIX}.${mode}`;
}

export function readLeadsCache(mode: SheetsMode = getSheetsMode()): LeadsCachePayload | null {
  try {
    const raw = localStorage.getItem(cacheKey(mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeadsCachePayload;
    if (!parsed || !Array.isArray(parsed.leads)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLeadsCache(leads: Lead[], mode: SheetsMode = getSheetsMode()): void {
  const payload: LeadsCachePayload = {
    mode,
    fetchedAt: Date.now(),
    leads,
  };
  try {
    localStorage.setItem(cacheKey(mode), JSON.stringify(payload));
  } catch {
    // Quota / private mode — IndexedDB is the durable copy
  }
  void workspacePut(STORE, payload);
  try {
    window.dispatchEvent(new Event(LEADS_EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeLeadsCache(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(LEADS_EVENT, handler);
  return () => window.removeEventListener(LEADS_EVENT, handler);
}

export function isLeadsCacheFresh(cache: LeadsCachePayload | null, maxAgeMs = LEADS_FRESH_MS): boolean {
  if (!cache?.fetchedAt) return false;
  return Date.now() - cache.fetchedAt < maxAgeMs;
}

export function clearLeadsCache(mode?: SheetsMode): void {
  try {
    if (mode) {
      localStorage.removeItem(cacheKey(mode));
      return;
    }
    localStorage.removeItem(cacheKey('demo'));
    localStorage.removeItem(cacheKey('live'));
  } catch {
    /* ignore */
  }
}

export async function hydrateLeadsDb(): Promise<void> {
  for (const mode of ['demo', 'live'] as SheetsMode[]) {
    try {
      const fromDb = await workspaceGet<LeadsCachePayload>(STORE, mode);
      const local = readLeadsCache(mode);
      if (!fromDb && local?.leads?.length) {
        await workspacePut(STORE, local);
        continue;
      }
      if (!fromDb?.leads?.length) continue;
      if (!local || fromDb.fetchedAt >= (local.fetchedAt || 0)) {
        try {
          localStorage.setItem(cacheKey(mode), JSON.stringify(fromDb));
        } catch {
          /* ignore */
        }
      } else {
        await workspacePut(STORE, local);
      }
    } catch {
      /* localStorage still available */
    }
  }
  try {
    window.dispatchEvent(new Event(LEADS_EVENT));
  } catch {
    /* ignore */
  }
}
