// Lightweight localStorage-backed store bridging the Forms wizard (writer) and
// the Proposal Doc + Calendar pages (readers) — no backend required.

export type GeneratedProposal = {
  id: string;
  createdAt: string;
  eventDate: string; // ISO yyyy-mm-dd — used to place this event on the Calendar
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

export function addProposal(proposal: GeneratedProposal) {
  const existing = loadProposals();
  try {
    localStorage.setItem(PROPOSALS_KEY, JSON.stringify([proposal, ...existing]));
  } catch {
    // storage unavailable (e.g. quota exceeded by a large PDF) — fail silently
  }
  window.dispatchEvent(new Event(PROPOSALS_EVENT));
}

export function subscribeProposals(cb: () => void): () => void {
  window.addEventListener(PROPOSALS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(PROPOSALS_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
