/**
 * Canonical Sapphire lead aliases emitted by Structure all Leads1
 * (now ported in NexusApi.gs). UI must prefer these keys over re-deriving
 * from sheet headers. Agent is intentionally absent (no Enquiry column).
 */

import { formatPhoneDisplay } from '@/lib/phoneFormat';

export const SAPPHIRE_LEAD_ALIASES = [
  'referenceNumber',
  'name',
  'companyName',
  'companySector',
  'email',
  'phone',
  'jobRole',
  'budget',
  'repeatClient',
  'preparedBy',
  'assignedRep', // derived = preparedBy
  'status',
  'liveDead',
  'source',
  'enquiryDate',
  'eventType',
  'fullEventDate',
  'eventDateFlexible',
  'eventDateFlexibleBool', // derived
  'eventDateDisplay', // derived — "Date TBC" when flexible
  'requestedEventTimes',
  'groupSize',
  'groupSizeQuote', // derived — lower bound
  'vessels',
  'market',
  'bestTimeToCall',
  'yearOfEvent',
  'progressNotes', // derived — Progress 1…N concat
  'quoteWeottCost',
  'quotePackageCost',
  'quoteMarginPercent',
  'quoteWeeklyPeriod',
  'quoteDayPeriod',
  'quoteGroupBracket',
] as const;

export type SapphireLeadAlias = (typeof SAPPHIRE_LEAD_ALIASES)[number];

export type SapphireLead = Partial<Record<SapphireLeadAlias, string | number | boolean>>;

/** Pick alias first (Sheets SoT), then optional sheet-header fallbacks. */
export function aliasFirst(
  row: Record<string, unknown>,
  alias: SapphireLeadAlias,
  ...fallbacks: string[]
): string {
  const primary = row[alias];
  if (primary !== undefined && primary !== null && String(primary).trim() !== '') {
    return String(primary);
  }
  for (const k of fallbacks) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  // fuzzy prefix on remaining keys (legacy raw sheet rows)
  const target = alias.toLowerCase();
  for (const [rk, rv] of Object.entries(row)) {
    const n = rk.replace(/\s+/g, ' ').trim().toLowerCase();
    if (n === target || n.startsWith(target)) {
      if (rv !== undefined && rv !== null && String(rv).trim() !== '') return String(rv);
    }
  }
  return '';
}

/** Preserve the full lead object for QuoteBuilder nexusLead pass-through. */
export function toNexusLeadPayload(row: Record<string, unknown>): SapphireLead {
  const out: SapphireLead = {};
  for (const key of SAPPHIRE_LEAD_ALIASES) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      out[key] = row[key] as string | number | boolean;
    }
  }
  if (typeof out.phone === 'string') out.phone = formatPhoneDisplay(out.phone);
  return out;
}
