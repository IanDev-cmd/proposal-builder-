/**
 * Share a quote/PDF as a real file attachment.
 * Web compose URLs (Gmail, wa.me, Drive, Dropbox) cannot attach files, so we:
 *  1. Prefer the OS share sheet with `navigator.share({ files })` when the browser allows it
 *  2. Fall back to an .eml (email with MIME attachment), or download the file then open the app
 */
import { loadProposals, getProposal, type GeneratedProposal } from '@/lib/proposalStore';
import { proposalFileStem, sanitizeFilenamePart } from '@/lib/proposalFilename';
import type { SavedQuote } from '@/lib/savedQuotesStore';

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

function proposalFileFromRecord(p: GeneratedProposal): File | null {
  const name = p.title.toLowerCase().endsWith('.pdf') ? p.title : `${p.title}.pdf`;
  return dataUrlToFile(p.pdfDataUrl, name);
}

export async function resolveQuoteShareFile(quote: SavedQuote): Promise<{ file: File; kind: 'pdf' | 'quote' }> {
  if (quote.proposalId) {
    try {
      const stored = await getProposal(quote.proposalId);
      const file = stored ? proposalFileFromRecord(stored) : null;
      if (file) return { file, kind: 'pdf' };
    } catch {
      /* fall through */
    }
  }
  try {
    const all = await loadProposals();
    const match =
      all.find((p) => quote.lead?.email && p.leadEmail === quote.lead.email) ||
      all.find((p) => quote.title && p.title === quote.title) ||
      all.find((p) => quote.leadName && p.leadName === quote.leadName);
    const file = match ? proposalFileFromRecord(match) : null;
    if (file) return { file, kind: 'pdf' };
  } catch {
    /* quote snapshot */
  }
  const stem = sanitizeFilenamePart(quoteStem(quote)) || 'WEOTT-Quote';
  const html = quoteHtml(quote, typeof window !== 'undefined' ? `${window.location.origin}/saved-quotes/${encodeURIComponent(quote.id)}` : '');
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
  return `Please find attached the saved quote${who}: ${quote.title}.`;
}
