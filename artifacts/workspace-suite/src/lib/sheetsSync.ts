/**
 * Thin client for n8n Sheets write-back webhooks.
 * Google Sheets remains the source of truth.
 *
 * Demo → test workbook 1f67f2907cUnHbaXJOb8uf-QfUnPSfv9sQekjvLS8ITs
 * Live → production workbook 1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o
 * n8n Google Sheets OAuth: GZhF0w9mcVHkFaHo (Google Sheets account)
 */

import { N8N_BASE } from '@/lib/backendUrls';
import { N8nWebhookError } from '@/lib/errors';
import { fetchWithTimeout } from '@/lib/http';

const STORAGE_KEY = 'nexus.sheetsMode';

export type SheetsMode = 'demo' | 'live';

export const SHEETS = {
  demo: {
    id: '1f67f2907cUnHbaXJOb8uf-QfUnPSfv9sQekjvLS8ITs',
    url: 'https://docs.google.com/spreadsheets/d/1f67f2907cUnHbaXJOb8uf-QfUnPSfv9sQekjvLS8ITs/edit',
    label: 'Nexus TEST',
  },
  live: {
    id: '1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o',
    url: 'https://docs.google.com/spreadsheets/d/1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o/edit',
    label: 'WEOTT Production',
  },
} as const;

type ModeListener = (mode: SheetsMode) => void;
const listeners = new Set<ModeListener>();

export function getSheetsMode(): SheetsMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'live' ? 'live' : 'demo';
  } catch {
    return 'demo';
  }
}

export function setSheetsMode(mode: SheetsMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(mode));
}

export function subscribeSheetsMode(fn: ModeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveSheetMeta() {
  return SHEETS[getSheetsMode()];
}

async function postWebhook(path: string, payload: Record<string, unknown>) {
  const mode = (payload.mode as SheetsMode) || getSheetsMode();
  let res: Response;
  try {
    res = await fetchWithTimeout(`${N8N_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, mode }),
      timeoutMs: 45_000,
    });
  } catch (err) {
    throw new N8nWebhookError(
      path,
      undefined,
      `Could not reach n8n (${path}): ${err instanceof Error ? err.message : 'network error'}`,
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).trim().slice(0, 160);
    } catch {
      /* ignore */
    }
    throw new N8nWebhookError(
      path,
      res.status,
      detail ? `${path} failed (${res.status}): ${detail}` : undefined,
    );
  }
  try {
    return await res.json();
  } catch {
    return { ok: true };
  }
}

export async function appendProgressNote(payload: {
  referenceNumber?: string;
  email?: string;
  leadName?: string;
  note: string;
  tag?: string;
  mode?: SheetsMode;
}): Promise<{ ok: boolean }> {
  return postWebhook('NoteAppend', payload as Record<string, unknown>);
}

export async function writeQuoteStatus(payload: Record<string, unknown>): Promise<{ ok: boolean }> {
  return postWebhook('QuoteStatus', payload);
}

export async function writeLeadUpdate(payload: Record<string, unknown>): Promise<{ ok: boolean }> {
  return postWebhook('LeadUpdate', payload);
}

/** Cost Mother / Price Comparison / ratios — always from LIVE rate tabs. */
export type CostRatesPayload = {
  ok?: boolean;
  source?: string;
  note?: string;
  vesselRates?: Record<string, unknown>[];
  cateringRates?: Record<string, unknown>[];
  /** Structured Cost Mother (preferred) from Assemble Rates / Apps Script catalog. */
  costMother?: {
    source?: string;
    items: { row?: number; label: string; rates: Record<string, number> }[];
    margins?: { eventService: string; market: string; months: Record<string, number> }[];
  };
  /** Live Quote Sheet lines from `_Nexus Catalog` (new Cost Mother rows appear as cards). */
  lines?: { id?: string; section?: string; label?: string; multiplier?: string }[];
  vessels?: string[];
  costMotherItems?: Record<string, unknown>[];
  quoteBuilder2026?: Record<string, unknown>[];
  margins?: Record<string, unknown>[];
  staffRatios?: Record<string, unknown>[];
  cutleryRatios?: Record<string, unknown>[];
  counts?: Record<string, number>;
};

export async function fetchCostRates(mode?: SheetsMode): Promise<CostRatesPayload> {
  return postWebhook('CostRatesFetch', { mode: mode || getSheetsMode() });
}
