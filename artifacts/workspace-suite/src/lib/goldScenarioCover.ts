/**
 * Cover / payload display helpers for gold proposal-testing scenarios.
 */
export function formatEventDateForProposal(opts: {
  eventDate?: string;
  dateFlexible?: boolean;
  fullEventDate?: string;
  eventDateDisplay?: string;
}): string {
  const { eventDate, dateFlexible, fullEventDate, eventDateDisplay } = opts;
  if (!dateFlexible && eventDate?.trim() && !/tbc/i.test(eventDate)) {
    return eventDate.trim().slice(0, 10);
  }
  const full = (fullEventDate || eventDateDisplay || '').trim();
  if (full && !/^date tbc$/i.test(full)) {
    const base = full.replace(/\s*\(date tbc\)\s*/gi, '').trim();
    if (dateFlexible && base) return `${base} (Date TBC)`;
    return full;
  }
  return 'Date TBC';
}

/** Proposal ref on cover — append quote version when present (e.g. WE.18900 V4). */
export function formatProposalRef(referenceNumber?: string, quoteVersion?: string): string | undefined {
  if (!referenceNumber?.trim()) return undefined;
  const ver = quoteVersion?.trim();
  if (!ver || ver === 'V1') return referenceNumber.trim();
  if (referenceNumber.includes(ver)) return referenceNumber.trim();
  return `${referenceNumber.trim()} ${ver}`;
}
