import type { Lead } from '@/components/LeadPanel';
import { callAppsScript } from '@/lib/appsScriptClient';
import { parseLeadDataFetch } from '@/lib/contracts';
import { TimeoutError } from '@/lib/errors';
import { parseGuestCountDetailed } from '@/lib/parseGuestCount';
import { formatPhoneDisplay } from '@/lib/phoneFormat';
import { aliasFirst, toNexusLeadPayload } from '@/lib/sapphireLead';

function toInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function tabStatusFromLiveDead(liveDead: string, crmStatus: string): string {
  const ld = liveDead.replace(/\s+/g, ' ').trim().toLowerCase();
  if (ld.startsWith('live')) return 'live';
  if (ld.startsWith('book')) return 'booked';
  if (ld.startsWith('dead')) return 'dead';
  if (ld.includes('blacklist')) return 'blacklisted';
  const s = crmStatus.replace(/\s+/g, ' ').trim().toLowerCase();
  if (s.startsWith('book')) return 'booked';
  if (s.startsWith('dead')) return 'dead';
  if (s.includes('blacklist')) return 'blacklisted';
  if (s.includes('ongoing') || s.includes('no decision') || s === 'live') return 'live';
  return ld || s || 'live';
}

function mapRaw(raw: Record<string, unknown>, index: number): Lead {
  const name = aliasFirst(raw, 'name', 'Name') || '—';
  const email = aliasFirst(raw, 'email', 'Main Contact - Email') || '—';
  const ref = aliasFirst(raw, 'referenceNumber', 'Client Reference Number', 'code') || `#${index + 1}`;
  const designation = aliasFirst(raw, 'jobRole', 'designation', 'Main Contact - Job Role') || '—';
  const phone = formatPhoneDisplay(aliasFirst(raw, 'phone', 'Main Contact - Number')) || '—';
  const joined = aliasFirst(raw, 'enquiryDate', 'Enquiry Date', 'joined') || '—';
  const sector = aliasFirst(raw, 'companySector', 'sector', 'Company Sector') || '—';
  const source = aliasFirst(raw, 'source', 'Source') || '—';
  const company = aliasFirst(raw, 'companyName', 'company', 'Company Name') || '—';
  const crmStatus = aliasFirst(raw, 'status', 'Status');
  const liveDead = aliasFirst(raw, 'liveDead', 'Live/Dead', 'Live/Dead/ Blacklisted/Booked');
  const status = tabStatusFromLiveDead(liveDead, crmStatus);
  const preparedBy = aliasFirst(raw, 'preparedBy', 'Client Relationship Representative');
  const assignedRep = aliasFirst(raw, 'assignedRep') || preparedBy;
  const groupSize = aliasFirst(raw, 'groupSize', 'Group Size');
  const groupParsed = parseGuestCountDetailed({
    groupSizeQuote: raw.groupSizeQuote as number | string | null | undefined,
    groupSize,
  });
  const groupSizeQuote = groupParsed.ambiguous ? '' : groupParsed.value;
  const flexRaw = aliasFirst(raw, 'eventDateFlexible', 'Event Date - Flexible');
  const flexBool =
    raw.eventDateFlexibleBool === true ||
    raw.eventDateFlexibleBool === 'true' ||
    /yes|tbc|flex/i.test(flexRaw);
  const fullEventDate = aliasFirst(raw, 'fullEventDate', 'Full Event Date');
  const displayAlias = aliasFirst(raw, 'eventDateDisplay');
  const eventDateDisplay =
    displayAlias && !/^(date\s*)?tbc$/i.test(displayAlias)
      ? displayAlias
      : fullEventDate || (flexBool ? 'Date TBC' : '');
  const idRaw = raw.id ?? raw.row_number ?? index + 1;
  const id = typeof idRaw === 'number' ? idRaw : Number(idRaw) || index + 1;

  return {
    id,
    name,
    email,
    code: ref,
    designation,
    phone,
    joined,
    color: '#FF5A45',
    initials: toInitials(name === '—' ? '?' : name),
    sector,
    referenceNumber: ref,
    source,
    company,
    status,
    crmStatus: crmStatus || undefined,
    budget: aliasFirst(raw, 'budget', 'Budget') || undefined,
    repeatClient: aliasFirst(raw, 'repeatClient', 'Repeat Client') || undefined,
    preparedBy: preparedBy || undefined,
    assignedRep: assignedRep || undefined,
    liveDead: liveDead || undefined,
    eventType: aliasFirst(raw, 'eventType', 'Event Type') || undefined,
    fullEventDate: fullEventDate || undefined,
    eventDateFlexible: flexRaw || undefined,
    eventDateFlexibleBool: flexBool || undefined,
    eventDateDisplay: eventDateDisplay || undefined,
    requestedEventTimes: aliasFirst(raw, 'requestedEventTimes', 'Requested Event Times') || undefined,
    groupSize: groupSize || undefined,
    groupSizeQuote: groupSizeQuote || undefined,
    vessels: aliasFirst(raw, 'vessels', 'What vessel') || undefined,
    market: aliasFirst(raw, 'market', 'Market') || undefined,
    bestTimeToCall: aliasFirst(raw, 'bestTimeToCall', 'Best time to call') || undefined,
    yearOfEvent: aliasFirst(raw, 'yearOfEvent', 'Year of Event') || undefined,
    progressNotes: aliasFirst(raw, 'progressNotes') || undefined,
    quoteWeottCost: raw.quoteWeottCost as number | string | undefined,
    quotePackageCost: raw.quotePackageCost as number | string | undefined,
    quoteMarginPercent: raw.quoteMarginPercent as number | string | undefined,
    quoteWeeklyPeriod: aliasFirst(raw, 'quoteWeeklyPeriod', 'Weekly Period') || undefined,
    quoteDayPeriod: aliasFirst(raw, 'quoteDayPeriod', 'Day Period') || undefined,
    quoteGroupBracket: aliasFirst(raw, 'quoteGroupBracket', 'Group Bracket') || undefined,
    sapphire: toNexusLeadPayload(raw),
  };
}

export async function fetchLeadsFromWebhook(opts?: { signal?: AbortSignal }): Promise<Lead[]> {
  let data: unknown;
  try {
    data = await callAppsScript('LeadDataFetch', {}, { signal: opts?.signal, timeoutMs: 45_000 });
  } catch (err) {
    if (err instanceof TimeoutError) throw err;
    throw err instanceof Error
      ? err
      : new Error(`Could not reach LeadDataFetch: ${String(err)}`);
  }
  const parsed = parseLeadDataFetch(data);
  return parsed.leads.map((row, i) => mapRaw(row as Record<string, unknown>, i));
}
