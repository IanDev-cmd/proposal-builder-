/**
 * Self-contained HTML snapshot of a saved quote page — the file attached when
 * sharing via Gmail, WhatsApp, Drive, or Dropbox.
 */
import { SECTION_META } from '@/lib/quoteBuilderCatalog';
import { calcFinancials } from '@/lib/quoteFinance';
import { quoteFormFromSaved } from '@/lib/costSheet';
import { displayQuoteKeyItems } from '@/lib/quoteKeyItems';
import { formatGbp, formatGbpPounds } from '@/lib/utils';
import { quoteReviewLabel, quoteReviewStatus } from '@/lib/quoteReview';
import type { SavedQuote } from '@/lib/savedQuotesStore';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function quotePageFileStem(quote: SavedQuote): string {
  return `${quote.referenceNumber || quote.leadKey || quote.id}-quote`
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-');
}

export function quotePageHtml(quote: SavedQuote, shareUrl = ''): string {
  const form = quoteFormFromSaved(quote.data);
  const fin = form ? calcFinancials(form) : null;
  const keyItems = displayQuoteKeyItems((quote.data || {}) as { keyItems?: string; initialEnquiry?: string });
  const status = quoteReviewStatus(quote);
  const sections = fin
    ? SECTION_META.map((sec) => {
        const lines = (fin.lines || []).filter((line) => line.section === sec.id && (line.amount || line.label));
        const total = fin.sectionTotals?.[sec.id] ?? lines.reduce((sum, line) => sum + (line.amount || 0), 0);
        if (!lines.length && !(total > 0)) return '';
        const rows = lines
          .map(
            (line) =>
              `<tr><td>${escapeHtml(line.label)}</td><td class="amt">${escapeHtml(formatGbp(line.amount))}</td></tr>`,
          )
          .join('');
        return `<section><h2>${escapeHtml(sec.title)}</h2><table>${rows}<tr class="total"><td>Section total</td><td class="amt">${escapeHtml(formatGbp(total))}</td></tr></table></section>`;
      }).join('')
    : '<p>Cost lines were not saved with this quote.</p>';

  const totals = fin
    ? `<dl class="totals">
        <div><dt>Total to WEOTT</dt><dd>${escapeHtml(formatGbp(fin.baseCost))}</dd></div>
        <div><dt>Cost to client (exc VAT)</dt><dd>${escapeHtml(formatGbpPounds(fin.costToClient))}</dd></div>
        <div><dt>VAT</dt><dd>${escapeHtml(formatGbpPounds(fin.vat))}</dd></div>
        <div><dt>Grand total</dt><dd>${escapeHtml(formatGbpPounds(fin.grand))}</dd></div>
      </dl>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(quote.title)} — WEOTT Quote</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1d21; margin: 0; background: #f4f5f7; }
  main { max-width: 720px; margin: 24px auto; background: #fff; padding: 32px 36px 48px; box-shadow: 0 8px 30px rgba(15,23,42,.08); }
  .kicker { letter-spacing: .12em; text-transform: uppercase; font-size: 11px; color: #64748b; font-family: system-ui, sans-serif; }
  h1 { font-size: 28px; margin: 8px 0 4px; }
  .meta { color: #475569; font-size: 14px; margin-bottom: 20px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-family: system-ui, sans-serif; font-size: 12px; font-weight: 700; }
  .pending { background: #e2e8f0; color: #334155; }
  .approved { background: #dcfce7; color: #166534; }
  .disapproved { background: #fee2e2; color: #991b1b; }
  dl.facts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; font-family: system-ui, sans-serif; font-size: 13px; }
  dl.facts dt { color: #94a3b8; text-transform: uppercase; letter-spacing: .08em; font-size: 10px; font-weight: 700; }
  dl.facts dd { margin: 2px 0 0; font-weight: 600; }
  .keys { background: #fff1f0; padding: 12px 14px; border-radius: 10px; margin: 20px 0; }
  .keys p { margin: 4px 0 0; }
  h2 { font-size: 15px; font-family: system-ui, sans-serif; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-family: system-ui, sans-serif; font-size: 13px; }
  td { padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
  td.amt { text-align: right; font-weight: 600; white-space: nowrap; }
  tr.total td { font-weight: 700; border-bottom: none; padding-top: 8px; }
  .totals { margin-top: 24px; font-family: system-ui, sans-serif; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid #e2e8f0; }
  .open { margin-top: 28px; font-family: system-ui, sans-serif; }
  a { color: #2F7CF6; }
</style>
</head>
<body>
<main>
  <p class="kicker">WEOTT Nexus quote</p>
  <h1>${escapeHtml(quote.title)}</h1>
  <p class="meta">${escapeHtml(quote.leadName || 'Lead TBC')} · ${escapeHtml(quote.referenceNumber || quote.leadKey)}</p>
  <p><span class="badge ${status}">${escapeHtml(quoteReviewLabel(status))}</span></p>
  <dl class="facts">
    <div><dt>Vessel</dt><dd>${escapeHtml(quote.vesselType || '—')}</dd></div>
    <div><dt>Event</dt><dd>${escapeHtml(quote.eventType || '—')}</dd></div>
    <div><dt>Guests</dt><dd>${escapeHtml(quote.guestCount || '—')}</dd></div>
    <div><dt>Event date</dt><dd>${escapeHtml(quote.eventDate || '—')}</dd></div>
    <div><dt>Grand total</dt><dd>${escapeHtml(formatGbpPounds(quote.grandTotal))}</dd></div>
  </dl>
  ${keyItems ? `<div class="keys"><p class="kicker">Key items</p><p>${escapeHtml(keyItems)}</p></div>` : ''}
  ${sections}
  ${totals}
  ${shareUrl ? `<p class="open">Open the full quote to approve or disapprove:<br/><a href="${escapeHtml(shareUrl)}">${escapeHtml(shareUrl)}</a></p>` : ''}
</main>
</body>
</html>`;
}

export function savedQuotePageFile(quote: SavedQuote, shareUrl = ''): File {
  const html = quotePageHtml(quote, shareUrl);
  return new File([html], `${quotePageFileStem(quote)}.html`, { type: 'text/html' });
}

export function downloadSavedQuotePage(quote: SavedQuote, shareUrl = ''): File {
  const file = savedQuotePageFile(quote, shareUrl);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return file;
}
