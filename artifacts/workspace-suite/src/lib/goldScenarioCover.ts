/**
 * Cover / payload display helpers for gold proposal-testing scenarios.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

/** ISO yyyy-mm-dd → "Wednesday 2nd December 2026". */
export function formatIsoDateHouseStyle(iso?: string): string {
  const raw = (iso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.getDate();
  return `${WEEKDAYS[d.getDay()]} ${day}${ordinal(day)} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function stripTbcMarkers(text: string): string {
  return text
    .replace(/\s*\n\s*TBC\s*$/i, '')
    .replace(/\s*\(date\s*tbc\)\s*/gi, '')
    .replace(/\s*\(tbc\)\s*/gi, '')
    .replace(/\s*\bflexible\b\s*/gi, '')
    .trim();
}

/**
 * Proposal cover date.
 * Fixed → date only (engine wipes the template "(Date TBC)").
 * Flexible → date plus a "(Date TBC)" marker; engine draws the date only and
 * leaves the template line under Event date requested.
 */
export function formatEventDateForProposal(opts: {
  eventDate?: string;
  dateFlexible?: boolean;
  fullEventDate?: string;
  eventDateDisplay?: string;
}): string {
  const { eventDate, dateFlexible, fullEventDate, eventDateDisplay } = opts;

  let base = '';
  if (eventDate?.trim() && !/tbc/i.test(eventDate)) {
    base = formatIsoDateHouseStyle(eventDate.trim()) || eventDate.trim().slice(0, 10);
  }
  if (!base) {
    const full = (fullEventDate || eventDateDisplay || '').trim();
    if (full && !/^date\s*tbc$/i.test(full)) {
      base = stripTbcMarkers(full);
    }
  }

  if (!base) return 'Date TBC';
  if (dateFlexible) return `${base}\n(Date TBC)`;
  return base;
}

/** Proposal ref on cover — append quote version when present (e.g. WE.18900 V4). */
export function formatProposalRef(referenceNumber?: string, quoteVersion?: string): string | undefined {
  if (!referenceNumber?.trim()) return undefined;
  const ver = quoteVersion?.trim();
  if (!ver || ver === 'V1') return referenceNumber.trim();
  if (referenceNumber.includes(ver)) return referenceNumber.trim();
  return `${referenceNumber.trim()} ${ver}`;
}
