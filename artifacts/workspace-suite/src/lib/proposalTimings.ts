/**
 * Auto-generate editable itinerary wording for the proposal pack (Sapphire feedback).
 */

export type TimingFields = {
  embarkation?: string;
  departure?: string;
  returnTime?: string;
  disembarkation?: string;
};

function toMin(t?: string): number | null {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fmtHrs(t?: string): string {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t || 'TBC';
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}hrs`;
}

/** Event hours embark → disembark (min 1). */
export function itineraryHours(opts: TimingFields): number {
  const a = toMin(opts.embarkation);
  const b = toMin(opts.disembarkation);
  if (a == null || b == null || b <= a) return 4;
  return Math.max(1, Math.round(((b - a) / 60) * 100) / 100);
}

export function buildItineraryProposalBlock(opts: TimingFields): {
  heading: string;
  items: string[];
} {
  const hours = itineraryHours(opts);
  const hourLabel = Number.isInteger(hours) ? String(hours) : String(hours);
  return {
    heading: `${hourLabel} hours private venue hire – timings can be amended upon request - current itinerary is as follows;`,
    items: [
      `Embark will begin at ${fmtHrs(opts.embarkation)}`,
      `Boat departs at ${fmtHrs(opts.departure)}`,
      `Returns to pier for ${fmtHrs(opts.returnTime)}`,
      `Disembark completes at ${fmtHrs(opts.disembarkation)}`,
    ],
  };
}

/** Flat editable text (one item per line; first line is the heading). */
export function buildItineraryProposalText(opts: TimingFields): string {
  const block = buildItineraryProposalBlock(opts);
  return [block.heading, ...block.items].join('\n');
}

export function parseItineraryProposalText(text: string): { heading: string; items: string[] } | null {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  return { heading: lines[0], items: lines.slice(1) };
}
