/**
 * Two share paths:
 *  - Saved Quotes: `openQuoteShareWeb` opens Gmail / WhatsApp / Drive / Dropbox
 *    with the quote PAGE attached (HTML snapshot). Recipient To is left blank.
 *  - Proposal Doc PDFs: `shareArtifact` still uses the OS share sheet, .eml, or download + app.
 */
import { savedQuoteShareUrl, type SavedQuote } from '@/lib/savedQuotesStore';
import { downloadSavedQuotePage, savedQuotePageFile } from '@/lib/quotePageHtml';
import { formatGbp } from '@/lib/utils';

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
  const who = quote.leadName ? ` for ${quote.leadName}` : '';
  if (kind === 'pdf') {
    return `Please find attached the proposal PDF${who}: ${quote.title}.`;
  }
  return `Please find the attached quote page${who}: ${quote.title}.`;
}

/** Plain-text quote for Gmail / WhatsApp compose — never addresses a lead or contact. */
export function quoteSharePlainText(quote: SavedQuote, shareUrl: string): string {
  return [
    'Hi,',
    '',
    shareCaption(quote, 'quote'),
    '',
    `Quote: ${quote.title}`,
    `Reference: ${quote.referenceNumber || quote.leadKey}`,
    `Vessel: ${quote.vesselType || '—'}`,
    `Event: ${quote.eventType || '—'}`,
    `Guests: ${quote.guestCount || '—'}`,
    `Event date: ${quote.eventDate || '—'}`,
    `Grand total: ${formatGbp(quote.grandTotal)}`,
    '',
    `Open the full quote: ${shareUrl}`,
    '',
    'Best regards',
  ].join('\n');
}

function clipShareText(text: string, shareUrl: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - shareUrl.length - 8)).trim()}\n\n${shareUrl}`;
}

/** Web compose / app URLs. Never pre-fill a recipient To address. */
export function quoteShareWebUrl(
  channel: Exclude<ShareChannel, 'link'>,
  opts: { title: string; text: string; shareUrl: string },
): string {
  const { title, text, shareUrl } = opts;
  if (channel === 'email') {
    const body = clipShareText(text, shareUrl, 1600);
    const parts = ['view=cm', 'fs=1', 'tf=1', `su=${encodeURIComponent(title)}`, `body=${encodeURIComponent(body)}`];
    return `https://mail.google.com/mail/?${parts.join('&')}`;
  }
  if (channel === 'whatsapp') {
    return `https://web.whatsapp.com/send?text=${encodeURIComponent(clipShareText(text, shareUrl, 1800))}`;
  }
  if (channel === 'dropbox') return 'https://www.dropbox.com/home';
  return 'https://drive.google.com/drive/my-drive';
}

export type QuoteShareWebResult = 'copied' | 'opened' | 'opened-copied' | 'overlay';

/**
 * Saved Quotes share: attach the quote page file and open the web app.
 * Gmail To is left blank — never the lead or contact email.
 */
export async function openQuoteShareWeb(channel: ShareChannel, quote: SavedQuote): Promise<QuoteShareWebResult> {
  const shareUrl = savedQuoteShareUrl(quote.id);
  const title = `Quote: ${quote.title}`;
  const text = quoteSharePlainText(quote, shareUrl);

  if (channel === 'link') {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* still return copied so the caller can show the URL */
    }
    return 'copied';
  }

  const file = savedQuotePageFile(quote, shareUrl);
  const native = await shareNative(file, title, `${text}\n${shareUrl}`);
  if (native === 'shared' || native === 'aborted') {
    return native === 'aborted' ? 'copied' : 'opened';
  }

  downloadSavedQuotePage(quote, shareUrl);

  if (channel === 'dropbox' || channel === 'drive') {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* still open the app */
    }
  }

  window.open(quoteShareWebUrl(channel, { title, text, shareUrl }), '_blank', 'noopener,noreferrer');
  return channel === 'dropbox' || channel === 'drive' ? 'opened-copied' : 'opened';
}
