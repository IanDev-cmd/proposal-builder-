// Lightweight localStorage-backed store bridging the Forms wizard (writer) and
// the Proposal Doc page (reader) — no backend required.

export type GeneratedProposal = {
  id: string;
  createdAt: string;
  eventDate: string; // ISO yyyy-mm-dd — the event date entered in the wizard
  title: string;
  vesselType: string;
  eventType: string;
  guestCount: string;
  grandTotal: number;
  pdfDataUrl: string; // data:application/pdf;base64,...
};

const PROPOSALS_KEY = 'nexus_generated_proposals';
const PROPOSALS_EVENT = 'nexus:proposals-updated';

export function loadProposals(): GeneratedProposal[] {
  try {
    const raw = localStorage.getItem(PROPOSALS_KEY);
    return raw ? (JSON.parse(raw) as GeneratedProposal[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persists a newly generated proposal. Each PDF is stored as a base64 data URL,
 * which is large (a real multi-page proposal can be several MB) — localStorage
 * has a ~5-10MB per-origin quota, so this can fill up after a handful of
 * generations. Rather than silently dropping the write (which made new
 * proposals vanish, leaving only the static demo doc with no explanation),
 * this drops the oldest stored proposals one at a time and retries, and
 * reports back whether the proposal actually got saved.
 */
export function addProposal(proposal: GeneratedProposal): boolean {
  const existing = loadProposals();
  let toKeep = existing;

  for (let attempt = 0; attempt <= existing.length; attempt++) {
    try {
      localStorage.setItem(PROPOSALS_KEY, JSON.stringify([proposal, ...toKeep]));
      window.dispatchEvent(new Event(PROPOSALS_EVENT));
      return true;
    } catch {
      if (toKeep.length === 0) break; // nothing left to drop — genuinely out of room
      toKeep = toKeep.slice(0, -1); // drop the oldest proposal and retry
    }
  }

  // Could not fit even with all older proposals dropped — surface the failure
  // instead of pretending it succeeded.
  return false;
}

export function subscribeProposals(cb: () => void): () => void {
  window.addEventListener(PROPOSALS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(PROPOSALS_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
