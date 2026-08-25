import { displayQuoteKeyItems } from '@/lib/quoteKeyItems';
import { calcFinancials } from '@/lib/quoteFinance';
import { quoteFormFromSaved } from '@/lib/costSheet';
import { CostSectionAccordion } from '@/components/CostSectionAccordion';
import { formatGbp } from '@/lib/utils';
import type { SavedQuote } from '@/lib/savedQuotesStore';
import { quoteReviewLabel, quoteReviewStatus } from '@/lib/quoteReview';

export function QuoteDocumentView({ quote }: { quote: SavedQuote }) {
  const form = quoteFormFromSaved(quote.data);
  const fin = form ? calcFinancials(form) : null;
  const keyItems = displayQuoteKeyItems((quote.data || {}) as { keyItems?: string; initialEnquiry?: string });
  const status = quoteReviewStatus(quote);
  const badgeCls =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'disapproved'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-slate-100 text-slate-700';

  return (
    <div className="flex flex-col gap-5" data-testid="quote-document">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Quote</p>
        <h1 className="mt-1 text-[22px] font-bold text-slate-900">{quote.title}</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {quote.leadName || 'Lead TBC'} · {quote.referenceNumber || quote.leadKey}
        </p>
        <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${badgeCls}`} data-testid="quote-review-badge">
          {quoteReviewLabel(status)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vessel</dt>
          <dd className="font-semibold text-slate-800">{quote.vesselType || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Event</dt>
          <dd className="font-semibold text-slate-800">{quote.eventType || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Guests</dt>
          <dd className="font-semibold text-slate-800">{quote.guestCount || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Event date</dt>
          <dd className="font-semibold text-slate-800">{quote.eventDate || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grand total</dt>
          <dd className="font-bold text-[#00a85a]">{formatGbp(quote.grandTotal)}</dd>
        </div>
      </dl>
      {keyItems ? (
        <div className="rounded-[10px] bg-[#FFF1F0] px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#E22A12]">Key items</p>
          <p className="text-[12.5px] font-semibold text-slate-800">{keyItems}</p>
        </div>
      ) : null}
      {fin ? (
        <>
          <CostSectionAccordion
            lines={fin.lines || []}
            sectionTotals={fin.sectionTotals}
            defaultOpen={['vessel', 'catering', 'entertainment', 'beverages', 'staff', 'financial', 'contingency']}
          />
          <dl className="rounded-[12px] border border-slate-200 px-4 py-3 text-[13px]">
            <div className="flex justify-between py-1">
              <dt className="text-slate-500">Total to WEOTT</dt>
              <dd className="font-semibold">{formatGbp(fin.baseCost)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-slate-500">Cost to client (exc VAT)</dt>
              <dd className="font-semibold">{formatGbp(fin.costToClient)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-slate-500">VAT</dt>
              <dd className="font-semibold">{formatGbp(fin.vat)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="font-bold text-slate-800">Grand total</dt>
              <dd className="font-bold text-[#00a85a]">{formatGbp(fin.grand)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-[12px] text-slate-400">Cost lines were not saved with this quote.</p>
      )}
    </div>
  );
}
