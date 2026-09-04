/**
 * Enquiry / Sheets → Quote Builder prefill.
 * Parses Sapphire lead aliases + progressNotes hints; tracks auto-filled keys for blue UI styling.
 */
import { VESSEL_TYPES, EVENT_TYPES, MENU_TYPES } from '@/lib/formOptions';
import {
  QUOTE_LINES,
  CATALOGUE_TAXONOMY,
  defaultSelectedLineIds,
  findLineByAlias,
  tablesForVessel,
} from '@/lib/quoteBuilderCatalog';
import { lookupMinMargin } from '@/lib/costMotherLookup';
import { REPEAT_CLIENT_MARGIN, NEW_CLIENT_MARGIN } from '@/lib/quoteFinance';
import type { QuoteLead } from '@/lib/quoteLeadStore';
import { parseGuestCountDetailed } from '@/lib/parseGuestCount';
import { resolveProposalPack } from '@/lib/proposalPrefill';
import {
  parseProgressNotesFinance,
  rateEventDateFromLead,
  resolveSheetFinancialTargets,
  versionBlock,
} from '@/lib/progressNotesFinance';
import { applyGoldScenarioPlaybook, goldTargetsFromRef } from '@/lib/goldScenarioPlaybook';
import { buildRateParts } from '@/lib/costMotherLookup';
import {
  buildItineraryProposalText,
  embarkationFromDeparture,
  returnFromDisembarkation,
  addMinutesToTime,
} from '@/lib/proposalTimings';

export const PREFILL_INPUT_CLS =
  'border-blue-400 bg-blue-50/60 ring-2 ring-blue-100/90 focus:border-blue-500 focus:ring-blue-200/80';
export const PREFILL_TOGGLE_CLS = 'ring-2 ring-blue-400 ring-offset-2';
/** Applied when the REP clicks to confirm a blue auto-selection. */
export const PREFILL_CONFIRMED_CLS =
  'ring-2 ring-emerald-500 ring-offset-2 shadow-[0_0_14px_rgba(16,185,129,0.42)] border-emerald-500';
/** Card / button surface after confirm (pairs with PREFILL_CONFIRMED_CLS). */
export const PREFILL_CONFIRMED_SURFACE =
  'border-emerald-500 bg-emerald-50/85 font-semibold text-emerald-900';
/** Blue glow for auto-selected items awaiting REP click-to-confirm. */
export const PREFILL_BLUE_GLOW_CLS =
  'ring-2 ring-blue-400 ring-offset-2 shadow-[0_0_14px_rgba(59,130,246,0.42)] border-blue-400';

export type LeadPrefillResult<T> = {
  data: T;
  prefilledKeys: Set<string>;
  prefilledLineIds: Set<string>;
  /** Gemini / alias matches below 0.75 — stay blue until REP confirms. */
  lowConfidenceKeys: Set<string>;
  /** Fields that must be typed by the REP (e.g. ambiguous guest count). */
  ambiguousFields: Set<string>;
};

/** Progress-note / sheet catering shorthand → Menu Type labels */
const MENU_CODE_RULES: { re: RegExp; menu: string }[] = [
  { re: /\bHFB\b/i, menu: 'Hot Fork Buffet (All Seasons)' },
  { re: /\b3\s*CSD\b|\b3CSD\b/i, menu: 'Three Course Seated Dinner (All Seasons)' },
  {
    re: /\b2\s*CSD\b|\b2CSD\b/i,
    menu: 'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
  },
  { re: /\bSUB\s*CANS?\b/i, menu: 'Substantial Canapes (All Sesons)' },
  { re: /\bCANAPES?\b/i, menu: 'Canapes (All Seasons)' },
  { re: /\bSTREET\s*FOOD\b/i, menu: 'Street Food Station (All Seasons)' },
  { re: /\bBOWL\s*FOOD\b/i, menu: 'Bowl Food (All Seasons)' },
  { re: /\bBBQ\b|\bBARBECUE\b/i, menu: 'Barbecue' },
  { re: /\bCHARCUTERIE\s*CUPS?\b/i, menu: 'Charcuterie Cups (All Seasons)' },
  { re: /\bCHARCUTERIE\s*STATION\b/i, menu: 'Charcuterie Station (All Seasons)' },
  { re: /\bBURGER\s*ST(ATION)?\b/i, menu: 'Burger Station' },
];

/** Progress-note tokens → Cost Mother line labels. Collision tokens are not auto-committed. */
const NOTE_LINE_RULES: { re: RegExp; label: string }[] = [
  { re: /\bBG\s*MUSIC\b|\bBACKGROUND\s*MUSIC\b/i, label: 'Background Music/Sound Equipment Hire' },
  {
    re: /\b2\s*x\s*CASINO\b|\bCASINO\s*TABLE.*\bx\s*2\b|\bCASINO\s*TABLES?\s*\(2\b/i,
    label: 'Casino table with croupier - x 2',
  },
  { re: /\bCASINO\s*TABLE\b|\b1\s*x\s*CASINO\b/i, label: 'Casino table with croupier - x 1' },
  { re: /\bPHOTO\s*BOOTH\b|\bPHOTOBOOTH\b/i, label: 'Photobooth' },
  { re: /\bTV\b/i, label: 'TV - 55"' },
  {
    re: /\bTEAM\s*BUILDING\b|\bPERFORMANCE\s*COACH\b/i,
    label: 'Team building activities with performance coach',
  },
  { re: /\bDRINK\s*TOKENS?\s*[-–]?\s*x\s*3\b|\b3\s*x\s*DRINK\s*TOKENS?\b/i, label: 'Drink tokens - x 3' },
  { re: /\bDRINK\s*TOKENS?\s*[-–]?\s*x\s*2\b|\b2\s*x\s*DRINK\s*TOKENS?\b/i, label: 'Drink tokens - x 2' },
];

/** MIC/SCREEN/AWARDS/generic RECEPTION — local must not tick TV or cocktail. Gemini may veto leftover TV. */
const COLLISION_TOKEN_RE = /\b(MIC|SCREEN|AWARDS?)\b|\bRECEPTION\b/i;
const EXPLICIT_COCKTAIL_RE = /\bCOCKTAIL\s+RECEPTION\b/i;

export function matchVessels(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[,;/|]+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const hit = VESSEL_TYPES.find(
      (v) =>
        v.toLowerCase() === lower ||
        lower.includes(v.toLowerCase()) ||
        v.toLowerCase().includes(lower) ||
        fuzzyVessel(lower, v.toLowerCase()),
    );
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

function fuzzyVessel(raw: string, opt: string): boolean {
  if (raw.includes('avon') && opt.includes('avon')) return true;
  if ((raw.includes('rose') || raw.includes('weott i ')) && opt.includes('rose')) return true;
  if (raw.includes('golden') && opt.includes('golden')) return true;
  if ((raw.includes('vaulla') || raw.includes('valulla')) && (opt.includes('vaulla') || opt.includes('valulla')))
    return true;
  if (raw.includes('dixie') && opt.includes('dixie')) return true;
  if (raw.includes('elizabeth') && opt.includes('elizabeth')) return true;
  if (raw.includes('edward') && opt.includes('edward')) return true;
  if ((raw.includes('bourne') || raw.includes('limo')) && opt.includes('bourne')) return true;
  return false;
}

export function matchEventType(raw?: string): string {
  if (!raw?.trim()) return '';
  const lower = raw.toLowerCase();
  const exact = EVENT_TYPES.find((e) => e.toLowerCase() === lower);
  if (exact) return exact;
  const starts = EVENT_TYPES.find((e) => lower.startsWith(e.toLowerCase()) || e.toLowerCase().startsWith(lower));
  if (starts) return starts;
  if (lower.includes('wedding')) {
    return EVENT_TYPES.find((e) => e.toLowerCase().includes('wedding transfer')) ||
      EVENT_TYPES.find((e) => e.toLowerCase().includes('wedding reception')) ||
      'Wedding Reception';
  }
  if (lower.includes('summer')) return 'Summer Event';
  if (lower.includes('christmas') || lower.includes('xmas')) return 'Christmas Event';
  if (lower.includes('team building')) return 'Team Building';
  return '';
}

/** Parse Lead Sheet times: labeled clocks, 4-part itinerary, or event window. */
function parseClockToken(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const ampm = s.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*([ap]m?)\.?$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const min = ampm[2] || '00';
    const ap = ampm[3].toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    if (!Number.isFinite(h) || h > 23) return null;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  const colon = s.match(/^(\d{1,2})[:.h](\d{2})(?:\s*hrs?)?$/i);
  if (colon) {
    const h = Number(colon[1]);
    if (h > 23) return null;
    return `${String(h).padStart(2, '0')}:${colon[2]}`;
  }
  const compact = s.match(/^(\d{2})(\d{2})$/);
  if (compact) {
    const h = Number(compact[1]);
    if (h > 23) return null;
    return `${compact[1]}:${compact[2]}`;
  }
  return null;
}

function collectClocks(text: string): string[] {
  const out: string[] = [];
  const re =
    /(\d{1,2}[:.h]\d{2}\s*(?:hrs?)?)|(\d{1,2}\s*[ap]m\b)|(\d{1,2}:\d{2}\s*[ap]m\b)|(\b\d{2}\d{2}\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const token = (m[1] || m[2] || m[3] || m[4] || '').trim();
    const clock = parseClockToken(token.replace(/\s*hrs?$/i, ''));
    if (clock) out.push(clock);
  }
  return out;
}

export type ParsedScheduleTimes = {
  embarkation?: string;
  departure?: string;
  returnTime?: string;
  disembarkation?: string;
};

function completeSchedule(partial: ParsedScheduleTimes): ParsedScheduleTimes {
  const departure =
    partial.departure ||
    (partial.embarkation ? addMinutesToTime(partial.embarkation, 15) : undefined);
  const embarkation =
    partial.embarkation || (departure ? embarkationFromDeparture(departure) : undefined);
  const disembarkation =
    partial.disembarkation ||
    (partial.returnTime ? addMinutesToTime(partial.returnTime, 15) : undefined);
  const returnTime =
    partial.returnTime ||
    (disembarkation ? returnFromDisembarkation(disembarkation) : undefined);
  return { embarkation, departure, returnTime, disembarkation };
}

function parseLabeledTimes(raw: string): ParsedScheduleTimes {
  const pick = (labels: RegExp): string | undefined => {
    const m = raw.match(
      new RegExp(`(?:${labels.source})[^\\d]{0,24}(\\d{1,2}[:.h]\\d{2}|\\d{1,2}\\s*[ap]m)`, 'i'),
    );
    return m ? parseClockToken(m[1]) || undefined : undefined;
  };
  return {
    embarkation: pick(/(?:^|[^a-z])embark(?:ation|ing)?\b|boarding|\bboard\b/),
    departure: pick(/depart(?:ure|s)?|cast off|sail/),
    returnTime: pick(/return(?:s|ing)?|back (?:to )?pier/),
    disembarkation: pick(/disembark(?:ation|ing)?|off[- ]hire/),
  };
}

export function parseRequestedTimes(raw?: string, quoteVersion?: string): ParsedScheduleTimes {
  if (!raw?.trim()) return {};
  let scoped = raw;
  const verNum = quoteVersion?.match(/V?\s*(\d+)/i)?.[1];
  if (verNum) {
    const vm = raw.match(new RegExp(`V\\s*${verNum}\\s*[:\\-]?\\s*([^V]+?)(?=V\\s*\\d+|$)`, 'i'));
    if (vm) scoped = vm[1];
  }
  const labeled = parseLabeledTimes(scoped);
  if (labeled.embarkation || labeled.departure || labeled.returnTime || labeled.disembarkation) {
    return completeSchedule(labeled);
  }
  const clocks = collectClocks(scoped);
  if (clocks.length >= 4) {
    return completeSchedule({
      embarkation: clocks[0],
      departure: clocks[1],
      returnTime: clocks[2],
      disembarkation: clocks[3],
    });
  }
  if (clocks.length >= 2) {
    return completeSchedule({
      departure: clocks[0],
      disembarkation: clocks[1],
    });
  }
  return {};
}

export function isFlexibleDate(flexible?: string, flexibleBool?: boolean): boolean {
  if (flexibleBool === true) return true;
  const s = String(flexible || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!s) return false;
  if (/^(no|n|false|fixed)$/.test(s)) return false;
  return s.includes('yes') || s.includes('tbc') || s.includes('flex');
}

function isTbcDateToken(raw?: string): boolean {
  const s = String(raw || '').trim();
  return !!s && /^(date\s*)?tbc$/i.test(s);
}

/** Lead Sheet → Quote Builder: TBC/YES/flex picks Flexible; otherwise Fixed. */
export function leadSelectsFlexibleDate(lead: {
  eventDateFlexible?: string;
  eventDateFlexibleBool?: boolean | string;
  eventDateDisplay?: string;
  fullEventDate?: string;
}): boolean {
  const col = String(lead.eventDateFlexible || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (/^(no|n|false|fixed)$/.test(col)) {
    return isTbcDateToken(lead.fullEventDate);
  }
  const boolTrue = lead.eventDateFlexibleBool === true || lead.eventDateFlexibleBool === 'true';
  if (isFlexibleDate(lead.eventDateFlexible, boolTrue)) return true;
  return isTbcDateToken(lead.fullEventDate) || isTbcDateToken(lead.eventDateDisplay);
}

export function isRepeatYes(raw?: string | boolean): boolean {
  if (raw === true) return true;
  if (raw === false || raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s.startsWith('yes');
}

export function isRepeatClientSource(rawSource?: string): boolean {
  if (!rawSource) return false;
  return rawSource.toLowerCase().includes('repeat client');
}

export function parseEventDateForInput(display?: string, full?: string, _flexible?: boolean): string {
  // Always keep a calendar date when the lead has one — Fixed/Flexible is a separate toggle.
  for (const candidate of [full, display]) {
    const src = (candidate || '').trim();
    if (!src || /^date\s*tbc$/i.test(src)) continue;
    const cleaned = src
      .replace(/\s*\n\s*TBC\s*$/i, '')
      .replace(/\s*\(date\s*tbc\)\s*/gi, '')
      .replace(/\s*\(tbc\)\s*/gi, '')
      .trim();
    if (!cleaned || /^date\s*tbc$/i.test(cleaned)) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);
    const d = new Date(cleaned);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return '';
}

export function parseQuoteVersionFromNotes(notes?: string): string {
  if (!notes?.trim()) return 'V1';
  const nums = [...notes.matchAll(/\bV\s*(\d+)\b/gi)].map((m) => Number(m[1])).filter(Number.isFinite);
  if (!nums.length) return 'V1';
  return `V${Math.max(...nums)}`;
}

export function parseGuestHigh(groupSize?: string | number | null, guestCount?: string): string {
  const text = String(groupSize ?? '');
  const range = text.match(/(\d{2,})\s*[-–]\s*(\d{2,})/);
  if (range) return range[2];
  const nums = [...text.matchAll(/\d{2,}/g)].map((m) => m[0]);
  if (nums.length >= 2) return nums[nums.length - 1];
  return guestCount || '';
}

function inferDepartureReturn(
  start: string,
  finish: string,
  extras?: ParsedScheduleTimes,
): {
  embarkation: string;
  departure: string;
  returnTime: string;
  disembarkation: string;
} {
  const departure = extras?.departure || start || '12:00';
  const disembarkation = extras?.disembarkation || finish || extras?.returnTime || '17:00';
  const returnTime = extras?.returnTime || returnFromDisembarkation(disembarkation);
  return {
    departure,
    returnTime,
    disembarkation,
    embarkation: extras?.embarkation || embarkationFromDeparture(departure),
  };
}

function parseMenusFromNotes(notes: string, quoteVersion?: string): string[] {
  const scope = quoteVersion ? versionBlock(notes, quoteVersion) : notes;
  const found = new Set<string>();
  for (const { re, menu } of MENU_CODE_RULES) {
    if (re.test(scope) && MENU_TYPES.includes(menu)) found.add(menu);
  }
  return [...found];
}

function lineIdsFromLabels(labels: string[]): string[] {
  const ids: string[] = [];
  for (const label of labels) {
    const line = QUOTE_LINES.find((l) => l.label === label);
    if (line) ids.push(line.id);
  }
  return ids;
}

export function parseCostLineLabelsFromNotes(notes: string, quoteVersion?: string): string[] {
  const scope = quoteVersion ? versionBlock(notes, quoteVersion) : notes;
  const labels = new Set<string>();
  for (const [alias, label] of Object.entries(CATALOGUE_TAXONOMY.noteAliases)) {
    if (alias === 'TV' && collisionTvUnsafe_(scope)) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\s+/g, '\\s+');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(scope)) {
      const line = findLineByAlias(label) || QUOTE_LINES.find((l) => l.label === label);
      if (line) labels.add(line.label);
    }
  }
  for (const { re, label } of NOTE_LINE_RULES) {
    if (label.startsWith('TV') && collisionTvUnsafe_(scope)) continue;
    if (re.test(scope)) labels.add(label);
  }
  return [...labels];
}

/** Awards/mic/screen without an explicit TV kit request must not auto-tick the 55" TV. */
function collisionTvUnsafe_(scope: string): boolean {
  if (/\bTV\/MIC\b|\bTV\s*\/\s*MIC\b/i.test(scope)) return false;
  const collision = /\b(MIC|SCREEN|AWARDS?)\b/i.test(scope);
  if (!collision) return false;
  return !/\b(add(?:ing)?\s+(?:a\s+)?TV|TV\s*-?\s*55)\b/i.test(scope);
}

const KEY_ITEM_TOKEN_RE =
  /\b(AVON|RECEPTION|BG MUSIC|HFB|3CSD|2CSD|SUB CANS|STREET FOOD|CASINO|PHOTOBOOTH|BAR TAB|CANAP|DJ\b|PHOTOB|MUSIC|DECOR|BUFFET|CENTREPIECE|DRINK TOKEN|TOKENS|AWARDS?|MIC|TV\/MIC)\b/i;
const CALL_LOG_RE =
  /\b(proposal sent|spoke(\s+to)?|called|email(ed)?|video call|follow[- ]?up|left (a )?voicemail|voicemail|chased|no answer|ring(?:ing)?|whatsapp|texted|lead received)\b/i;
const VERSION_STAMP_RE = /^\s*V\s*\d+\b/i;
const LEADING_REP_RE =
  /^\s*(?:REP\s+)?(?:Natasha|Katherine|Sapphire|Meera|Carly|Shilen|Ian|Amy|Sarah|Emma|Sophie|Laura|Jessica|Chloe|Olivia|Hannah|Megan|Rachel|Georgia|Ellie|Lucy|Alice|Katie|Rebecca)\b[\s:,-]*/i;

function cleanKeyItemsChunk(c: string): string {
  return c
    .replace(LEADING_REP_RE, '')
    .replace(VERSION_STAMP_RE, '')
    .replace(/^[^A-Z0-9£]+/i, '')
    .replace(CALL_LOG_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseInitialEnquiryFromNotes(notes: string): string {
  const first = String(notes || '')
    .split(/\s*\|\s*|\n{2,}/)
    .map((s) => s.trim())
    .find(Boolean);
  if (!first) return '';
  const cleaned = cleanKeyItemsChunk(first);
  return cleaned.slice(0, 220);
}

/** Prefer keyword-rich key-detail chunks over version-tagged call-log noise. */
function parseKeyItemsFromNotes(notes: string, quoteVersion: string): string {
  const chunks = notes.split(/\s*\|\s*/).filter(Boolean);
  const verRe = new RegExp(`\\b${quoteVersion.replace('.', '\\.')}\\b`, 'i');

  const scored = chunks.map((c, i) => {
    let score = 0;
    const cleaned = cleanKeyItemsChunk(c);
    if (KEY_ITEM_TOKEN_RE.test(c) || KEY_ITEM_TOKEN_RE.test(cleaned)) score += 10;
    // Soft boost when chunk matches the active quote version, but not if it's only a stamp
    if (verRe.test(c) && KEY_ITEM_TOKEN_RE.test(c)) score += 2;
    if (CALL_LOG_RE.test(c)) score -= 8;
    if (VERSION_STAMP_RE.test(c.trim()) && !KEY_ITEM_TOKEN_RE.test(c)) score -= 5;
    if (LEADING_REP_RE.test(c) && !KEY_ITEM_TOKEN_RE.test(c)) score -= 4;
    // Prefer later note chunks (newer progress) when scores tie
    return { c, cleaned, score, i };
  });

  scored.sort((a, b) => b.score - a.score || b.i - a.i);

  for (const row of scored) {
    if (row.score < 10) break;
    const stripped = row.cleaned || cleanKeyItemsChunk(row.c);
    if (stripped.length >= 8 && KEY_ITEM_TOKEN_RE.test(stripped)) return stripped.slice(0, 220);
  }

  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (!verRe.test(c) || CALL_LOG_RE.test(c)) continue;
    const stripped = cleanKeyItemsChunk(c);
    if (stripped.length >= 8 && KEY_ITEM_TOKEN_RE.test(stripped)) return stripped.slice(0, 220);
  }

  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (KEY_ITEM_TOKEN_RE.test(c)) {
      const stripped = cleanKeyItemsChunk(c);
      if (stripped.length >= 8) return stripped.slice(0, 220);
    }
  }
  return '';
}

function parseBespokeFromNotes(notes: string): { label: string; amount: number } | null {
  const m =
    notes.match(/(?:£|\b)(\d{1,3}(?:,\d{3})*|\d+)\s*bar\s*tab/i) ||
    notes.match(/bar\s*tab[^£\d]{0,20}(?:£|\b)(\d{1,3}(?:,\d{3})*|\d+)/i);
  if (!m) return null;
  const amount = Number(String(m[1]).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { label: 'Bar tab', amount };
}

function inferAgentReferral(lead: QuoteLead, notes: string): boolean {
  if (/event agency|wedding planner\/agent|tagvenue outreach/i.test(lead.source || '')) return true;
  if (/agent/i.test(String(lead.status || ''))) return true;
  if (/\bIT IS AN AGENT\b|\bagent referral\b/i.test(notes)) return true;
  return false;
}

function inferCommissionPercent(agentReferral: boolean, notes: string): string {
  if (!agentReferral) return '0';
  if (/\bNO COMMISSION\b/i.test(notes)) return '0';
  return '10';
}

function inferMarginPercent(
  repeatClient: boolean,
  eventType: string,
  eventDate: string,
  market: string | undefined,
  notes: string,
): string {
  if (/\bSAME\s+MARGIN\s+AS\s+V/i.test(notes)) return '';
  if (repeatClient) return String(REPEAT_CLIENT_MARGIN * 100);
  const min = lookupMinMargin(eventType, eventDate, market);
  if (min != null) return String(Math.round(min * 1000) / 10);
  return String(NEW_CLIENT_MARGIN * 100);
}

function vesselsForVersion(notes: string, quoteVersion: string, fallback: string[]): string[] {
  const verNum = quoteVersion.match(/V(\d+)/i)?.[1];
  if (!verNum) return fallback;
  const blockRe = new RegExp(`V\\s*${verNum}[^|]{0,120}`, 'i');
  const block = notes.match(blockRe)?.[0] || '';
  if (/ELIZABETHAN/i.test(block)) return matchVessels('WEOTT VI (Elizabethan)');
  if (/\bROSE\b/i.test(block)) return matchVessels('WEOTT I (Rose)');
  if (/AVON|AVONTUUR/i.test(block)) return matchVessels('WEOTT II (Avontuur)');
  return fallback;
}

export function matchSourceType(rawSource: string | undefined, sourceTypes: string[]): string {
  if (!rawSource) return '';
  const found = sourceTypes.find((type) => rawSource.toLowerCase().startsWith(type.toLowerCase()));
  return found ?? '';
}

/** Build Quote Builder form + which fields were auto-filled from Sheets/lead. */
export function buildLeadPrefill<T extends Record<string, unknown>>(
  lead: QuoteLead | null,
  init: T,
  sourceTypes: string[],
  opts?: { skipGoldPlaybook?: boolean },
): LeadPrefillResult<T> {
  const prefilledKeys = new Set<string>();
  const prefilledLineIds = new Set<string>();
  const lowConfidenceKeys = new Set<string>();
  const ambiguousFields = new Set<string>();

  if (!lead) {
    return { data: { ...init }, prefilledKeys, prefilledLineIds, lowConfidenceKeys, ambiguousFields };
  }

  const notes = lead.progressNotes || '';
  const flex = leadSelectsFlexibleDate(lead);
  const quoteVersion = parseQuoteVersionFromNotes(notes);
  const eventType = matchEventType(lead.eventType) || lead.eventType || '';
  const wedding = /wedding|engagement/i.test(lead.eventType || eventType);
  const eventDate =
    parseEventDateForInput(lead.eventDateDisplay, lead.fullEventDate, flex) ||
    (flex ? '' : String(init.eventDate || ''));
  const guestParsed = parseGuestCountDetailed({
    groupSizeQuote: lead.groupSizeQuote,
    groupSize: lead.groupSize,
    quoteVersion,
  });
  const guestCount = guestParsed.ambiguous ? '' : guestParsed.value;
  if (guestParsed.ambiguous) ambiguousFields.add('guestCount');
  const guestCountHigh = parseGuestHigh(lead.groupSize, guestCount);
  const times = parseRequestedTimes(lead.requestedEventTimes, quoteVersion);
  const windowStart = times.departure || String(init.departure || '12:00');
  const windowFinish =
    times.disembarkation ||
    String(init.disembarkation || times.returnTime || init.returnTime || '17:00');
  const schedule = inferDepartureReturn(windowStart, windowFinish, times);
  const embarkation = schedule.embarkation;
  const disembarkation = schedule.disembarkation;

  let vesselType = matchVessels(lead.vessels);
  vesselType = vesselsForVersion(notes, quoteVersion, vesselType);

  const source = matchSourceType(lead.source, sourceTypes);
  const repeatClient = isRepeatYes(lead.repeatClient) || isRepeatClientSource(lead.source);
  const agentReferral = inferAgentReferral(lead, notes);
  const marginPercent = inferMarginPercent(repeatClient, eventType, eventDate, lead.market, notes);
  const commissionPercent = inferCommissionPercent(agentReferral, notes);
  const menuType = parseMenusFromNotes(notes, quoteVersion);
  const keyItems = parseKeyItemsFromNotes(notes, quoteVersion);
  const initialEnquiry = parseInitialEnquiryFromNotes(notes) || keyItems;
  const bespoke = parseBespokeFromNotes(notes);

  const goldEarly = goldTargetsFromRef(lead.referenceNumber);
  const goldForm = goldEarly?.form;
  const goldLabels = (goldForm?.costLineLabels as string[]) || [];
  const selectedLineIds =
    !opts?.skipGoldPlaybook && goldLabels.length
      ? lineIdsFromLabels(goldLabels)
      : defaultSelectedLineIds();

  const bespokeLines = [...((init.bespokeLines as { id: string; label: string; amount: number; enabled: boolean }[]) || [])];
  if (bespoke && bespokeLines[0]) {
    bespokeLines[0] = { ...bespokeLines[0], label: bespoke.label, amount: bespoke.amount, enabled: true };
  }

  const proposalCategory = wedding ? 'wedding' : 'corporate';
  const rateDate = rateEventDateFromLead(lead, eventDate, flex);
  const guestsN = parseFloat(guestCount) || 0;

  const noteFinance = parseProgressNotesFinance(notes, {
    quoteVersion,
    vesselUi: vesselType[0],
    eventDate: rateDate,
    dateFlexible: flex && !rateDate,
    embarkation,
    departure: schedule.departure,
    guests: guestsN,
  });

  const gold = goldTargetsFromRef(lead.referenceNumber);
  const sheetTargets = resolveSheetFinancialTargets(
    lead,
    {
      quoteVersion,
      vesselUi: vesselType[0],
      eventDate: rateDate,
      dateFlexible: flex && !rateDate,
      embarkation,
      departure: schedule.departure,
      guests: guestsN,
    },
    gold
      ? {
          weottCost: gold.goldQuoteWeottCost,
          marginPercent: gold.marginPercent,
          weeklyPeriod: String(gold.form.weeklyPeriod || ''),
          dayPeriod: String(gold.form.dayPeriod || ''),
          groupBracket: String(gold.form.groupBracket || ''),
          source: 'gold_scenario',
        }
      : null,
  );

  const rateParts = vesselType[0]
    ? buildRateParts({
        vesselUi: vesselType[0],
        weeklyPeriod: sheetTargets?.weeklyPeriod || noteFinance.weeklyPeriod,
        dayPeriod: sheetTargets?.dayPeriod || noteFinance.dayPeriod,
        groupBracket: sheetTargets?.groupBracket || noteFinance.groupBracket,
        eventDate: rateDate,
        dateFlexible: flex && !rateDate,
        embarkation,
        departure: schedule.departure,
        guests: guestsN,
      })
    : null;

  const weeklyPeriod = sheetTargets?.weeklyPeriod || rateParts?.weeklyPeriod || '';
  const dayPeriod = sheetTargets?.dayPeriod || rateParts?.dayPeriod || '';
  const groupBracket = sheetTargets?.groupBracket || rateParts?.groupBracket || '';

  const pack = resolveProposalPack({
    category: proposalCategory as 'corporate' | 'wedding',
    eventType: eventType || lead.eventType || '',
    guestCount,
    vesselHint: vesselType[0] || lead.vessels,
    eventDate: rateDate || eventDate,
    embarkation,
    departure: schedule.departure,
    disembarkation,
    dayPeriod,
    quoteVersion,
    progressNotes: notes,
    market: lead.market,
    repName: lead.assignedRep || lead.preparedBy || '',
  });

  const data = {
    ...init,
    source: source || init.source,
    repeatClient,
    agentReferral,
    vesselType,
    eventType: eventType || init.eventType,
    dateFlexible: flex,
    eventDate,
    guestCount,
    guestCountHigh,
    embarkation,
    disembarkation,
    departure: schedule.departure,
    returnTime: schedule.returnTime,
    menuType,
    marginPercent,
    discountPercent: '0',
    commissionPercent,
    selectedLineIds,
    bespokeLines,
    quoteVersion,
    keyItems,
    initialEnquiry,
    progressNotes: notes,
    budget: lead.budget || '',
    proposalCategory,
    noOfTables: tablesForVessel(vesselType[0]),
    weeklyPeriod,
    dayPeriod,
    groupBracket,
    templateId: pack.templateId || String(init.templateId || ''),
    requiresInserts: pack.requiresInserts,
    selectedInserts: pack.selectedInserts.length ? pack.selectedInserts : (init.selectedInserts as string[]) || [],
    proposalTimingsNotes: buildItineraryProposalText({
      embarkation,
      departure: schedule.departure,
      returnTime: schedule.returnTime,
      disembarkation,
    }),
    proposalTimingsAuto: true,
    packageWordingNotes: String(init.packageWordingNotes || ''),
  } as T;

  if (source) prefilledKeys.add('source');
  prefilledKeys.add('repeatClient');
  if (agentReferral) prefilledKeys.add('agentReferral');
  if (vesselType.length) prefilledKeys.add('vesselType');
  if (eventType) prefilledKeys.add('eventType');
  prefilledKeys.add('dateFlexible');
  if (eventDate) prefilledKeys.add('eventDate');
  if (guestCount) prefilledKeys.add('guestCount');
  if (guestCountHigh) prefilledKeys.add('guestCountHigh');
  if (times.departure) prefilledKeys.add('departure');
  if (times.returnTime) prefilledKeys.add('returnTime');
  if (times.departure || times.returnTime || times.embarkation) {
    prefilledKeys.add('embarkation');
    prefilledKeys.add('disembarkation');
  }
  if (menuType.length) prefilledKeys.add('menuType');
  if (marginPercent) prefilledKeys.add('marginPercent');
  prefilledKeys.add('discountPercent');
  if (commissionPercent !== '0' || agentReferral) prefilledKeys.add('commissionPercent');
  if (quoteVersion !== 'V1') prefilledKeys.add('quoteVersion');
  if (keyItems) prefilledKeys.add('keyItems');
  if (notes) prefilledKeys.add('progressNotes');
  if (lead.budget) prefilledKeys.add('budget');
  if (tablesForVessel(vesselType[0])) prefilledKeys.add('noOfTables');
  if (weeklyPeriod) prefilledKeys.add('weeklyPeriod');
  if (dayPeriod) prefilledKeys.add('dayPeriod');
  if (groupBracket) prefilledKeys.add('groupBracket');
  prefilledKeys.add('proposalCategory');
  if (pack.templateId) prefilledKeys.add('templateId');
  if (pack.requiresInserts) prefilledKeys.add('requiresInserts');
  if (pack.selectedInserts.length) prefilledKeys.add('selectedInserts');
  prefilledKeys.add('proposalTimingsNotes');
  if (String((data as { packageWordingNotes?: string }).packageWordingNotes || '').trim()) {
    prefilledKeys.add('packageWordingNotes');
  }

  if (bespoke || goldForm?.bespokeAmount) prefilledKeys.add('bespokeLines');

  const withGold = opts?.skipGoldPlaybook
    ? data
    : applyGoldScenarioPlaybook(lead.referenceNumber, data, prefilledKeys);

  if (!opts?.skipGoldPlaybook && goldLabels.length) {
    prefilledLineIds.clear();
    for (const id of lineIdsFromLabels(goldLabels)) prefilledLineIds.add(id);
  }

  return { data: withGold, prefilledKeys, prefilledLineIds, lowConfidenceKeys, ambiguousFields };
}

/** Re-infer version-sensitive fields when REP changes quote version. */
export function prefillForQuoteVersion<T extends Record<string, unknown>>(
  lead: QuoteLead | null,
  current: T,
  quoteVersion: string,
): Partial<{ data: Partial<T>; prefilledKeys: string[]; prefilledLineIds: string[] }> {
  if (!lead) return {};
  const goldEarly = goldTargetsFromRef(lead.referenceNumber);
  const notes = lead.progressNotes || '';
  const guestParsed = parseGuestCountDetailed({
    groupSizeQuote: lead.groupSizeQuote,
    groupSize: lead.groupSize,
    quoteVersion,
  });
  const guestCount = guestParsed.ambiguous ? '' : guestParsed.value;
  const times = parseRequestedTimes(lead.requestedEventTimes, quoteVersion);
  const vessels = vesselsForVersion(notes, quoteVersion, matchVessels(lead.vessels));
  const keys: string[] = ['quoteVersion'];
  const patch: Record<string, unknown> = { quoteVersion };
  if (guestCount) {
    patch.guestCount = guestCount;
    patch.guestCountHigh = parseGuestHigh(lead.groupSize, guestCount);
    keys.push('guestCount', 'guestCountHigh');
  }
  if (vessels.length) {
    patch.vesselType = vessels;
    patch.noOfTables = tablesForVessel(vessels[0]);
    keys.push('vesselType', 'noOfTables');
  } else if (!String((current as { noOfTables?: string }).noOfTables || '')) {
    patch.noOfTables = tablesForVessel(String(((current as { vesselType?: string[] }).vesselType || [])[0] || ''));
    if (patch.noOfTables) keys.push('noOfTables');
  }
  if (times.departure || times.returnTime || times.embarkation) {
    const sch = inferDepartureReturn(
      String(times.departure || current.departure || '12:00'),
      String(times.disembarkation || current.disembarkation || times.returnTime || current.returnTime || '17:00'),
      times,
    );
    patch.embarkation = sch.embarkation;
    patch.departure = sch.departure;
    patch.returnTime = sch.returnTime;
    patch.disembarkation = sch.disembarkation;
    keys.push('embarkation', 'departure', 'returnTime', 'disembarkation');
  }
  const merged = { ...current, ...patch } as T;
  const prefilledKeys = new Set(keys);
  const withGold = applyGoldScenarioPlaybook(lead.referenceNumber, merged, prefilledKeys);
  return {
    data: withGold as Partial<T>,
    prefilledKeys: [...prefilledKeys],
    prefilledLineIds: (goldEarly?.form?.costLineLabels as string[])?.length
      ? lineIdsFromLabels(goldEarly!.form!.costLineLabels as string[])
      : [],
  };
}

export type PrefillHealerTasks = {
  keyItems: boolean;
  collisionVeto: boolean;
};

function notesNeedKeyItemHealer_(notes: string, localKeyItems: string): boolean {
  if (localKeyItems.trim() || !notes.trim()) return false;
  const chunks = notes.split(/\s*\|\s*/).filter(Boolean);
  const mixedSameChunk = chunks.some((c) => KEY_ITEM_TOKEN_RE.test(c) && CALL_LOG_RE.test(c));
  const paraphrase =
    /\b(sit[- ]?down|seated dinner|two course|three course|canap)/i.test(notes) &&
    !/\b(HFB|2\s*CSD|2CSD|3\s*CSD|3CSD|SUB\s*CANS?)\b/i.test(notes);
  return mixedSameChunk || paraphrase;
}

/** Local leftover flags still sent to PrefillHealer; live Gemini matches catalogue labels. */
export function prefillHealerTasks(
  notes: string,
  _quoteVersion: string,
  localKeyItems: string,
): PrefillHealerTasks {
  const genericReception = COLLISION_TOKEN_RE.test(notes) && !EXPLICIT_COCKTAIL_RE.test(notes);
  const tvCollision = /\b(MIC|SCREEN|AWARDS?)\b/i.test(notes) && collisionTvUnsafe_(notes);
  return {
    keyItems: notesNeedKeyItemHealer_(notes, localKeyItems),
    collisionVeto: genericReception || tvCollision,
  };
}
