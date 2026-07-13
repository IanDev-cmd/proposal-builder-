/**
 * Carries "who this quote is for" from the Lead panel over to the Quote
 * Builder page. Session-scoped (survives the page navigation, clears when
 * the tab closes) so the Quote Builder can tag the lead on-screen and stamp
 * their details onto the webhook payload without threading props through
 * the router.
 */

const STORAGE_KEY = 'nexus.quoteLead';

export type QuoteLead = {
  id: number;
  name: string;
  email: string;
  phone: string;
  designation: string;
  company: string;
  referenceNumber: string;
  initials: string;
  color: string;
};

export function setQuoteLead(lead: QuoteLead): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lead));
  } catch {
    // Ignore storage failures (e.g. private browsing) — the quote can
    // still be built, it just won't be tagged to a lead.
  }
}

export function getQuoteLead(): QuoteLead | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QuoteLead) : null;
  } catch {
    return null;
  }
}

export function clearQuoteLead(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
