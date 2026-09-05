import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Pencil, Trash2, X } from 'lucide-react';
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
import { EVENT_CORE_STEP, restoreSavedQuote } from '@/lib/restoreSavedQuote';
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
  const [disapproveOpen, setDisapproveOpen] = useState(false);

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

  useEffect(() => {
    if (!disapproveOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDisapproveOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disapproveOpen]);

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

  async function openQuoteForEdit() {
    if (!quote || saving) return;
    setSaving(true);
    try {
      await restoreSavedQuote(quote, EVENT_CORE_STEP);
      navigate('/quote-builder');
    } catch (err) {
      toastError({ key: 'quote-edit', title: 'Could not open this quote for editing', err });
      setSaving(false);
    }
  }

  async function review(status: 'approved' | 'disapproved') {
    if (!quote || saving) return;
    setSaving(true);
    try {
      const next = await setQuoteReviewStatus(quote.id, status);
      if (next) setQuote(next);
      if (status === 'disapproved') {
        setDisapproveOpen(true);
        toastSuccess({
          key: 'quote-review',
          title: 'Quote disapproved',
          description: 'Use Edit Quote to open Event Core and amend this quote.',
        });
        return;
      }
      toastSuccess({
        key: 'quote-review',
        title: 'Quote approved',
        description: 'Saved Quotes now shows this under the matching toggle.',
      });
    } catch (err) {
      if ((err as { localSaved?: boolean }).localSaved) {
        setQuote(getSavedQuote(quote.id) || quote);
        toastSuccess({
          key: 'quote-review',
          title: status === 'approved' ? 'Quote approved on this device' : 'Quote disapproved on this device',
          description: 'Could not reach the shared workspace. Sync will retry automatically.',
        });
        if (status === 'disapproved') setDisapproveOpen(true);
        return;
      }
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

            {status === 'disapproved' ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void openQuoteForEdit()}
                data-testid="edit-quote-page"
                className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-bold text-white shadow-sm"
                style={{ backgroundColor: NOTES_BLUE }}
              >
                <Pencil className="h-5 w-5" />
                Edit Quote
              </button>
            ) : null}

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

      <AnimatePresence>
        {disapproveOpen && quote ? (
          <motion.div
            key="disapprove-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0b0f0d]/55 p-4 backdrop-blur-sm"
            onClick={() => setDisapproveOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disapprove-overlay-title"
            data-testid="disapprove-edit-overlay"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-[440px] rounded-[20px] bg-white p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setDisapproveOpen(false)}
                className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#b91c1c]">Disapproved</p>
              <h3 id="disapprove-overlay-title" className="mt-1 text-[18px] font-bold text-slate-900">
                Amend this quote
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                {quote.title || quote.leadName || 'This quote'} is marked disapproved. Edit Quote opens Event
                Core for that quote so you can amend it from the start of the wizard.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void openQuoteForEdit()}
                data-testid="edit-quote"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[15px] font-bold text-white shadow-sm"
                style={{ backgroundColor: NOTES_BLUE }}
              >
                <Pencil className="h-4 w-4" />
                Edit Quote
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default QuoteReview;
