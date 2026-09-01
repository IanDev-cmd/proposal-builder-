/**
 * Quote Builder nav should start a blank wizard. Saved Quotes / Leads / Edit
 * restore a specific quote instead of calling these helpers.
 */
import { clearQuoteLead } from '@/lib/quoteLeadStore';
import { clearQuoteDraft } from '@/lib/quoteDraftStore';
import { consumePendingGenerate } from '@/lib/savedQuotesStore';

export const FRESH_QUOTE_BUILDER_EVENT = 'nexus:quote-builder-fresh';
export const BLANK_QUOTE_DRAFT_KEY = 'quote-draft';

const FRESH_FLAG = 'nexus.quoteBuilder.fresh';

export function markFreshQuoteBuilder(): void {
  consumePendingGenerate();
  clearQuoteLead();
  void clearQuoteDraft(BLANK_QUOTE_DRAFT_KEY);
  try {
    sessionStorage.setItem(FRESH_FLAG, '1');
  } catch {
    /* ignore */
  }
}

export function consumeFreshQuoteBuilder(): boolean {
  try {
    const raw = sessionStorage.getItem(FRESH_FLAG);
    sessionStorage.removeItem(FRESH_FLAG);
    return raw === '1';
  } catch {
    return false;
  }
}

export function emitFreshQuoteBuilder(): void {
  markFreshQuoteBuilder();
  try {
    window.dispatchEvent(new Event(FRESH_QUOTE_BUILDER_EVENT));
  } catch {
    /* ignore */
  }
}
