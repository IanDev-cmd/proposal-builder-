/**
 * Lead cache — IndexedDB is the durable copy.
 * localStorage is optional and often too small once every lead includes a Sapphire bag.
 */

import type { Lead } from '@/components/LeadPanel';
import { fetchLeadsFromWebhook } from '@/lib/leadsNetwork';
import { WORKSPACE_STORES, workspaceDelete, workspaceGet, workspacePut } from '@/lib/nexusWorkspaceDb';

const CACHE_KEY = 'nexus.leadsCache.v2';
const STORE = WORKSPACE_STORES.leads;
const LEADS_RECORD_ID = 'leads';
const LEADS_EVENT = 'nexus:leads-updated';
export const LEADS_REFRESH_MS = 90_000;
export const LEADS_FRESH_MS = 30_000;

export type LeadsCachePayload = {
  id: typeof LEADS_RECORD_ID;
  fetchedAt: number;
  leads: Lead[];
};

function slimLead(lead: Lead): Lead {
  const { sapphire: _sapphire, ...rest } = lead;
  return rest;
}

export function readLeadsCache(): LeadsCachePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeadsCachePayload;
    if (!parsed || !Array.isArray(parsed.leads)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readLeadsFromDb(): Promise<LeadsCachePayload | null> {
  try {
    const fromDb = await workspaceGet<LeadsCachePayload>(STORE, LEADS_RECORD_ID);
    if (fromDb?.leads?.length) return fromDb;
  } catch {
    /* fall through */
  }
  return readLeadsCache();
}

export async function persistLeadsCache(leads: Lead[]): Promise<void> {
  const payload: LeadsCachePayload = {
    id: LEADS_RECORD_ID,
    fetchedAt: Date.now(),
    leads,
  };
  try {
    await workspacePut(STORE, payload);
  } catch {
    /* keep going so the UI still holds the Sheets list */
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, leads: leads.map(slimLead) }));
  } catch {
    try {
      localStorage.removeItem(CACHE_KEY);
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

export function writeLeadsCache(leads: Lead[]): void {
  void persistLeadsCache(leads);
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

export function clearLeadsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
  void workspaceDelete(STORE, LEADS_RECORD_ID);
}

export async function hydrateLeadsDb(): Promise<void> {
  try {
    const fromDb = await workspaceGet<LeadsCachePayload>(STORE, LEADS_RECORD_ID);
    const local = readLeadsCache();
    if (!fromDb && local?.leads?.length) {
      await workspacePut(STORE, { ...local, id: LEADS_RECORD_ID });
    }
  } catch {
    /* ignore */
  }
}

export async function refreshLeadsFromNetwork(): Promise<void> {
  try {
    const leads = await fetchLeadsFromWebhook();
    if (leads.length) await persistLeadsCache(leads);
  } catch {
    /* IndexedDB cache still used elsewhere */
  }
}
