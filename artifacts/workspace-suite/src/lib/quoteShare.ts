/**
 * Two share paths:
 *  - Saved Quotes: `openQuoteShareWeb` opens Gmail / WhatsApp / Drive / Dropbox in the browser
 *    with the quote (never a proposal PDF). Copy link opens the overlay page.
 *  - Proposal Doc PDFs: `shareArtifact` still uses the OS share sheet, .eml, or download + app.
 */
import { proposalFileStem, sanitizeFilenamePart } from '@/lib/proposalFilename';
import { savedQuoteShareUrl, type SavedQuote } from '@/lib/savedQuotesStore';

export type ShareChannel = 'email' | 'whatsapp' | 'dropbox' | 'drive' | 'link';

export type ShareArtifact = {
  file: File;
  title: string;
  text: string;
  toEmail?: string;
  shareUrl?: string;
  kind: 'pdf' | 'quote';
};

function bytesFromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const out = new ArrayBuffer(binary.length);
  const view = new Uint8Array(out);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return out;
}

export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/i.exec(header)?.[1] || 'application/octet-stream';
  try {
    return new File([bytesFromBase64(b64)], filename, { type: mime });
  } catch {
    return null;
  }
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function wrap76(raw: string): string {
  return raw.replace(/(.{76})/g, '$1\r\n').trim();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadFile(file: File) {
  downloadBlob(file, file.name);
}

function quoteStem(quote: SavedQuote): string {
  return proposalFileStem({
    contactName: quote.leadName || quote.lead?.name,
    companyName: quote.lead?.company,
    referenceCode: quote.referenceNumber || quote.leadKey,
  });
}

function quoteHtml(quote: SavedQuote, shareUrl: string): string {
  const rows: [string, string][] = [
    ['Lead', quote.leadName || '—'],
    ['Reference', quote.referenceNumber || quote.leadKey],
    ['Vessel', quote.vesselType || '—'],
    ['Event', quote.eventType || '—'],
    ['Guests', quote.guestCount || '—'],
    ['Event date', quote.eventDate || '—'],
    ['Grand total', `£${Number(quote.grandTotal || 0).toFixed(2)}`],
    ['Saved', quote.savedAt ? new Date(quote.savedAt).toLocaleString('en-GB') : '—'],
    ['Open in Nexus', shareUrl],
  ];
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:8px 12px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.06em">${k}</th><td style="padding:8px 12px;font-weight:600;color:#0f172a">${String(v).replace(/</g, '&lt;')}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${quote.title}</title></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:32px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 8px 30px rgba(15,23,42,.08)">
    <p style="margin:0 0 6px;color:#2F7CF6;font-size:11px;font-weight:700;letter-spacing:.12em">WEOTT QUOTE</p>
    <h1 style="margin:0 0 18px;font-size:22px">${quote.title.replace(/</g, '&lt;')}</h1>
    <table style="width:100%;border-collapse:collapse">${body}</table>
  </div>
</body></html>`;
}

export async function resolveQuoteShareFile(quote: SavedQuote): Promise<{ file: File; kind: 'pdf' | 'quote' }> {
  const stem = sanitizeFilenamePart(quoteStem(quote)) || 'WEOTT-Quote';
  const html = quoteHtml(quote, savedQuoteShareUrl(quote.id));
  return {
    file: new File([html], `${stem}.html`, { type: 'text/html' }),
    kind: 'quote',
  };
}

function buildEml(opts: {
  to?: string;
  subject: string;
  body: string;
  file: File;
  bytes: ArrayBuffer;
}): string {
  const boundary = `----=_Weott_${Date.now()}`;
  const subject = `=?UTF-8?B?${utf8ToBase64(opts.subject)}?=`;
  const filename = opts.file.name.replace(/"/g, '');
  const bytes = new Uint8Array(opts.bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = wrap76(btoa(binary));
  const mime = opts.file.type || 'application/octet-stream';
  return [
    `MIME-Version: 1.0`,
    `To: ${opts.to || ''}`,
    `Subject: ${subject}`,
    `X-Unsent: 1`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    opts.body,
    `--${boundary}`,
    `Content-Type: ${mime}; name="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${filename}"`,
    ``,
    b64,
    `--${boundary}--`,
    ``,
  ].join('\r\n');
}

async function shareNative(file: File, title: string, text: string): Promise<'shared' | 'aborted' | 'unavailable'> {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (!nav.share) return 'unavailable';
  const data: ShareData = { files: [file], title, text };
  try {
    if (nav.canShare && !nav.canShare(data)) return 'unavailable';
    await nav.share(data);
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted';
    return 'unavailable';
  }
}

export async function shareArtifact(channel: ShareChannel, artifact: ShareArtifact): Promise<string> {
  const { file, title, text, toEmail, shareUrl } = artifact;
  if (channel !== 'link') {
    const native = await shareNative(file, title, text);
    if (native === 'shared' || native === 'aborted') {
      return native === 'aborted' ? 'cancelled' : 'shared';
    }
  }

  if (channel === 'email') {
    const bytes = await file.arrayBuffer();
    const eml = buildEml({
      to: toEmail,
      subject: title,
      body: text,
      file,
      bytes,
    });
    downloadBlob(new Blob([eml], { type: 'message/rfc822' }), `${file.name.replace(/\.[^.]+$/, '')}.eml`);
    return artifact.kind === 'pdf' ? 'email-eml-pdf' : 'email-eml-quote';
  }

  if (channel === 'whatsapp') {
    downloadFile(file);
    const wa = `https://wa.me/?text=${encodeURIComponent(`${text}${shareUrl ? `\n${shareUrl}` : ''}`)}`;
    window.open(wa, '_blank', 'noopener,noreferrer');
    return 'whatsapp-file';
  }

  if (channel === 'dropbox') {
    downloadFile(file);
    window.open('https://www.dropbox.com/home', '_blank', 'noopener,noreferrer');
    return 'dropbox-file';
  }

  if (channel === 'drive') {
    downloadFile(file);
    window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener,noreferrer');
    return 'drive-file';
  }

  if (channel === 'link' && shareUrl) {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* ignore */
    }
    downloadFile(file);
    return 'link-file';
  }

  downloadFile(file);
  return 'downloaded';
}

export function shareCaption(quote: SavedQuote, kind: 'pdf' | 'quote'): string {
  const who = quote.leadName ? ` for ${quote.leadName.split(' ')[0]}` : '';
  if (kind === 'pdf') {
    return `Please find attached the proposal PDF${who}: ${quote.title}.`;
  }
  return `Please find the saved quote${who}: ${quote.title}.`;
}

/** Plain-text quote for Gmail / WhatsApp compose — never a proposal PDF. */
export function quoteSharePlainText(quote: SavedQuote, shareUrl: string): string {
  const first = quote.leadName ? ` ${quote.leadName.split(' ')[0]}` : '';
  return [
    `Hi${first},`,
    '',
    shareCaption(quote, 'quote'),
    '',
    `Lead: ${quote.leadName || '—'}`,
    `Reference: ${quote.referenceNumber || quote.leadKey}`,
    `Vessel: ${quote.vesselType || '—'}`,
    `Event: ${quote.eventType || '—'}`,
    `Guests: ${quote.guestCount || '—'}`,
    `Event date: ${quote.eventDate || '—'}`,
    `Grand total: £${Number(quote.grandTotal || 0).toFixed(2)}`,
    '',
    `Open quote: ${shareUrl}`,
    '',
    'Best regards',
  ].join('\n');
}

function clipShareText(text: string, shareUrl: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - shareUrl.length - 8)).trim()}\n\n${shareUrl}`;
}

/** Web compose / app URLs. Gmail and WhatsApp cannot MIME-attach files via URL. */
export function quoteShareWebUrl(
  channel: Exclude<ShareChannel, 'link'>,
  opts: { title: string; text: string; toEmail?: string; shareUrl: string },
): string {
  const { title, text, toEmail, shareUrl } = opts;
  if (channel === 'email') {
    const body = clipShareText(text, shareUrl, 1600);
    const parts = ['view=cm', 'fs=1', 'tf=1', `su=${encodeURIComponent(title)}`, `body=${encodeURIComponent(body)}`];
    const email = (toEmail || '').trim();
    if (email && email !== '—') parts.push(`to=${encodeURIComponent(email)}`);
    return `https://mail.google.com/mail/?${parts.join('&')}`;
  }
  if (channel === 'whatsapp') {
    return `https://web.whatsapp.com/send?text=${encodeURIComponent(clipShareText(text, shareUrl, 1800))}`;
  }
  if (channel === 'dropbox') return 'https://www.dropbox.com/home';
  return 'https://drive.google.com/drive/my-drive';
}

export type QuoteShareWebResult = 'overlay' | 'opened' | 'opened-copied';

/**
 * Saved Quotes share: open the web app with this quote (not a proposal PDF).
 * Copy link opens the overlay URL only — no file download.
 */
export async function openQuoteShareWeb(channel: ShareChannel, quote: SavedQuote): Promise<QuoteShareWebResult> {
  const shareUrl = savedQuoteShareUrl(quote.id);
  const title = `Quote: ${quote.title}`;
  const text = quoteSharePlainText(quote, shareUrl);

  if (channel === 'link') {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* overlay still opens */
    }
    return 'overlay';
  }

  if (channel === 'dropbox' || channel === 'drive') {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* still open the app */
    }
  }

  window.open(quoteShareWebUrl(channel, { title, text, toEmail: quote.lead?.email, shareUrl }), '_blank', 'noopener,noreferrer');
  return channel === 'dropbox' || channel === 'drive' ? 'opened-copied' : 'opened';
}
