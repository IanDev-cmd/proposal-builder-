/**
 * Persistent lead cache — show cached rows instantly, refresh from n8n in the background.
 * Keyed by Demo/Live mode so the two Sheets never cross-contaminate.
 */

import type { Lead } from '@/components/LeadPanel';
import { getSheetsMode, type SheetsMode } from '@/lib/sheetsSync';

const CACHE_PREFIX = 'nexus.leadsCache.v1';
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
  try {
    const payload: LeadsCachePayload = {
      mode,
      fetchedAt: Date.now(),
      leads,
    };
    localStorage.setItem(cacheKey(mode), JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore; network path still works
  }
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
