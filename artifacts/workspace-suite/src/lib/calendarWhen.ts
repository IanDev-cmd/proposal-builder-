/**
 * Calendar date and clock parsing for rate inference.
 * Dates are year/month/day only. Weekday is read at midday so it cannot shift.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoFromParts(year: number, month: number, day: number): string {
  let y = year;
  if (y < 100) y += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const dt = new Date(y, month - 1, day, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== month - 1 || dt.getDate() !== day) return '';
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

function stripDateMarkers(raw: string): string {
  return raw
    .replace(/\s*\n\s*TBC\s*$/i, '')
    .replace(/\s*\(date\s*tbc\)\s*/gi, '')
    .replace(/\s*\(tbc\)\s*/gi, '')
    .trim();
}

/** YYYY-MM-DD, UK d/m/yyyy, or "Monday 7th September 2026". Empty when there is no calendar day. */
export function parseCalendarDate(raw?: string): string {
  let s = String(raw || '').trim();
  if (!s || /^(date\s*)?tbc$/i.test(s)) return '';
  s = stripDateMarkers(s);
  if (!s || /^(date\s*)?tbc$/i.test(s)) return '';

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const uk = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (uk) return isoFromParts(Number(uk[3]), Number(uk[2]), Number(uk[1]));

  const named = s.match(
    /(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i,
  );
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (!month) return '';
    return isoFromParts(Number(named[3]), month, Number(named[1]));
  }
  return '';
}

/** 0 Sunday … 6 Saturday. Null when the value is not a calendar date. */
export function weekdayIndex(raw?: string): number | null {
  const iso = parseCalendarDate(raw);
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

/** 18:00, 6pm, 6:00 PM, 1800 → HH:mm. Null when the clock is missing. */
export function parseClock(raw?: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const ampm = s.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*([ap]m?)\.?$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = ampm[2] || '00';
    const ap = ampm[3].toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    if (!Number.isFinite(h) || h > 23 || Number(min) > 59) return null;
    return `${pad2(h)}:${min}`;
  }
  const colon = s.match(/^(\d{1,2})[:.h](\d{2})(?:\s*hrs?)?$/i);
  if (colon) {
    const h = Number(colon[1]);
    const min = colon[2];
    if (h > 23 || Number(min) > 59) return null;
    return `${pad2(h)}:${min}`;
  }
  const compact = s.match(/^(\d{2})(\d{2})$/);
  if (compact) {
    const h = Number(compact[1]);
    const min = compact[2];
    if (h > 23 || Number(min) > 59) return null;
    return `${compact[1]}:${min}`;
  }
  return null;
}
