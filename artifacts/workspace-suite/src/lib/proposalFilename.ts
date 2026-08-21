/** Sanitize a token for use in a download filename. */
export function sanitizeFilenamePart(raw: string): string {
  return String(raw || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Proposal - Contact Name (Company Name) - Reference Code
 * If company is missing: Proposal - Contact Name - Reference Code
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

export function proposalDownloadFilename(opts: {
  contactName?: string;
  companyName?: string;
  referenceCode?: string;
}): string {
  return `${proposalFileStem(opts)}.pdf`;
}
