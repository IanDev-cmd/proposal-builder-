/**
 * Quote review status for Saved Quotes and the shared quote page.
 * `pending` = neither approved nor disapproved (the “All Quotes” queue).
 */
import type { SavedQuote } from '@/lib/savedQuotesStore';

export const QUOTE_REVIEW_STATUSES = ['pending', 'approved', 'disapproved'] as const;
export type QuoteReviewStatus = (typeof QUOTE_REVIEW_STATUSES)[number];

export const QUOTE_REVIEW_TABS = [
  { id: 'pending' as const, label: 'All Quotes' },
  { id: 'approved' as const, label: 'Approved Quotes' },
  { id: 'disapproved' as const, label: 'Disapproved Quotes' },
];

export function quoteReviewStatus(
  quote?: Pick<SavedQuote, 'reviewStatus'> | QuoteReviewStatus | null,
): QuoteReviewStatus {
  const raw = typeof quote === 'string' ? quote : quote?.reviewStatus;
  const status = String(raw || '').trim().toLowerCase();
  if (status === 'approved' || status === 'disapproved') return status;
  return 'pending';
}

/** True when Generate Proposal should warn but still continue. */
export function quoteNeedsApprovalFirst(
  quote?: Pick<SavedQuote, 'reviewStatus'> | QuoteReviewStatus | null,
): boolean {
  return Boolean(quote) && quoteReviewStatus(quote) !== 'approved';
}

export function quoteReviewLabel(status: QuoteReviewStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'disapproved') return 'Disapproved';
  return 'Pending';
}

export function filterQuotesByReviewTab(quotes: SavedQuote[], tab: QuoteReviewStatus): SavedQuote[] {
  return quotes.filter((quote) => quoteReviewStatus(quote) === tab);
}

export function pickReviewFields(
  a: Pick<SavedQuote, 'reviewStatus' | 'reviewedAt'>,
  b: Pick<SavedQuote, 'reviewStatus' | 'reviewedAt'>,
): { reviewStatus: QuoteReviewStatus; reviewedAt?: string } {
  const aAt = a.reviewedAt || '';
  const bAt = b.reviewedAt || '';
  if (aAt && bAt) {
    const src = aAt >= bAt ? a : b;
    return { reviewStatus: quoteReviewStatus(src), reviewedAt: src.reviewedAt };
  }
  if (aAt) return { reviewStatus: quoteReviewStatus(a), reviewedAt: a.reviewedAt };
  if (bAt) return { reviewStatus: quoteReviewStatus(b), reviewedAt: b.reviewedAt };
  const aStatus = quoteReviewStatus(a);
  const bStatus = quoteReviewStatus(b);
  if (aStatus !== 'pending') return { reviewStatus: aStatus, reviewedAt: a.reviewedAt };
  if (bStatus !== 'pending') return { reviewStatus: bStatus, reviewedAt: b.reviewedAt };
  return { reviewStatus: 'pending', reviewedAt: a.reviewedAt || b.reviewedAt };
}
