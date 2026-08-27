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

function fromMin(mins: number): string {
  const n = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutesToTime(hhmm: string, delta: number): string {
  const mins = toMin(hhmm);
  if (mins == null) return hhmm;
  return fromMin(mins + delta);
}

/** Embarkation is always 15 minutes before departure. */
export function embarkationFromDeparture(departure: string): string {
  return addMinutesToTime(departure, -15);
}

function fmtHrs(t?: string): string {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t || 'TBC';
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}hrs`;
}

/** 12-hour clock label for timeline cards (e.g. "6:00 PM"). */
export function formatClockLabel(t?: string): string {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${min} ${suffix}`;
}

/**
 * Billable event hours: departure → disembarkation.
 * Embarkation buffer (boarding before departure) is complimentary and not billed.
 * Return is inside the window; official end is when disembarkation finishes.
 */
export function itineraryHours(opts: TimingFields): number {
  const start = toMin(opts.departure) ?? toMin(opts.embarkation);
  const finish = toMin(opts.disembarkation) ?? toMin(opts.returnTime);
  if (start == null || finish == null || finish <= start) return 4;
  return Math.max(1, Math.round(((finish - start) / 60) * 100) / 100);
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
      `Returns to pier at ${fmtHrs(opts.returnTime)}`,
      `Disembark completes at ${fmtHrs(opts.disembarkation)}`,
    ],
  };
}

/** Flat editable text (one item per line; first line is the heading). */
export function buildItineraryProposalText(opts: TimingFields): string {
  const block = buildItineraryProposalBlock(opts);
  return [block.heading, ...block.items].join('\n');
}

/** Cover / payload event window: departure → return. Never embarkation. */
export function eventWindowTimes(opts: TimingFields): { start: string; end: string } {
  return {
    start: opts.departure || '',
    end: opts.returnTime || '',
  };
}

/**
 * Cover event window as "HH:MM - HH:MM" from departure → return.
 * Embarkation is not a cover timing.
 */
export function formatEventTimingsPayload(opts: TimingFields): string {
  const { start, end } = eventWindowTimes(opts);
  if (start && end) return `${start} - ${end}`;
  return '';
}

export function parseItineraryProposalText(text: string): { heading: string; items: string[] } | null {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  return { heading: lines[0], items: lines.slice(1) };
}
