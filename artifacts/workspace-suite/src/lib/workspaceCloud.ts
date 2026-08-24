import { PROPOSAL_ENGINE_URL } from '@/lib/backendUrls';
import type { GeneratedProposal } from '@/lib/proposalStore';
import type { SavedQuote } from '@/lib/savedQuotesStore';

const BASE = `${PROPOSAL_ENGINE_URL}/workspace`;

async function cloudFetch(path: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 45_000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      signal: init?.signal || ctrl.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function cloudListQuotes(): Promise<SavedQuote[]> {
  const res = await cloudFetch('/quotes');
  if (!res.ok) throw new Error(`Workspace quotes failed (${res.status})`);
  const body = (await readJson(res)) as { quotes?: SavedQuote[] } | null;
  return Array.isArray(body?.quotes) ? body.quotes.filter((q) => q && q.id) : [];
}

export async function cloudPutQuote(quote: SavedQuote): Promise<void> {
  const res = await cloudFetch(`/quotes/${encodeURIComponent(quote.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quote),
  });
  if (!res.ok) throw new Error(`Could not save quote to workspace (${res.status})`);
}

export async function cloudDeleteQuote(id: string): Promise<void> {
  await cloudFetch(`/quotes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function cloudListProposals(): Promise<GeneratedProposal[]> {
  const res = await cloudFetch('/proposals');
  if (!res.ok) throw new Error(`Workspace proposals failed (${res.status})`);
  const body = (await readJson(res)) as { proposals?: GeneratedProposal[] } | null;
  return Array.isArray(body?.proposals) ? body.proposals.filter((p) => p && p.id) : [];
}

export async function cloudGetProposal(id: string): Promise<GeneratedProposal | null> {
  const res = await cloudFetch(`/proposals/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Workspace proposal failed (${res.status})`);
  const body = (await readJson(res)) as GeneratedProposal | null;
  return body?.id ? body : null;
}

export async function cloudPutProposal(proposal: GeneratedProposal): Promise<void> {
  const res = await cloudFetch(`/proposals/${encodeURIComponent(proposal.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proposal),
  });
  if (!res.ok) throw new Error(`Could not save proposal to workspace (${res.status})`);
}

export async function cloudDeleteProposal(id: string): Promise<void> {
  await cloudFetch(`/proposals/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
