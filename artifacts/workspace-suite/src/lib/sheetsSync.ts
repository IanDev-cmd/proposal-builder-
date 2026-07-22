/**
 * Thin client for n8n Sheets write-back webhooks.
 * Google Sheets remains the source of truth (Meera Priority 3).
 *
 * Demo → test workbook 1f67f2907cUnHbaXJOb8uf-QfUnPSfv9sQekjvLS8ITs
 * Live → production workbook 1STCEp_UgqH1qoDskFj2rvb8xA9hCdXgntOPPWmCzV6o
 */

import { N8N_BASE } from '@/lib/backendUrls';

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
  const res = await fetch(`${N8N_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, mode }),
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
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
