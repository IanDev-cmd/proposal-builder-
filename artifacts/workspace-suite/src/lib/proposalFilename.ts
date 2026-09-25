/** Sanitize a token for use in a download filename. */
export function sanitizeFilenamePart(raw: string): string {
  return String(raw || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export type LeadFilenameParts = {
  name?: string;
  company?: string;
  companyName?: string;
  referenceNumber?: string;
};

const UUID_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.pdf)?$/i;
const ANON_FILENAME = /^(?:download|document|generate|untitled|blob)(?:\.pdf)?$/i;

/** Chrome names blob-URL PDF downloads after the UUID in `blob:https://…/<uuid>`. */
export function isAnonymousPdfFilename(raw: string): boolean {
  const cleaned = sanitizeFilenamePart(raw);
  const base = cleaned.replace(/\.pdf$/i, '');
  return !base || ANON_FILENAME.test(base) || UUID_FILENAME.test(base) || UUID_FILENAME.test(cleaned);
}

/**
 * Old Quote Builder list cards, e.g. "Christmas Event Proposal — WEOTT II (Avontuur)".
 * House names start with "Proposal -" and are kept.
 */
export function isLegacyEventVesselProposalLabel(raw?: string | null): boolean {
  const t = String(raw || '').trim();
  if (!t || /^Proposal\s*-/i.test(t)) return false;
  return /\bProposal\s*[—–-]\s+\S/i.test(t);
}

export function isLegacyEventVesselProposal(p: {
  title?: string | null;
  filename?: string | null;
}): boolean {
  return isLegacyEventVesselProposalLabel(p.title) || isLegacyEventVesselProposalLabel(p.filename);
}

export function ensurePdfFilename(raw: string): string {
  const cleaned = sanitizeFilenamePart(raw);
  if (!cleaned || isAnonymousPdfFilename(cleaned)) return 'Proposal.pdf';
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

export function filenameFromContentDisposition(header?: string | null): string {
  if (!header) return '';
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return sanitizeFilenamePart(decodeURIComponent(star[1].trim().replace(/^["']|["']$/g, '')));
    } catch {
      /* fall through */
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted?.[1]) return sanitizeFilenamePart(quoted[1]);
  const plain = /filename\s*=\s*([^;]+)/i.exec(header);
  return sanitizeFilenamePart(plain?.[1] || '');
}

const PLACEHOLDER_COMPANY =
  /^(na|n\/a|n\.a\.?|none|nil|null|-|—|–)$/i;

/** Company token for filenames — drop blank / NA / dash placeholders. */
export function companyForFilename(raw?: string | null): string {
  const company = sanitizeFilenamePart(raw || '');
  if (!company || PLACEHOLDER_COMPANY.test(company)) return '';
  return company;
}

/** V1 → _V1, V2 → _V2, BF Costs → _BF Costs. Missing version is _V1. */
export function versionFilenameSuffix(raw?: string | null): string {
  const t = String(raw || '').trim();
  if (/^bf\s*costs$/i.test(t)) return '_BF Costs';
  const m = t.toUpperCase().replace(/\s+/g, '').match(/^V(\d+)$/);
  if (m) return `_V${Number(m[1])}`;
  const tail = t.match(/\bV(\d+)\s*$/i);
  if (tail) return `_V${Number(tail[1])}`;
  return '_V1';
}

function referenceWithoutVersion(raw: string): string {
  return raw.replace(/\s+V\d+\s*$/i, '').trim();
}

/**
 * Exact house filename from the lead:
 *   Proposal - Contact Name (Company Name) - Reference Code_V2
 * Company omitted when the lead has none, NA, or a dash placeholder.
 */
export function proposalFileStem(opts: {
  contactName?: string;
  companyName?: string;
  referenceCode?: string;
  quoteVersion?: string;
}): string {
  const name = sanitizeFilenamePart(opts.contactName || '') || 'Contact TBC';
  const company = companyForFilename(opts.companyName);
  const ref = referenceWithoutVersion(sanitizeFilenamePart(opts.referenceCode || '')) || 'REF TBC';
  const who = company ? `${name} (${company})` : name;
  return `Proposal - ${who} - ${ref}${versionFilenameSuffix(opts.quoteVersion || opts.referenceCode)}`;
}

export function proposalFileStemFromLead(
  lead?: (LeadFilenameParts & { quoteVersion?: string }) | null,
): string {
  return proposalFileStem({
    contactName: lead?.name,
    companyName: lead?.company || lead?.companyName,
    referenceCode: lead?.referenceNumber,
    quoteVersion: lead?.quoteVersion,
  });
}

export function proposalDownloadFilename(opts: {
  contactName?: string;
  companyName?: string;
  referenceCode?: string;
  quoteVersion?: string;
}): string {
  return `${proposalFileStem(opts)}.pdf`;
}

export function proposalDownloadFilenameFromLead(lead?: LeadFilenameParts | null): string {
  return `${proposalFileStemFromLead(lead)}.pdf`;
}

export type ProposalFilenameRecord = {
  filename?: string | null;
  title?: string | null;
  leadName?: string | null;
  leadCompany?: string | null;
  company?: string | null;
  companyName?: string | null;
  referenceNumber?: string | null;
  quoteVersion?: string | null;
};

/** Prefer a stored house name; never keep a blob UUID / generic download name. */
export function proposalFilenameFromRecord(p: ProposalFilenameRecord): string {
  for (const raw of [p.filename, p.title]) {
    const cleaned = sanitizeFilenamePart(raw || '');
    if (!cleaned || isAnonymousPdfFilename(cleaned)) continue;
    if (/^proposal\s*-/i.test(cleaned) || cleaned.toLowerCase().endsWith('.pdf')) {
      return ensurePdfFilename(cleaned);
    }
  }
  return proposalDownloadFilename({
    contactName: p.leadName || undefined,
    companyName: p.leadCompany || p.company || p.companyName || undefined,
    referenceCode: p.referenceNumber || undefined,
    quoteVersion: p.quoteVersion || undefined,
  });
}

/** Always download via a named blob — large data: URLs drop `a.download` and save as a UUID. */
export function downloadNamedPdf(source: Blob | string, filename: string): void {
  const name = ensurePdfFilename(filename);
  const save = (blob: Blob) => {
    const file = new File([blob], name, { type: 'application/pdf' });
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  if (typeof source === 'string') {
    void fetch(source)
      .then((res) => res.blob())
      .then(save);
    return;
  }
  save(source);
}
