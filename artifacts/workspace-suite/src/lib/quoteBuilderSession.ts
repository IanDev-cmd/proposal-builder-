/**
 * Quote Builder nav should start a blank wizard. Saved Quotes / Leads / Edit
 * restore a specific quote instead of calling these helpers.
 */
import { clearQuoteLead } from '@/lib/quoteLeadStore';
import { clearQuoteDraft } from '@/lib/quoteDraftStore';
import { consumePendingGenerate } from '@/lib/savedQuotesStore';

export const FRESH_QUOTE_BUILDER_EVENT = 'nexus:quote-builder-fresh';
export const REMOUNT_QUOTE_BUILDER_EVENT = 'nexus:quote-builder-remount';
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

/** Drop a pending blank-wizard flag so a restore can load the saved quote. */
export function clearFreshQuoteBuilderFlag(): void {
  try {
    sessionStorage.removeItem(FRESH_FLAG);
  } catch {
    /* ignore */
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

/** Remount Quote Builder without clearing the restored draft. */
export function emitRemountQuoteBuilder(): void {
  try {
    window.dispatchEvent(new Event(REMOUNT_QUOTE_BUILDER_EVENT));
  } catch {
    /* ignore */
  }
}
