import { PROPOSAL_ENGINE_URL } from '@/lib/backendUrls';
import { fetchWithTimeout } from '@/lib/http';
import { engineAuthHeaders, notifyTeamAuthExpired } from '@/lib/teamSession';
import type { GeneratedProposal } from '@/lib/proposalStore';
import type { SavedQuote } from '@/lib/savedQuotesStore';

const BASE = `${PROPOSAL_ENGINE_URL}/workspace`;

async function cloudFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    ...init,
    headers: engineAuthHeaders(init?.headers),
    timeoutMs: 45_000,
  });
  if (res.status === 401) notifyTeamAuthExpired();
  return res;
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
  const res = await cloudFetch(`/quotes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Could not delete workspace quote (${res.status})`);
}

export async function cloudClearQuotes(): Promise<number> {
  const res = await cloudFetch('/quotes', { method: 'DELETE' });
  if (res.ok) {
    const body = (await readJson(res)) as { deleted?: number } | null;
    return Number(body?.deleted) || 0;
  }
  const listed = await cloudListQuotes();
  await Promise.all(listed.map((q) => cloudDeleteQuote(q.id)));
  return listed.length;
}

export async function cloudGetQuote(id: string): Promise<SavedQuote | null> {
  const res = await cloudFetch(`/quotes/${encodeURIComponent(id)}`);
  if (res.ok) {
    const body = (await readJson(res)) as SavedQuote | { quote?: SavedQuote } | null;
    const row = body && 'id' in body && body.id ? (body as SavedQuote) : (body as { quote?: SavedQuote } | null)?.quote;
    if (row?.id) return row;
  }
  if (res.status !== 404 && !res.ok) throw new Error(`Workspace quote failed (${res.status})`);
  const listed = await cloudListQuotes();
  return listed.find((q) => q.id === id) || null;
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
  const res = await cloudFetch(`/proposals/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Could not delete workspace proposal (${res.status})`);
}

export async function cloudClearProposals(): Promise<number> {
  const res = await cloudFetch('/proposals', { method: 'DELETE' });
  if (res.ok) {
    const body = (await readJson(res)) as { deleted?: number } | null;
    return Number(body?.deleted) || 0;
  }
  const listed = await cloudListProposals();
  await Promise.all(listed.map((p) => cloudDeleteProposal(p.id)));
  return listed.length;
}

export type CloudRatesCatalog = {
  id?: string;
  savedAt?: string;
  catalogBuiltAt?: string;
  payload?: Record<string, unknown>;
};

export async function cloudGetCatalog(): Promise<CloudRatesCatalog | null> {
  const res = await cloudFetch('/catalog');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Workspace catalog failed (${res.status})`);
  const body = (await readJson(res)) as CloudRatesCatalog | null;
  return body && typeof body === 'object' ? body : null;
}

export async function cloudPutCatalog(row: CloudRatesCatalog): Promise<void> {
  const res = await cloudFetch('/catalog', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Could not save catalog to workspace (${res.status})`);
}
