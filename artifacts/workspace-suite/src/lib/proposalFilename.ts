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

/**
 * Exact house filename from the lead:
 *   Proposal - Contact Name (Company Name) - Reference Code
 * Company omitted when the lead has none. Reference is the lead code, not a quote version.
 */
export function proposalFileStem(opts: {
  contactName?: string;
  companyName?: string;
  referenceCode?: string;
}): string {
  const name = sanitizeFilenamePart(opts.contactName || '') || 'Contact TBC';
  const company = sanitizeFilenamePart(opts.companyName || '');
  const ref = sanitizeFilenamePart(opts.referenceCode || '') || 'REF TBC';
  const who = company ? `${name} (${company})` : name;
  return `Proposal - ${who} - ${ref}`;
}

export function proposalFileStemFromLead(lead?: LeadFilenameParts | null): string {
  return proposalFileStem({
    contactName: lead?.name,
    companyName: lead?.company || lead?.companyName,
    referenceCode: lead?.referenceNumber,
  });
}

export function proposalDownloadFilename(opts: {
  contactName?: string;
  companyName?: string;
  referenceCode?: string;
}): string {
  return `${proposalFileStem(opts)}.pdf`;
}

export function proposalDownloadFilenameFromLead(lead?: LeadFilenameParts | null): string {
  return `${proposalFileStemFromLead(lead)}.pdf`;
}
