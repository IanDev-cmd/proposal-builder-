/**
 * Thin client for the Apps Script Sheets API (NexusApi.gs).
 * Production workbook 1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o is the only sheet.
 * Notes and quote snapshots live in IndexedDB (opsStore) / Flask workspace, not Sheets.
 */

import { callAppsScript } from '@/lib/appsScriptClient';
import { persistOpsNote, persistOpsQuote } from '@/lib/opsStore';
import { SheetsApiError } from '@/lib/errors';

export const SHEETS = {
  id: '1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o',
  url: 'https://docs.google.com/spreadsheets/d/1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o/edit',
  label: 'WEOTT Production',
} as const;

export function getActiveSheetMeta() {
  return SHEETS;
}

async function postAction(action: string, payload: Record<string, unknown> = {}) {
  try {
    return await callAppsScript(action, payload);
  } catch (err) {
    if (err instanceof SheetsApiError) throw err;
    throw new SheetsApiError(
      action,
      undefined,
      `Could not reach Apps Script (${action}): ${err instanceof Error ? err.message : 'network error'}`,
    );
  }
}

export async function appendProgressNote(payload: {
  referenceNumber?: string;
  email?: string;
  leadName?: string;
  note: string;
  tag?: string;
}): Promise<{ ok: boolean }> {
  await persistOpsNote(payload);
  return { ok: true };
}

export async function writeQuoteStatus(payload: Record<string, unknown>): Promise<{ ok: boolean }> {
  await persistOpsQuote(payload);
  return { ok: true };
}

/** Cost Mother / Price Comparison / ratios from the workbook `_Nexus Catalog`. */
export type CostRatesPayload = {
  ok?: boolean;
  source?: string;
  note?: string;
  vesselRates?: Record<string, unknown>[];
  cateringRates?: Record<string, unknown>[];
  costMother?: {
    source?: string;
    items: { row?: number; label: string; rates: Record<string, number> }[];
    margins?: { eventService: string; market: string; months: Record<string, number> }[];
  };
  lines?: { id?: string; section?: string; label?: string; multiplier?: string }[];
  vessels?: string[];
  costMotherItems?: Record<string, unknown>[];
  quoteBuilder2026?: Record<string, unknown>[];
  margins?: Record<string, unknown>[];
  staffRatios?: Record<string, unknown>[];
    cutleryRatios?: Record<string, unknown>[];
  counts?: Record<string, number>;
  /** ISO time of the last buildNexusCatalog write. */
  catalogBuiltAt?: string;
};

export async function fetchCostRates(): Promise<CostRatesPayload> {
  return postAction('CostRatesFetch') as Promise<CostRatesPayload>;
}
