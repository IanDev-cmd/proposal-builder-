import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { Bookmark, Mail, Link2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LeadNotesTimeline,
  NOTES_BLUE,
  type TimelineCard,
} from '@/components/LeadNotesTimeline';
import {
  deleteSavedQuote,
  listSavedQuotes,
  markPendingGenerate,
  savedQuoteShareUrl,
  subscribeSavedQuotes,
  type SavedQuote,
  getSavedQuote,
} from '@/lib/savedQuotesStore';
import { saveQuoteDraft } from '@/lib/quoteDraftStore';
import { setQuoteLead } from '@/lib/quoteLeadStore';
import { resolveQuoteShareFile, shareArtifact, shareCaption, type ShareChannel } from '@/lib/quoteShare';
import { toastError } from '@/lib/notify';
import type { PointKind } from '@/lib/leadNotes';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.84c0 1.74.46 3.44 1.33 4.94L2 22l5.37-1.4a10 10 0 0 0 4.67 1.18h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.75 14.12c-.24.68-1.4 1.3-1.94 1.34-.5.04-1.12.06-1.8-.11-.42-.1-.95-.3-1.64-.6-2.89-1.25-4.77-4.16-4.92-4.36-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1.01-2.4.26-.28.58-.35.77-.35h.56c.18 0 .42-.07.66.5.24.6.82 2.06.9 2.2.07.15.12.32.02.51-.1.2-.14.32-.28.5-.14.17-.3.38-.42.51-.14.14-.28.3-.12.58.16.28.7 1.16 1.5 1.88 1.04.93 1.9 1.22 2.2 1.36.28.13.45.11.62-.07.16-.17.7-.81.88-1.09.18-.28.37-.23.62-.14.26.1 1.63.77 1.91.91.28.14.46.21.53.32.07.12.07.68-.17 1.36z" />
    </svg>
  );
}

function DropboxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7.04 3.4 2 6.7l5.04 3.3L12 6.7 7.04 3.4zm9.92 0L12 6.7l4.96 3.3L22 6.7l-5.04-3.3zM2 13.3l5.04 3.3L12 13.3 7.04 10 2 13.3zm20 0L16.96 10 12 13.3l4.96 3.3L22 13.3zM7.04 17.7 12 21l4.96-3.3L12 14.4l-4.96 3.3z" />
    </svg>
  );
}

function DriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#0F9D58" d="M4.4 20.4 8.1 14h7.8l-3.7 6.4H4.4z" />
      <path fill="#4285F4" d="m8.1 14 3.9-6.8h7.6L15.9 14H8.1z" />
      <path fill="#F4B400" d="M4.4 20.4 8.1 14 12 7.2 8.3 13.6 4.4 20.4z" />
      <path fill="#DD4B39" d="m12 7.2 3.7 6.8 3.9-6.8H12z" />
    </svg>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function quoteToCard(q: SavedQuote): TimelineCard {
  const kinds: PointKind[] = ['pipeline'];
  if (q.grandTotal) kinds.push('budget');
  if (q.guestCount) kinds.push('guests');
  if (q.vesselType) kinds.push('logistics');
  return {
    id: q.id,
    title: q.title || q.eventType || 'Saved quote',
    summary: [q.leadName, q.vesselType, q.eventType, q.guestCount && `${q.guestCount} guests`]
      .filter(Boolean)
      .join(' · '),
    body: `${q.eventType || 'Event'} aboard ${q.vesselType || 'vessel TBC'} for ${q.guestCount || '—'} guests. Grand total £${q.grandTotal.toFixed(2)}.`,
    kind: 'pipeline',
    kinds,
    when: formatWhen(q.savedAt),
    sourceIndex: null,
  };
}

async function restoreQuote(quote: SavedQuote) {
  if (quote.lead) setQuoteLead(quote.lead);
  await saveQuoteDraft({
    leadKey: quote.leadKey,
    step: quote.step || 7,
    data: quote.data,
    leadName: quote.leadName,
    referenceNumber: quote.referenceNumber,
  });
}

export function SavedQuotes() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const [quotes, setQuotes] = useState<SavedQuote[]>(() => listSavedQuotes());
  const [activeId, setActiveId] = useState<string | null>(params.id || quotes[0]?.id || null);
  const [overlayId, setOverlayId] = useState<string | null>(params.id || null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareHint, setShareHint] = useState('');

  useEffect(() => subscribeSavedQuotes(() => setQuotes(listSavedQuotes())), []);

  useEffect(() => {
    if (params.id) {
      setOverlayId(params.id);
      setActiveId(params.id);
    }
  }, [params.id]);

  const overlay = overlayId ? getSavedQuote(overlayId) : null;
  const cards = useMemo(() => quotes.map(quoteToCard), [quotes]);

  async function generate(quote: SavedQuote) {
    await restoreQuote(quote);
    markPendingGenerate(quote.id);
    navigate('/quote-builder');
  }

  async function share(channel: ShareChannel, quote: SavedQuote) {
    if (sharing) return;
    setSharing(true);
    setShareHint(channel === 'link' ? 'Preparing quote file…' : 'Attaching file…');
    try {
      const { file, kind } = await resolveQuoteShareFile(quote);
      const url = savedQuoteShareUrl(quote.id);
      const first = quote.leadName ? ` ${quote.leadName.split(' ')[0]}` : '';
      const result = await shareArtifact(channel, {
        file,
        title: kind === 'pdf' ? `Proposal: ${quote.title}` : `Quote: ${quote.title}`,
        text: `Hi${first},\n\n${shareCaption(quote, kind)}\n${url}\n\nBest regards`,
        toEmail: quote.lead?.email,
        shareUrl: url,
        kind,
      });
      if (result === 'cancelled') {
        setShareHint('');
        return;
      }
      if (channel === 'link') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
        setOverlayId(quote.id);
        navigate(`/saved-quotes/${quote.id}`);
      }
      const attached = kind === 'pdf' ? 'PDF attached' : 'Quote file attached';
      const extra =
        result === 'email-eml-pdf' || result === 'email-eml-quote'
          ? ' — open the .eml to send with the file attached'
          : result === 'whatsapp-file' || result === 'dropbox-file' || result === 'drive-file'
            ? ' — file downloaded, drop it into the tab that opened'
            : '';
      setShareHint(`${attached}${extra}`);
      window.setTimeout(() => setShareHint(''), 4200);
    } catch {
      toastError({
        key: 'share-quote',
        title: 'Could not attach the quote file',
        description: 'Try again, or generate the proposal PDF first.',
      });
      setShareHint('');
    } finally {
      setSharing(false);
    }
  }

  function shareRow(quote: SavedQuote, onBlue: boolean) {
    const iconCls = onBlue ? 'text-white' : 'text-slate-600';
    const btn = 'flex h-9 w-9 items-center justify-center rounded-[10px] transition-transform hover:scale-105';
    const bg = onBlue ? 'bg-white/15 hover:bg-white/25' : 'bg-white shadow-sm hover:bg-slate-50';
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" title="Email" aria-label="Share via Email" className={`${btn} ${bg}`} onClick={() => share('email', quote)}>
          <Mail className={`h-4 w-4 ${onBlue ? 'text-white' : 'text-[#EA4335]'}`} />
        </button>
        <button type="button" title="WhatsApp" aria-label="Share via WhatsApp" className={`${btn} ${bg}`} onClick={() => share('whatsapp', quote)}>
          <WhatsAppIcon className={`h-4 w-4 ${onBlue ? 'text-white' : 'text-[#25D366]'}`} />
        </button>
        <button
          type="button"
          title="Dropbox"
          aria-label="Save to Dropbox"
          className={`${btn} ${bg}`}
          onClick={() => share('dropbox', quote)}
        >
          <DropboxIcon className={`h-4 w-4 ${onBlue ? 'text-white' : 'text-[#0061FF]'}`} />
        </button>
        <button
          type="button"
          title="Google Drive"
          aria-label="Save to Google Drive"
          className={`${btn} ${bg}`}
          onClick={() => share('drive', quote)}
        >
          <DriveIcon className="h-4 w-4" />
        </button>
        <button type="button" title={copied ? 'Copied' : 'Copy link'} aria-label="Copy link" className={`${btn} ${bg}`} onClick={() => share('link', quote)}>
          <Link2 className={`h-4 w-4 ${iconCls}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-white" data-testid="saved-quotes-page">
      <div className="flex shrink-0 items-center gap-2 px-6 py-4">
        <Bookmark className="h-4 w-4" style={{ color: NOTES_BLUE }} strokeWidth={2} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-slate-800">
          Saved Quotes
        </span>
        {shareHint ? (
          <span className="max-w-[55%] truncate text-[11px] font-medium text-[#2F7CF6]" data-testid="saved-quotes-share-hint">
            {sharing ? 'Attaching…' : shareHint}
          </span>
        ) : null}
      </div>

      <LeadNotesTimeline
        cards={cards}
        activeId={activeId}
        onSelect={(id) => setActiveId((cur) => (cur === id ? null : id))}
        fullscreen
        onToggleFullscreen={() => navigate('/quote-builder')}
        onAdd={() => navigate('/quote-builder')}
        onSummarize={() => setQuotes(listSavedQuotes())}
        emptyLabel="No saved quotes yet — finish a quote and tap Save Quote."
        columns={2}
        onDelete={(card) => {
          if (!window.confirm('Delete this saved quote?')) return;
          deleteSavedQuote(card.id);
          setQuotes(listSavedQuotes());
          if (overlayId === card.id) {
            setOverlayId(null);
            navigate('/saved-quotes');
          }
        }}
        footer={(card, active) => {
          if (!active) return null;
          const quote = quotes.find((q) => q.id === card.id);
          if (!quote) return null;
          return (
            <div className="mt-3 flex flex-col gap-2.5">
              {shareRow(quote, true)}
              <button
                type="button"
                onClick={() => generate(quote)}
                className="w-full rounded-[12px] bg-white py-2.5 text-[12.5px] font-bold text-[#2F7CF6] shadow-sm"
                data-testid={`saved-quote-generate-${quote.id}`}
              >
                Generate Proposal
              </button>
            </div>
          );
        }}
      />

      <AnimatePresence>
        {overlay ? (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-[#0b0f0d]/55 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setOverlayId(null);
              navigate('/saved-quotes');
            }}
            role="dialog"
            aria-modal="true"
            aria-label={overlay.title}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              className="relative w-full max-w-[480px] overflow-hidden rounded-[22px] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between px-6 pt-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Saved quote</p>
                  <h2 className="mt-1 text-[18px] font-bold text-slate-900">{overlay.title}</h2>
                  <p className="mt-1 text-[13px] text-slate-500">
                    {overlay.leadName || 'No lead'} · {overlay.referenceNumber || overlay.leadKey}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    setOverlayId(null);
                    navigate('/saved-quotes');
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 px-6 text-[13px]">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vessel</dt>
                  <dd className="font-semibold text-slate-800">{overlay.vesselType || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Event</dt>
                  <dd className="font-semibold text-slate-800">{overlay.eventType || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Guests</dt>
                  <dd className="font-semibold text-slate-800">{overlay.guestCount || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grand total</dt>
                  <dd className="font-bold text-[#00e676]">£{overlay.grandTotal.toFixed(2)}</dd>
                </div>
              </dl>
              <div className="mt-6 flex flex-col gap-2 px-6">
                {shareRow(overlay, false)}
                {shareHint ? (
                  <p className="text-[11px] font-medium text-[#2F7CF6]">{shareHint}</p>
                ) : null}
              </div>
              <div className="p-6 pt-4">
                <button
                  type="button"
                  onClick={() => generate(overlay)}
                  className="w-full rounded-[14px] py-3 text-[13px] font-bold text-white"
                  style={{ backgroundColor: NOTES_BLUE }}
                >
                  Generate Proposal
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default SavedQuotes;
