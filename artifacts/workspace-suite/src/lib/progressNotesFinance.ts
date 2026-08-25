/**
 * Progress-notes → financial hints (rule-indexed NL parser).
 *
 * Method: **deterministic rule engine** — not an LLM.
 * 1. Split notes on `|` into chronological chunks.
 * 2. Prefer the chunk matching the active quote version (V2, V4, …).
 * 3. Apply ordered regex / keyword rules (indexed catalog below).
 * 4. Sheet columns from LeadDataFetch override notes when present.
 *
 * This matches how REPs write shorthand (HFB, AVON, SAME MARGIN AS V1, bar tab £1500).
 */

import {
  buildRateParts,
} from '@/lib/costMotherLookup';
import { resolveCostMotherVessel } from '@/lib/quoteBuilderCatalog';
import type { QuoteLead } from '@/lib/quoteLeadStore';

/** Documented rule index — extend when new note patterns appear in Sheets. */
export const PROGRESS_NOTE_FINANCE_RULES = {
  versionBlock: 'Isolate V{n} chunk before parsing version-specific menu/cost hints',
  weeklyPeriod: ['Mon to Thur', 'Mon to Wed', 'Thur to Sun', 'Fri to Sun'],
  dayPeriod: ['Daytime', 'Evening', 'EVENING', 'DAYTIME'],
  weottCost: ['WEOTT cost £X', 'total to WEOTT £X', 'R184 £X'],
  packageCost: ['£X ex vat', 'package £X', 'rough cost of £X ex vat'],
  marginPercent: ['25% margin', 'margin 20', 'SAME MARGIN AS V1'],
  discountPercent: ['discount 10%', '10% discount'],
  barTab: ['£1500 bar tab', '1500 bar tab', 'prepaid tab'],
  noCommission: ['NO COMMISSION', 'no commission'],
} as const;

export type ProgressNotesFinanceHints = {
  weeklyPeriod?: string;
  dayPeriod?: string;
  groupBracket?: string;
  weottCost?: number;
  packageCost?: number;
  marginPercent?: number;
  discountPercent?: number;
  bespokeLabel?: string;
  bespokeAmount?: number;
  matchedRules: string[];
};

export type SheetFinancialColumns = {
  weottCost?: number;
  packageCost?: number;
  grandTotal?: number;
  marginPercent?: number;
  discountPercent?: number;
  weeklyPeriod?: string;
  dayPeriod?: string;
  groupBracket?: string;
  source: 'sheet_column' | 'progress_notes' | 'gold_scenario' | 'inferred';
};

const WEEKLY_CANON: Record<string, string> = {
  'mon to thur': 'Mon to Thur',
  'mon to wed': 'Mon to Wed',
  'thur to sun': 'Thur to Sun',
  'fri to sun': 'Fri to Sun',
};

const DAY_CANON: Record<string, string> = {
  daytime: 'Daytime',
  evening: 'Evening',
};

const GROUP_CANON: Record<string, string> = {
  standard: 'Standard',
  '1 to 199 guests': '1 to 199 guests',
  '1 to 249 guests': '1 to 249 guests',
  '250 to 400 guests': '250 to 400 guests',
  '200 to 335 guests': '200 to 335 guests',
};

function parseMoney(raw: string): number | undefined {
  const n = Number(String(raw).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

/** Extract version-scoped text (e.g. all chunks mentioning V4). */
export function versionBlock(notes: string, quoteVersion: string): string {
  if (!notes?.trim()) return '';
  const verNum = quoteVersion.match(/V(\d+)/i)?.[1];
  if (!verNum) return notes;
  const chunks = notes.split(/\s*\|\s*/).filter(Boolean);
  const hits = chunks.filter((c) => new RegExp(`\\bV\\s*${verNum}\\b`, 'i').test(c));
  return hits.length ? hits.join(' | ') : notes;
}

function canonWeekly(raw: string): string | undefined {
  const k = raw.trim().toLowerCase();
  return WEEKLY_CANON[k] || (WEEKLY_CANON[k.replace(/\s+/g, ' ')] ?? undefined);
}

function canonDay(raw: string): string | undefined {
  const k = raw.trim().toLowerCase();
  return DAY_CANON[k];
}

function canonGroup(raw: string): string | undefined {
  const k = raw.trim().toLowerCase();
  for (const [key, val] of Object.entries(GROUP_CANON)) {
    if (k.includes(key)) return val;
  }
  return undefined;
}

/**
 * Parse financial + rate-dimension hints from progress notes (rule-indexed NL).
 */
export function parseProgressNotesFinance(
  notes: string,
  ctx: {
    quoteVersion?: string;
    vesselUi?: string;
    eventDate?: string;
    dateFlexible?: boolean;
    embarkation?: string;
    departure?: string;
    guests?: number;
  } = {},
): ProgressNotesFinanceHints {
  const matchedRules: string[] = [];
  const scope = versionBlock(notes, ctx.quoteVersion || 'V1');
  const text = `${scope}\n${notes}`;
  const out: ProgressNotesFinanceHints = { matchedRules };

  for (const [raw, canon] of Object.entries(WEEKLY_CANON)) {
    if (new RegExp(raw.replace(/\s+/g, '\\s+'), 'i').test(text)) {
      out.weeklyPeriod = canon;
      matchedRules.push(`weeklyPeriod:${canon}`);
      break;
    }
  }

  if (/\bEVENING\b/.test(scope) || /\bevening\b/i.test(scope)) {
    out.dayPeriod = 'Evening';
    matchedRules.push('dayPeriod:Evening');
  } else if (/\bDAYTIME\b/.test(scope) || /\bdaytime\b/i.test(scope)) {
    out.dayPeriod = 'Daytime';
    matchedRules.push('dayPeriod:Daytime');
  }

  for (const [key, val] of Object.entries(GROUP_CANON)) {
    if (new RegExp(key.replace(/\s+/g, '\\s+'), 'i').test(text)) {
      out.groupBracket = val;
      matchedRules.push(`groupBracket:${val}`);
      break;
    }
  }

  const weottM =
    text.match(/(?:WEOTT|total)\s*(?:cost|to weott)?\s*[:=]?\s*£?\s*([\d,]+(?:\.\d{2})?)/i) ||
    text.match(/\bR\s*184\b[^£\d]{0,20}£?\s*([\d,]+(?:\.\d{2})?)/i);
  if (weottM) {
    out.weottCost = parseMoney(weottM[1]);
    matchedRules.push('weottCost');
  }

  const pkgM =
    text.match(/(?:rough\s*)?cost\s*(?:of\s*)?£?\s*([\d,]+(?:\.\d{2})?)\s*ex\s*vat/i) ||
    text.match(/package\s*(?:cost)?\s*[:=]?\s*£?\s*([\d,]+(?:\.\d{2})?)/i);
  if (pkgM) {
    out.packageCost = parseMoney(pkgM[1]);
    matchedRules.push('packageCost');
  }

  const marginM = text.match(/\b(\d{1,2}(?:\.\d)?)\s*%\s*margin\b/i) || text.match(/\bmargin\s*(\d{1,2}(?:\.\d)?)\s*%?\b/i);
  if (marginM) {
    out.marginPercent = parseFloat(marginM[1]);
    matchedRules.push('marginPercent');
  }

  const discM = text.match(/\b(\d{1,2}(?:\.\d)?)\s*%\s*discount\b/i);
  if (discM) {
    out.discountPercent = parseFloat(discM[1]);
    matchedRules.push('discountPercent');
  }

  const barM =
    text.match(/(?:£|\b)(\d{1,3}(?:,\d{3})*|\d+)\s*bar\s*tab/i) ||
    text.match(/bar\s*tab[^£\d]{0,24}(?:£|\b)(\d{1,3}(?:,\d{3})*|\d+)/i);
  if (barM) {
    out.bespokeAmount = parseMoney(barM[1]);
    out.bespokeLabel = 'Bar tab';
    matchedRules.push('bespoke:barTab');
  }

  // Fallback rate dimensions from event date + embark when notes silent
  if (ctx.vesselUi && (!out.weeklyPeriod || !out.dayPeriod || !out.groupBracket)) {
    const vessel = resolveCostMotherVessel(ctx.vesselUi) || ctx.vesselUi;
    const inferred = buildRateParts({
      vesselUi: ctx.vesselUi,
      weeklyPeriod: out.weeklyPeriod,
      dayPeriod: out.dayPeriod,
      groupBracket: out.groupBracket,
      eventDate: ctx.eventDate,
      dateFlexible: ctx.dateFlexible,
      embarkation: ctx.embarkation,
      departure: ctx.departure,
      guests: ctx.guests,
    });
    if (!out.weeklyPeriod) {
      out.weeklyPeriod = inferred.weeklyPeriod;
      matchedRules.push('weeklyPeriod:inferred');
    }
    if (!out.dayPeriod) {
      out.dayPeriod = inferred.dayPeriod;
      matchedRules.push('dayPeriod:inferred');
    }
    if (!out.groupBracket) {
      out.groupBracket = inferred.groupBracket;
      matchedRules.push('groupBracket:inferred');
    }
    void vessel;
  }

  return out;
}

const SHEET_WEOTT_KEYS = [
  'quoteWeottCost',
  'weottCost',
  'totalToWeott',
  'totalToWEOTT',
  'quoteSheetWeottCost',
  'Total Cost (to WEOTT)',
  'Total to WEOTT',
  'R184',
];
const SHEET_PKG_KEYS = ['quotePackageCost', 'packageCost', 'costToClient', 'Package Cost'];
const SHEET_MARGIN_KEYS = ['quoteMarginPercent', 'marginPercent', 'Margin %', 'margin'];
const SHEET_WEEKLY_KEYS = ['weeklyPeriod', 'Weekly Period', 'quoteWeeklyPeriod'];
const SHEET_DAY_KEYS = ['dayPeriod', 'Day Period', 'quoteDayPeriod'];
const SHEET_GROUP_KEYS = ['groupBracket', 'Group Bracket', 'quoteGroupBracket'];

function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      const v = parseMoney(String(row[k]));
      if (v != null) return v;
    }
  }
  for (const [rk, rv] of Object.entries(row)) {
    const norm = rk.replace(/\s+/g, ' ').trim().toLowerCase();
    for (const k of keys) {
      if (norm === k.toLowerCase() || norm.includes(k.toLowerCase())) {
        const v = parseMoney(String(rv));
        if (v != null) return v;
      }
    }
  }
  return undefined;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  return undefined;
}

/** Read optional Quote Sheet columns from a lead row (overrides progress notes). */
export function extractSheetFinancialColumns(row: Record<string, unknown>): Partial<SheetFinancialColumns> {
  const out: Partial<SheetFinancialColumns> = {};
  const weott = pickNumber(row, SHEET_WEOTT_KEYS);
  if (weott != null) {
    out.weottCost = weott;
    out.source = 'sheet_column';
  }
  const pkg = pickNumber(row, SHEET_PKG_KEYS);
  if (pkg != null) out.packageCost = pkg;
  const margin = pickNumber(row, SHEET_MARGIN_KEYS);
  if (margin != null) out.marginPercent = margin <= 1 ? margin * 100 : margin;
  const weekly = pickString(row, SHEET_WEEKLY_KEYS);
  if (weekly) out.weeklyPeriod = canonWeekly(weekly) || weekly;
  const day = pickString(row, SHEET_DAY_KEYS);
  if (day) out.dayPeriod = canonDay(day) || day;
  const group = pickString(row, SHEET_GROUP_KEYS);
  if (group) out.groupBracket = canonGroup(group) || group;
  return out;
}

/** Merge sheet columns, progress notes, gold scenario, and date inference. */
export function resolveSheetFinancialTargets(
  lead: QuoteLead | null,
  ctx: {
    quoteVersion?: string;
    vesselUi?: string;
    eventDate?: string;
    dateFlexible?: boolean;
    embarkation?: string;
    departure?: string;
    guests?: number;
  },
  gold?: Partial<SheetFinancialColumns> | null,
): SheetFinancialColumns | null {
  const row = {
    ...(lead?.sapphire || {}),
    quoteWeottCost: (lead as Record<string, unknown> | null)?.quoteWeottCost,
    quotePackageCost: (lead as Record<string, unknown> | null)?.quotePackageCost,
    quoteMarginPercent: (lead as Record<string, unknown> | null)?.quoteMarginPercent,
    weeklyPeriod: (lead as Record<string, unknown> | null)?.quoteWeeklyPeriod,
    dayPeriod: (lead as Record<string, unknown> | null)?.quoteDayPeriod,
    groupBracket: (lead as Record<string, unknown> | null)?.quoteGroupBracket,
  } as Record<string, unknown>;

  const sheet = extractSheetFinancialColumns(row);
  const notes = parseProgressNotesFinance(lead?.progressNotes || '', ctx);

  const merged: SheetFinancialColumns = {
    source: 'inferred',
  };

  if (gold?.weottCost != null) {
    merged.weottCost = gold.weottCost;
    merged.source = 'gold_scenario';
  }
  if (gold?.packageCost != null) merged.packageCost = gold.packageCost;
  if (gold?.marginPercent != null) merged.marginPercent = gold.marginPercent;
  if (gold?.weeklyPeriod) merged.weeklyPeriod = gold.weeklyPeriod;
  if (gold?.dayPeriod) merged.dayPeriod = gold.dayPeriod;
  if (gold?.groupBracket) merged.groupBracket = gold.groupBracket;

  if (sheet.weottCost != null) {
    merged.weottCost = sheet.weottCost;
    merged.source = 'sheet_column';
  }
  if (sheet.packageCost != null) merged.packageCost = sheet.packageCost;
  if (sheet.marginPercent != null) merged.marginPercent = sheet.marginPercent;
  if (sheet.weeklyPeriod) merged.weeklyPeriod = sheet.weeklyPeriod;
  if (sheet.dayPeriod) merged.dayPeriod = sheet.dayPeriod;
  if (sheet.groupBracket) merged.groupBracket = sheet.groupBracket;

  if (notes.weottCost != null && merged.source !== 'sheet_column') {
    merged.weottCost = notes.weottCost;
    merged.source = 'progress_notes';
  }
  if (notes.packageCost != null && !merged.packageCost && merged.source !== 'gold_scenario') {
    merged.packageCost = notes.packageCost;
  }
  if (notes.marginPercent != null && merged.marginPercent == null) merged.marginPercent = notes.marginPercent;
  if (notes.discountPercent != null) merged.discountPercent = notes.discountPercent;
  if (notes.weeklyPeriod && !merged.weeklyPeriod) merged.weeklyPeriod = notes.weeklyPeriod;
  if (notes.dayPeriod && !merged.dayPeriod) merged.dayPeriod = notes.dayPeriod;
  if (notes.groupBracket && !merged.groupBracket) merged.groupBracket = notes.groupBracket;

  const hasAny =
    merged.weottCost != null ||
    merged.packageCost != null ||
    merged.weeklyPeriod ||
    merged.dayPeriod ||
    merged.groupBracket;

  if (
    merged.source === 'gold_scenario' &&
    merged.weottCost != null &&
    merged.marginPercent != null
  ) {
    const m = merged.marginPercent / 100;
    merged.packageCost = Math.round((merged.weottCost * (1 + m) + Number.EPSILON) * 100) / 100;
  }

  return hasAny ? merged : null;
}

/** Rate event date: use confirmed date, else parse fullEventDate even when flexible (for vessel rates). */
export function rateEventDateFromLead(lead: QuoteLead, eventDate: string, dateFlexible: boolean): string {
  if (eventDate?.trim() && !/tbc/i.test(eventDate)) return eventDate.slice(0, 10);
  const full = lead.fullEventDate || lead.eventDateDisplay || '';
  if (!full || /tbc/i.test(full)) return '';
  const d = new Date(full.replace(/(\d+)(st|nd|rd|th)/gi, '$1'));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
