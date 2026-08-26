import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { ArrowLeft, Check, Trash2, X } from 'lucide-react';
import { QuoteDocumentView } from '@/components/QuoteDocumentView';
import { QuoteShareButtons } from '@/components/QuoteShareButtons';
import { NOTES_BLUE } from '@/components/LeadNotesTimeline';
import {
  deleteSavedQuote,
  getSavedQuote,
  getSavedQuoteAsync,
  hydrateSavedQuotesDb,
  setQuoteReviewStatus,
  subscribeSavedQuotes,
  type SavedQuote,
} from '@/lib/savedQuotesStore';
import { openQuoteShareWeb, type ShareChannel } from '@/lib/quoteShare';
import { quoteReviewStatus } from '@/lib/quoteReview';
import { toastError, toastSuccess } from '@/lib/notify';

export function QuoteReview() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const id = params.id || '';
  const [quote, setQuote] = useState<SavedQuote | null>(() => (id ? getSavedQuote(id) : null));
  const [loading, setLoading] = useState(() => !quote);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareHint, setShareHint] = useState('');

  useEffect(() => subscribeSavedQuotes(() => setQuote(id ? getSavedQuote(id) : null)), [id]);

  useEffect(() => {
    let cancelled = false;
    void hydrateSavedQuotesDb()
      .then(() => getSavedQuoteAsync(id))
      .then((row) => {
        if (!cancelled) {
          setQuote(row);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function share(channel: ShareChannel) {
    if (!quote) return;
    try {
      const result = await openQuoteShareWeb(channel, quote);
      if (channel === 'link' || result === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
        setShareHint('Quote page link copied');
      } else if (result === 'opened-copied') {
        setShareHint(
          channel === 'dropbox'
            ? 'Opened Dropbox on the web'
            : 'Opened Google Drive on the web',
        );
      } else if (channel === 'email') {
        setShareHint('Opened Gmail — To is blank');
      } else {
        setShareHint('Opened WhatsApp Web');
      }
      window.setTimeout(() => setShareHint(''), 4000);
    } catch {
      toastError({
        key: 'share-quote',
        title: 'Could not share this quote',
        description: 'Try again, or copy the quote page URL from the address bar.',
      });
    }
  }

  async function review(status: 'approved' | 'disapproved') {
    if (!quote || saving) return;
    setSaving(true);
    try {
      const next = await setQuoteReviewStatus(quote.id, status);
      if (next) setQuote(next);
      toastSuccess({
        key: 'quote-review',
        title: status === 'approved' ? 'Quote approved' : 'Quote disapproved',
        description: 'Saved Quotes now shows this under the matching toggle.',
      });
    } catch {
      toastError({ key: 'quote-review', title: 'Could not save review status' });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!quote || saving) return;
    if (!window.confirm('Delete this saved quote?')) return;
    setSaving(true);
    try {
      await deleteSavedQuote(quote.id, { referenceNumber: quote.referenceNumber });
      toastSuccess({
        key: 'quote-deleted',
        title: 'Quote deleted',
        description: 'Removed from this browser and the workspace.',
      });
      navigate('/saved-quotes');
    } catch (err) {
      toastError({ key: 'quote-delete', title: 'Could not delete this quote', err });
    } finally {
      setSaving(false);
    }
  }

  const status = quoteReviewStatus(quote);

  return (
    <div className="min-h-screen bg-[#F3F4F6]" data-testid="quote-review-page">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-4 py-5 sm:px-6">
        <button
          type="button"
          onClick={() => navigate('/saved-quotes')}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[14px] py-3 text-[13px] font-bold text-white"
          style={{ backgroundColor: NOTES_BLUE }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Saved Quotes
        </button>

        {loading && !quote ? (
          <p className="rounded-[16px] bg-white px-5 py-8 text-[13px] text-slate-500">Loading quote…</p>
        ) : !quote ? (
          <p className="rounded-[16px] bg-white px-5 py-8 text-[13px] text-slate-500" data-testid="quote-review-missing">
            This quote is not in the workspace database.
          </p>
        ) : (
          <>
            <div className="rounded-[20px] bg-white p-5 shadow-sm sm:p-7">
              <QuoteDocumentView quote={quote} />
              <div className="mt-6 flex flex-col gap-2 border-t border-slate-100 pt-5">
                <QuoteShareButtons quote={quote} copied={copied} onShare={(channel) => share(channel)} />
                {shareHint ? <p className="text-[11px] font-medium text-[#2F7CF6]">{shareHint}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => review('approved')}
                data-testid="approve-quote"
                className={`inline-flex items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-bold text-white shadow-sm ${
                  status === 'approved' ? 'ring-2 ring-offset-2 ring-emerald-700' : ''
                }`}
                style={{ backgroundColor: '#15803d' }}
              >
                <Check className="h-5 w-5" />
                Approve Quote
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => review('disapproved')}
                data-testid="disapprove-quote"
                className={`inline-flex items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-bold text-white shadow-sm ${
                  status === 'disapproved' ? 'ring-2 ring-offset-2 ring-rose-700' : ''
                }`}
                style={{ backgroundColor: '#b91c1c' }}
              >
                <X className="h-5 w-5" />
                Disapprove Quote
              </button>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void remove()}
              data-testid="delete-quote"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-rose-200 bg-white py-3.5 text-[15px] font-bold text-[#b91c1c] shadow-sm"
            >
              <Trash2 className="h-5 w-5" />
              Delete quote
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default QuoteReview;
