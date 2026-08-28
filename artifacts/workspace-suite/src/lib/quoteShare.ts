/**
 * Share always opens web apps (Gmail, WhatsApp Web, Drive, Dropbox) — never
 * the OS share sheet, .eml / Outlook, wa.me, or desktop clients.
 */
import { savedQuoteShareUrl, type SavedQuote } from '@/lib/savedQuotesStore';
import { savedQuotePageFile } from '@/lib/quotePageHtml';
import { formatGbpPounds } from '@/lib/utils';

export type ShareChannel = 'email' | 'whatsapp' | 'dropbox' | 'drive' | 'link';

export type ShareArtifact = {
  file: File;
  title: string;
  text: string;
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
    `Grand total: ${formatGbpPounds(quote.grandTotal)}`,
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

/** Web compose / web app URLs only. Never pre-fill a recipient To address. */
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

export type QuoteShareWebResult = 'copied' | 'opened' | 'opened-copied';

async function copyText(value: string): Promise<void> {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* caller still opens the web app */
  }
}

function openWebTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function openWebShareChannel(
  channel: ShareChannel,
  opts: { title: string; text: string; shareUrl?: string; file?: File | null },
): Promise<QuoteShareWebResult> {
  const shareUrl = opts.shareUrl || '';
  if (channel === 'link') {
    await copyText(shareUrl);
    return 'copied';
  }
  if (opts.file) downloadFile(opts.file);
  if (channel === 'dropbox' || channel === 'drive') await copyText(shareUrl);
  openWebTab(quoteShareWebUrl(channel, { title: opts.title, text: opts.text, shareUrl }));
  return channel === 'dropbox' || channel === 'drive' ? 'opened-copied' : 'opened';
}

export async function shareArtifact(channel: ShareChannel, artifact: ShareArtifact): Promise<QuoteShareWebResult> {
  return openWebShareChannel(channel, {
    title: artifact.title,
    text: artifact.text,
    shareUrl: artifact.shareUrl,
    file: artifact.file,
  });
}

/**
 * Saved Quotes share: attach the quote page file and open the web app.
 * Gmail To is left blank — never the lead or contact email.
 */
export async function openQuoteShareWeb(channel: ShareChannel, quote: SavedQuote): Promise<QuoteShareWebResult> {
  const shareUrl = savedQuoteShareUrl(quote.id);
  const title = `Quote: ${quote.title}`;
  const text = quoteSharePlainText(quote, shareUrl);
  if (channel === 'link') {
    return openWebShareChannel(channel, { title, text, shareUrl });
  }
  const file = savedQuotePageFile(quote, shareUrl);
  return openWebShareChannel(channel, { title, text, shareUrl, file });
}
