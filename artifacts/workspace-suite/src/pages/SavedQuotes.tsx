import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Bookmark, Search, X } from 'lucide-react';
import {
  LeadNotesTimeline,
  NOTES_BLUE,
  type TimelineCard,
} from '@/components/LeadNotesTimeline';
import { QuoteShareButtons } from '@/components/QuoteShareButtons';
import {
  consumePendingGenerate,
  deleteSavedQuote,
  listSavedQuotes,
  markPendingGenerate,
  subscribeSavedQuotes,
  hydrateSavedQuotesDb,
  type SavedQuote,
} from '@/lib/savedQuotesStore';
import { saveQuoteDraft } from '@/lib/quoteDraftStore';
import { setQuoteLead, markQuoteBuilderStartAt } from '@/lib/quoteLeadStore';
import { emitFreshQuoteBuilder } from '@/lib/quoteBuilderSession';
import { openQuoteShareWeb, type ShareChannel } from '@/lib/quoteShare';
import { toastError, toastSuccess } from '@/lib/notify';
import { formatGbpPounds } from '@/lib/utils';
import type { PointKind } from '@/lib/leadNotes';
import { listOpsQuotes, type OpsQuote } from '@/lib/opsStore';
import {
  QUOTE_REVIEW_TABS,
  filterQuotesByReviewTab,
  quoteNeedsApprovalFirst,
  quoteReviewLabel,
  quoteReviewStatus,
  type QuoteReviewStatus,
} from '@/lib/quoteReview';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function opsQuoteToCard(q: OpsQuote): TimelineCard {
  const kinds: PointKind[] = ['pipeline'];
  if (q.grandTotal) kinds.push('budget');
  if (q.guestCount) kinds.push('guests');
  return {
    id: q.id,
    title: q.title || q.status || 'Quote snapshot',
    summary: [q.leadName, q.eventType, q.status, q.guestCount && `${q.guestCount} guests`]
      .filter(Boolean)
      .join(' · '),
    body: `${q.eventType || 'Event'} · ${q.status || 'snapshot'} · grand total ${formatGbpPounds(Number(q.grandTotal) || 0)}.`,
    kind: 'pipeline',
    kinds,
    when: formatWhen(q.updatedAt),
    sourceIndex: null,
  };
}

function quoteToCard(q: SavedQuote): TimelineCard {
  const kinds: PointKind[] = ['pipeline'];
  if (q.grandTotal) kinds.push('budget');
  if (q.guestCount) kinds.push('guests');
  if (q.vesselType) kinds.push('logistics');
  const status = quoteReviewLabel(quoteReviewStatus(q));
  return {
    id: q.id,
    title: q.title || q.eventType || 'Saved quote',
    summary: [status, q.leadName, q.vesselType, q.eventType, q.guestCount && `${q.guestCount} guests`]
      .filter(Boolean)
      .join(' · '),
    body: `${q.eventType || 'Event'} aboard ${q.vesselType || 'vessel TBC'} for ${q.guestCount || '—'} guests. Grand total ${formatGbpPounds(q.grandTotal)}.`,
    kind: 'pipeline',
    kinds,
    when: formatWhen(q.savedAt),
    sourceIndex: null,
  };
}

function wizardStep(step?: number): number {
  return Number(step) >= 1 && Number(step) <= 7 ? Number(step) : 1;
}

async function restoreQuote(quote: SavedQuote, step?: number) {
  if (quote.lead) setQuoteLead(quote.lead);
  await saveQuoteDraft({
    leadKey: quote.leadKey,
    step: step ?? wizardStep(quote.step),
    data: quote.data,
    leadName: quote.leadName,
    referenceNumber: quote.referenceNumber,
  });
}

export function SavedQuotes() {
  const [, navigate] = useLocation();
  const [quotes, setQuotes] = useState<SavedQuote[]>(() => listSavedQuotes());
  const [activeId, setActiveId] = useState<string | null>(quotes[0]?.id || null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareHint, setShareHint] = useState('');
  const [query, setQuery] = useState('');
  const [reviewTab, setReviewTab] = useState<QuoteReviewStatus>('pending');
  const [loading, setLoading] = useState(() => listSavedQuotes().length === 0);
  const [opsQuotes, setOpsQuotes] = useState<OpsQuote[]>([]);

  useEffect(() => subscribeSavedQuotes(() => setQuotes(listSavedQuotes())), []);

  useEffect(() => {
    let cancelled = false;
    void hydrateSavedQuotesDb()
      .then(async () => {
        const snaps = await listOpsQuotes();
        if (!cancelled) {
          setQuotes(listSavedQuotes());
          setOpsQuotes(snaps);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tabCounts = useMemo(
    () => ({
      pending: filterQuotesByReviewTab(quotes, 'pending').length,
      approved: filterQuotesByReviewTab(quotes, 'approved').length,
      disapproved: filterQuotesByReviewTab(quotes, 'disapproved').length,
    }),
    [quotes],
  );

  const filteredQuotes = useMemo(() => {
    const byStatus = filterQuotesByReviewTab(quotes, reviewTab);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((item) =>
      [
        item.title,
        item.leadName,
        item.referenceNumber,
        item.leadKey,
        item.vesselType,
        item.eventType,
        item.guestCount,
        item.eventDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [quotes, query, reviewTab]);
  const cards = useMemo(() => {
    const saved = filteredQuotes.map(quoteToCard);
    if (reviewTab !== 'pending') return saved;
    const q = query.trim().toLowerCase();
    const extra = opsQuotes.filter((snap) => {
      if (quotes.some((item) => item.id === snap.id)) return false;
      if (snap.referenceNumber && quotes.some((item) => item.referenceNumber === snap.referenceNumber)) {
        return false;
      }
      if (!q) return true;
      return [snap.title, snap.leadName, snap.referenceNumber, snap.eventType, snap.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return [...saved, ...extra.map(opsQuoteToCard)];
  }, [filteredQuotes, quotes, opsQuotes, query, reviewTab]);

  async function generate(quote: SavedQuote) {
    if (quoteNeedsApprovalFirst(quote)) {
      toastError({
        key: 'approve-quote-first',
        title: 'Approve Quote First',
        description: 'You can still generate this proposal.',
        duration: 8000,
      });
    }
    await restoreQuote(quote);
    markPendingGenerate(quote.id);
    navigate('/quote-builder');
  }

  async function share(channel: ShareChannel, quote: SavedQuote) {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await openQuoteShareWeb(channel, quote);
      if (channel === 'link' || result === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
        setShareHint('Quote page link copied');
      } else if (result === 'opened-copied') {
        setShareHint(
          channel === 'dropbox' ? 'Opened Dropbox on the web' : 'Opened Google Drive on the web',
        );
      } else if (channel === 'email') {
        setShareHint('Opened Gmail — To is blank');
      } else {
        setShareHint('Opened WhatsApp Web');
      }
      window.setTimeout(() => setShareHint(''), 3500);
    } catch {
      toastError({
        key: 'share-quote',
        title: 'Could not share this quote',
        description: 'Try again, or copy the quote page URL from the address bar.',
      });
      setShareHint('');
    } finally {
      setSharing(false);
    }
  }

  const emptyByTab =
    reviewTab === 'approved'
      ? 'No approved quotes yet.'
      : reviewTab === 'disapproved'
        ? 'No disapproved quotes yet.'
        : 'No quotes waiting for review — finish a quote and tap Save Quote.';

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-white" data-testid="saved-quotes-page">
      <div className="flex shrink-0 items-center gap-2 px-6 py-4">
        <Bookmark className="h-4 w-4" style={{ color: NOTES_BLUE }} strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-slate-800">
          Saved Quotes
        </span>
        {shareHint ? (
          <span className="max-w-[55%] truncate text-[11px] font-medium text-[#2F7CF6]" data-testid="saved-quotes-share-hint">
            {sharing ? 'Opening…' : shareHint}
          </span>
        ) : null}
      </div>
      <div className="shrink-0 px-6 pb-3" role="tablist" aria-label="Quote review filters">
        <div className="flex gap-1 rounded-[12px] bg-[#F3F4F6] p-1">
          {QUOTE_REVIEW_TABS.map((tab) => {
            const active = reviewTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`quotes-tab-${tab.id}`}
                onClick={() => setReviewTab(tab.id)}
                className={`min-w-0 flex-1 rounded-[10px] px-2 py-2 text-[11px] font-bold sm:text-[12px] ${
                  active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
                <span className="ml-1 text-[10px] font-semibold text-slate-400">{tabCounts[tab.id]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="shrink-0 px-6 pb-3">
        <label className="flex items-center gap-2 rounded-[12px] border border-slate-200 bg-[#F3F4F6] px-3 py-2.5 focus-within:border-[#2F7CF6] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2F7CF6]/20">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved quotes by lead, vessel, event, reference…"
            aria-label="Search saved quotes"
            data-testid="saved-quotes-search"
            className="w-full bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      <LeadNotesTimeline
        cards={cards}
        activeId={activeId}
        onSelect={(id) => setActiveId((cur) => (cur === id ? null : id))}
        fullscreen
        onToggleFullscreen={() => {
          const quote = quotes.find((q) => q.id === activeId);
          if (quote) {
            void restoreQuote(quote).then(() => navigate('/quote-builder'));
            return;
          }
          if (opsQuotes.some((q) => q.id === activeId)) return;
          consumePendingGenerate();
          markQuoteBuilderStartAt(1);
          emitFreshQuoteBuilder();
          navigate('/quote-builder');
        }}
        onAdd={() => {
          consumePendingGenerate();
          markQuoteBuilderStartAt(1);
          emitFreshQuoteBuilder();
          navigate('/quote-builder');
        }}
        onSummarize={() => setQuotes(listSavedQuotes())}
        emptyLabel={
          loading
            ? 'Loading saved quotes…'
            : query.trim()
              ? `No saved quotes match “${query.trim()}”.`
              : emptyByTab
        }
        columns={2}
        onDelete={async (card) => {
          if (!window.confirm('Delete this saved quote?')) return;
          const snap = opsQuotes.find((q) => q.id === card.id);
          const quote = quotes.find((q) => q.id === card.id);
          const relatedSnaps = opsQuotes.filter(
            (row) =>
              row.id === card.id ||
              (snap?.quoteId && (row.id === snap.quoteId || row.quoteId === snap.quoteId)) ||
              (quote?.referenceNumber && row.referenceNumber === quote.referenceNumber) ||
              (snap?.referenceNumber && row.referenceNumber === snap.referenceNumber),
          );
          try {
            await deleteSavedQuote(card.id, {
              extraIds: relatedSnaps.flatMap((row) => [row.id, row.quoteId]),
              quoteId: snap?.quoteId,
              referenceNumber: quote?.referenceNumber || snap?.referenceNumber,
            });
            setQuotes(listSavedQuotes());
            setOpsQuotes(await listOpsQuotes());
            setActiveId((cur) => (cur === card.id ? null : cur));
            toastSuccess({
              key: 'quote-deleted',
              title: 'Quote deleted',
              description: snap && !quote ? 'Removed from this browser.' : undefined,
            });
          } catch (err) {
            toastError({
              key: 'quote-delete',
              title: 'Could not delete this quote',
              err,
            });
          }
        }}
        footer={(card, active) => {
          if (!active) return null;
          const quote = quotes.find((q) => q.id === card.id);
          if (quote) {
            return (
              <div className="mt-3 flex flex-col gap-2.5">
                <QuoteShareButtons quote={quote} copied={copied} onShare={share} />
                <button
                  type="button"
                  onClick={() => navigate(`/saved-quotes/${quote.id}`)}
                  className="w-full rounded-[12px] bg-white py-2.5 text-[12.5px] font-bold text-[#2F7CF6] shadow-sm"
                  data-testid={`saved-quote-open-${quote.id}`}
                >
                  Open quote
                </button>
                <button
                  type="button"
                  onClick={() => generate(quote)}
                  className="w-full rounded-[12px] bg-white/15 py-2.5 text-[12.5px] font-bold text-white"
                  data-testid={`saved-quote-generate-${quote.id}`}
                >
                  Generate Proposal
                </button>
              </div>
            );
          }
          const snap = opsQuotes.find((q) => q.id === card.id);
          if (!snap) return null;
          return (
            <p className="mt-3 text-[12px] text-white/80">
              Sheet snapshot{snap.status ? ` · ${snap.status}` : ''}
              {snap.grandTotal != null && snap.grandTotal !== ''
                ? ` · ${formatGbpPounds(Number(snap.grandTotal) || 0)}`
                : ''}
            </p>
          );
        }}
      />
    </div>
  );
}

export default SavedQuotes;
