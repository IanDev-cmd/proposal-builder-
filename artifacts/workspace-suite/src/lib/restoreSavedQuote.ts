import { saveQuoteDraft } from '@/lib/quoteDraftStore';
import { markQuoteBuilderStartAt, setQuoteLead } from '@/lib/quoteLeadStore';
import {
  clearFreshQuoteBuilderFlag,
  emitRemountQuoteBuilder,
} from '@/lib/quoteBuilderSession';
import { consumePendingGenerate, type SavedQuote } from '@/lib/savedQuotesStore';

/** Quote Builder Cost Lines (Sections 1–13 / upgrades). */
export const COST_LINES_STEP = 4;

function wizardStep(step?: number): number {
  return Number(step) >= 1 && Number(step) <= 7 ? Number(step) : COST_LINES_STEP;
}

/** Load a saved quote into Quote Builder (lead + draft). Does not navigate. */
export async function restoreSavedQuote(quote: SavedQuote, step?: number): Promise<void> {
  const openAt = step ?? wizardStep(quote.step);
  clearFreshQuoteBuilderFlag();
  consumePendingGenerate();
  if (quote.lead) setQuoteLead(quote.lead);
  markQuoteBuilderStartAt(openAt);
  await saveQuoteDraft({
    leadKey: quote.leadKey,
    step: openAt,
    data: quote.data,
    leadName: quote.leadName,
    referenceNumber: quote.referenceNumber,
  });
  emitRemountQuoteBuilder();
}
