/**
 * Lead cache — IndexedDB is the durable copy.
 * localStorage is optional and often too small once every lead includes a Sapphire bag.
 */

import type { Lead } from '@/components/LeadPanel';
import { fetchLeadsFromWebhook } from '@/lib/leadsNetwork';
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

function slimLead(lead: Lead): Lead {
  const { sapphire: _sapphire, ...rest } = lead;
  return rest;
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

export async function readLeadsFromDb(mode: SheetsMode = getSheetsMode()): Promise<LeadsCachePayload | null> {
  try {
    const fromDb = await workspaceGet<LeadsCachePayload>(STORE, mode);
    if (fromDb?.leads?.length) return fromDb;
  } catch {
    /* fall through */
  }
  return readLeadsCache(mode);
}

export async function persistLeadsCache(
  leads: Lead[],
  mode: SheetsMode = getSheetsMode(),
): Promise<void> {
  const payload: LeadsCachePayload = {
    mode,
    fetchedAt: Date.now(),
    leads,
  };
  try {
    await workspacePut(STORE, payload);
  } catch {
    /* keep going so the UI still holds the n8n list */
  }
  try {
    localStorage.setItem(cacheKey(mode), JSON.stringify({ ...payload, leads: leads.map(slimLead) }));
  } catch {
    try {
      localStorage.removeItem(cacheKey(mode));
    } catch {
      /* quota */
    }
  }
  try {
    window.dispatchEvent(new Event(LEADS_EVENT));
  } catch {
    /* ignore */
  }
}

export function writeLeadsCache(leads: Lead[], mode: SheetsMode = getSheetsMode()): void {
  void persistLeadsCache(leads, mode);
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
      }
    } catch {
      /* ignore */
    }
  }
}

export async function refreshLeadsFromNetwork(): Promise<void> {
  try {
    const mode = getSheetsMode();
    const leads = await fetchLeadsFromWebhook(mode);
    if (leads.length) await persistLeadsCache(leads, mode);
  } catch {
    /* IndexedDB cache still used elsewhere */
  }
}
