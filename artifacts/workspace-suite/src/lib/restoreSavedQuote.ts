import { markOpenQuoteDraft, quoteDraftKey, saveQuoteDraft } from '@/lib/quoteDraftStore';
import { markQuoteBuilderStartAt, setQuoteLead } from '@/lib/quoteLeadStore';
import {
  nextFreeQuoteVersion,
  quoteVersionOf,
  retitleQuoteVersion,
  savedQuoteId,
} from '@/lib/quoteBuilderCatalog';
import {
  clearFreshQuoteBuilderFlag,
  emitRemountQuoteBuilder,
} from '@/lib/quoteBuilderSession';
import { consumePendingGenerate, getSavedQuote, persistSavedQuote, type SavedQuote } from '@/lib/savedQuotesStore';

/** Quote Builder Event Core (wizard step 1). */
export const EVENT_CORE_STEP = 1;

/** Quote Builder Cost Lines (Sections 1–13 / upgrades). */
export const COST_LINES_STEP = 4;

function wizardStep(step?: number): number {
  return Number(step) >= 1 && Number(step) <= 7 ? Number(step) : EVENT_CORE_STEP;
}

/** Load a saved quote into Quote Builder (lead + draft). Does not navigate. */
export async function restoreSavedQuote(quote: SavedQuote, step?: number): Promise<void> {
  const openAt = step ?? wizardStep(quote.step);
  clearFreshQuoteBuilderFlag();
  consumePendingGenerate();
  if (quote.lead) setQuoteLead(quote.lead);
  markQuoteBuilderStartAt(openAt);
  const version = String((quote.data as { quoteVersion?: string } | undefined)?.quoteVersion || 'V1');
  markOpenQuoteDraft(quote.leadKey, version);
  await saveQuoteDraft({
    leadKey: quoteDraftKey(quote.leadKey, version),
    step: openAt,
    data: quote.data,
    leadName: quote.leadName,
    referenceNumber: quote.referenceNumber,
  });
  emitRemountQuoteBuilder();
}

function vesselList(quote: SavedQuote, data: Record<string, unknown>): string[] {
  const current = data.vesselType;
  if (Array.isArray(current) && current.some((item) => String(item).trim())) {
    return current.map((item) => String(item));
  }
  if (typeof current === 'string' && current.trim()) return [current.trim()];
  return String(quote.vesselType || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Copy the chosen quote onto the next version and open it at Event Core.
 * The source card is not updated.
 */
export async function startNextQuoteVersion(quote: SavedQuote, existing: SavedQuote[]): Promise<SavedQuote> {
  const current = quoteVersionOf(quote);
  const next = nextFreeQuoteVersion(existing, quote.leadKey, current);
  const data: Record<string, unknown> = quote.data && typeof quote.data === 'object' ? { ...quote.data } : {};
  const vessels = vesselList(quote, data);
  data.vesselType = vessels;
  if (!data.eventType && quote.eventType) data.eventType = quote.eventType;
  if ((data.guestCount == null || data.guestCount === '') && quote.guestCount) data.guestCount = String(quote.guestCount);
  if (!data.eventDate && quote.eventDate) data.eventDate = quote.eventDate;
  data.quoteVersion = next;
  data.costApproved = false;
  const id = savedQuoteId(quote.leadKey, next);
  const input = {
    id,
    leadKey: quote.leadKey,
    leadName: quote.leadName,
    referenceNumber: quote.referenceNumber,
    title: retitleQuoteVersion(quote.title, current, next),
    vesselType: vessels.join(', '),
    eventType: String(data.eventType || quote.eventType || ''),
    guestCount: String(data.guestCount || quote.guestCount || ''),
    eventDate: String(data.eventDate || quote.eventDate || ''),
    grandTotal: quote.grandTotal,
    step: EVENT_CORE_STEP,
    data,
    lead: quote.lead,
    reviewStatus: 'pending' as const,
  };
  let created: SavedQuote;
  try {
    created = await persistSavedQuote(input);
  } catch (err) {
    const local = (err as { localSaved?: boolean }).localSaved ? getSavedQuote(id) : null;
    if (!local) throw err;
    created = local;
  }
  await restoreSavedQuote(created, EVENT_CORE_STEP);
  return created;
}
