/**
 * Live finance playbook — n8n webhooks → same prefill + calc the UI uses.
 * No AI. No frozen gold Quote Sheet JSON. No invented adversarial fixtures.
 */
import { N8N_BASE } from '@/lib/backendUrls';
import { parseCostRatesPayload, parseLeadDataFetch } from '@/lib/contracts';
import {
  parseCostMotherRows,
  setLiveCostMotherRates,
  getCostMotherMeta,
} from '@/lib/costMotherLookup';
import {
  setLiveCatalogLines,
  defaultSelectedLineIds,
  getQuoteLines,
  findLineByAlias,
} from '@/lib/quoteBuilderCatalog';
import liveQbScenarios from '@/lib/assets/liveQb2026Scenarios.json';
import { aliasFirst } from '@/lib/sapphireLead';
import { formatPhoneDisplay } from '@/lib/phoneFormat';
import { parseGuestCountDetailed } from '@/lib/parseGuestCount';
import { buildLeadPrefill } from '@/lib/leadPrefill';
import {
  calcFinancials,
  money,
  type QuoteFormInput,
} from '@/lib/quoteFinance';
import { cateringSectionMatchesSelectedLines } from '@/lib/cateringTotalParity';
import { formatEventTimingsPayload, itineraryHours } from '@/lib/proposalTimings';
import { financialParityReport, FINANCIAL_TOLERANCE } from '@/lib/financialParity';
import { resolveSheetFinancialTargets } from '@/lib/progressNotesFinance';
import { normalizeBespokeLines } from '@/lib/bespokeLines';
import type { QuoteLead } from '@/lib/quoteLeadStore';

type LiveQbLine = { label: string; amount?: number };
type LiveQbScenario = {
  sheetRef: string;
  weott: number;
  grand: number;
  marginPercent: number;
  form: Record<string, unknown>;
  bespokeAmount?: number;
  costLines: LiveQbLine[];
};

const LIVE_QB = liveQbScenarios as Record<string, LiveQbScenario>;
const QB2026_COMPLETE = Object.keys(LIVE_QB);

const SKIP_REFS: Record<string, string> = {
  'WE.18900': 'DEAD — not in Quote Builder 2026; guest range 50–65',
  'WE.18931': 'DEAD — not configured in Quote Builder 2026',
  'WE.18759': 'BOOKED — Quote Builder 2026 row missing (handover / older sheet)',
  'WE.18937': 'Agent inquiry, did not chase — no line-by-line quote',
  'WE.19091': 'Early stages — guest range 50–60, no exact headcount',
};

const SOURCE_TYPES = [
  'Build your event form',
  'Chatbot Form',
  'Form Submit (Sales)',
  'Emailed Us (Info)',
  'Emailed Us (Sales)',
  'Called Us',
  'Repeat Client',
  'Chat Service',
  'DMN',
  'Responded to Remarketing',
  'TagVenue',
  'TagVenue Outreach',
  'HireSpace',
  'HeadBox',
  'Booker Venue',
  'Event Agency',
  'Event Listing Platform',
];

const INIT: QuoteFormInput & Record<string, unknown> = {
  vesselType: [],
  eventType: '',
  eventDate: '',
  dateFlexible: false,
  guestCount: '',
  guestCountHigh: '',
  embarkation: '11:45',
  departure: '12:00',
  returnTime: '17:00',
  disembarkation: '18:00',
  menuType: [],
  repeatClient: false,
  agentReferral: false,
  totalCost: '',
  selectedUpgrades: [],
  selectedLineIds: defaultSelectedLineIds([]),
  bespokeLines: normalizeBespokeLines(),
  weeklyPeriod: '',
  dayPeriod: '',
  groupBracket: '',
  noOfTables: '',
  discountPercent: '0',
  commissionPercent: '',
};

export type LivePlaybookStep = { step: string; ok: boolean; detail: string };

export type LiveLeadRun = {
  ref: string;
  name: string;
  kind: 'qb2026' | 'skip';
  ok: boolean;
  steps: LivePlaybookStep[];
  weott?: number;
  sheetWeott?: number;
  hours?: number;
  yesLabels: string[];
};

export type LivePlaybookReport = {
  ok: boolean;
  mode: 'demo' | 'live';
  steps: LivePlaybookStep[];
  leads: LiveLeadRun[];
};

function step(name: string, ok: boolean, detail: string): LivePlaybookStep {
  return { step: name, ok, detail };
}

async function postWebhook(path: string, mode: 'demo' | 'live'): Promise<unknown> {
  const res = await fetch(`${N8N_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 180)}`);
  if (!text.trim()) throw new Error(`${path} empty body`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON`);
  }
}

function mapLead(raw: Record<string, unknown>, index: number): QuoteLead {
  const ref = aliasFirst(raw, 'referenceNumber', 'Client Reference Number') || `row-${index}`;
  const groupSize = aliasFirst(raw, 'groupSize', 'Group Size');
  const groupParsed = parseGuestCountDetailed({
    groupSizeQuote: raw.groupSizeQuote as number | string | null | undefined,
    groupSize,
  });
  return {
    id: Number(raw.id ?? raw.row_number ?? index) || index,
    name: aliasFirst(raw, 'name', 'Name') || '—',
    email: aliasFirst(raw, 'email', 'Main Contact - Email'),
    phone: formatPhoneDisplay(aliasFirst(raw, 'phone', 'Main Contact - Number')),
    designation: aliasFirst(raw, 'jobRole', 'Main Contact - Job Role'),
    company: aliasFirst(raw, 'companyName', 'Company Name'),
    referenceNumber: ref,
    initials: '—',
    color: '#FF5A45',
    source: aliasFirst(raw, 'source', 'Source'),
    budget: aliasFirst(raw, 'budget', 'Budget'),
    repeatClient: aliasFirst(raw, 'repeatClient', 'Repeat Client'),
    preparedBy: aliasFirst(raw, 'preparedBy', 'Client Relationship Representative'),
    assignedRep: aliasFirst(raw, 'assignedRep'),
    status: aliasFirst(raw, 'status', 'Status'),
    liveDead: aliasFirst(raw, 'liveDead', 'Live/Dead'),
    eventType: aliasFirst(raw, 'eventType', 'Event Type'),
    fullEventDate: aliasFirst(raw, 'fullEventDate', 'Full Event Date'),
    eventDateFlexible: aliasFirst(raw, 'eventDateFlexible', 'Event Date - Flexible'),
    eventDateFlexibleBool:
      raw.eventDateFlexibleBool === true || /yes|tbc|flex/i.test(String(raw.eventDateFlexibleBool || '')),
    eventDateDisplay: aliasFirst(raw, 'eventDateDisplay'),
    requestedEventTimes: aliasFirst(raw, 'requestedEventTimes', 'Requested Event Times'),
    groupSize,
    groupSizeQuote: groupParsed.ambiguous ? '' : groupParsed.value,
    vessels: aliasFirst(raw, 'vessels', 'What vessel'),
    market: aliasFirst(raw, 'market', 'Market'),
    progressNotes: aliasFirst(raw, 'progressNotes'),
    quoteWeottCost: raw.quoteWeottCost as number | string | undefined,
    quotePackageCost: raw.quotePackageCost as number | string | undefined,
    quoteMarginPercent: raw.quoteMarginPercent as number | string | undefined,
    quoteWeeklyPeriod: aliasFirst(raw, 'quoteWeeklyPeriod'),
    quoteDayPeriod: aliasFirst(raw, 'quoteDayPeriod'),
    quoteGroupBracket: aliasFirst(raw, 'quoteGroupBracket'),
    sapphire: Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v != null && String(v).trim() !== ''),
    ) as QuoteLead['sapphire'],
  };
}

function pickLeads(all: QuoteLead[]): { complete: QuoteLead[]; skipped: { lead?: QuoteLead; ref: string; reason: string }[] } {
  const byRef = new Map(all.map((l) => [l.referenceNumber.replace(/\s/g, ''), l]));
  const complete = QB2026_COMPLETE.map((ref) => byRef.get(ref)).filter(Boolean) as QuoteLead[];
  const skipped = Object.entries(SKIP_REFS).map(([ref, reason]) => ({
    ref,
    reason,
    lead: byRef.get(ref),
  }));
  return { complete, skipped };
}

function normLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/contigency/g, 'contingency')
    .replace(/[''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveQbLine(label: string) {
  const alias = findLineByAlias(label);
  if (alias) return alias;
  const lines = getQuoteLines();
  const exact = lines.find((l) => l.label === label);
  if (exact) return exact;
  const n = normLabel(label === 'WEOTT Providing' ? 'Own Food Surcharge' : label);
  return lines.find((l) => normLabel(l.label) === n) || null;
}

function applyLiveQb2026(
  form: QuoteFormInput & Record<string, unknown>,
  sc: LiveQbScenario,
): { form: QuoteFormInput; unmatched: string[] } {
  const unmatched: string[] = [];
  const ids: string[] = [];
  for (const row of sc.costLines) {
    const line = resolveQbLine(row.label);
    if (!line) unmatched.push(row.label);
    else ids.push(line.id);
  }
  const next: QuoteFormInput & Record<string, unknown> = {
    ...form,
    ...sc.form,
    selectedLineIds: [...new Set(ids)],
    marginOverride: sc.marginPercent / 100,
    marginPercent: String(sc.marginPercent),
  };
  if (sc.bespokeAmount && sc.bespokeAmount > 0) {
    next.bespokeLines = normalizeBespokeLines(undefined, {
      label: 'Bespoke (1)',
      amount: sc.bespokeAmount,
    });
  }
  return { form: next, unmatched };
}

function qbLineDiffs(
  fin: ReturnType<typeof calcFinancials>,
  sc: LiveQbScenario,
): string[] {
  const diffs: string[] = [];
  for (const row of sc.costLines) {
    if (row.amount == null) continue;
    const line = resolveQbLine(row.label);
    const actual = fin.lines.find((l) => l.id === line?.id);
    const amt = actual?.amount ?? 0;
    if (Math.abs(amt - row.amount) > 0.05) {
      diffs.push(`${row.label}: sheet £${row.amount.toFixed(2)} engine £${amt.toFixed(2)}`);
    }
  }
  return diffs;
}

function runOneLead(lead: QuoteLead, kind: LiveLeadRun['kind']): LiveLeadRun {
  const steps: LivePlaybookStep[] = [];
  const sc = LIVE_QB[lead.referenceNumber];
  const prefill = buildLeadPrefill(lead, INIT, SOURCE_TYPES, { skipGoldPlaybook: true });
  const applied = sc
    ? applyLiveQb2026(prefill.data as QuoteFormInput & Record<string, unknown>, sc)
    : { form: prefill.data as QuoteFormInput, unmatched: [] as string[] };
  const form = applied.form;
  const fin = calcFinancials(form);
  const catering = cateringSectionMatchesSelectedLines(form);
  const hours = itineraryHours(form);
  const timings = formatEventTimingsPayload(form);
  const yesLabels = fin.lines.map((l) => l.label);
  const targets = resolveSheetFinancialTargets(lead, {
    vesselUi: form.vesselType[0],
    eventDate: form.eventDate,
    dateFlexible: form.dateFlexible,
    embarkation: form.embarkation,
    departure: form.departure,
    guests: parseFloat(form.guestCount) || 0,
  });
  const parity = financialParityReport(fin, targets);

  steps.push(
    step(
      'Prefill + Quote Builder 2026 YES overlay',
      applied.unmatched.length === 0,
      sc
        ? `${sc.sheetRef} · ${form.vesselType[0]} · ${form.guestCount} pax · ${applied.unmatched.length ? `unmatched: ${applied.unmatched.join(', ')}` : `${yesLabels.length} YES lines`}`
        : `${prefill.prefilledKeys.size} fields (no QB overlay)`,
    ),
    step(
      'Catering header = ticked catering lines',
      catering.ok,
      `header £${catering.header.toFixed(2)} ticks £${catering.selectedSum.toFixed(2)}`,
    ),
    step(
      'Cover timings = departure→finish',
      !form.departure || timings.startsWith(form.departure),
      timings || '(none)',
    ),
    step(
      'Event hours from departure (not embark)',
      hours > 0 && (!sc || hours === 4),
      `${hours}h  embark ${form.embarkation} depart ${form.departure}`,
    ),
  );

  if (sc) {
    const diffs = qbLineDiffs(fin, sc);
    const weottDelta = money(fin.baseCost - sc.weott);
    const grandDelta = money(fin.grand - sc.grand);
    steps.push(
      step(
        'Line amounts vs Quote Builder 2026 cells',
        diffs.length === 0,
        diffs.length ? diffs.slice(0, 8).join(' · ') : 'all listed YES lines within £0.05',
      ),
      step(
        `WEOTT ${sc.sheetRef.replace(/!.*/, '')} vs engine`,
        Math.abs(weottDelta) <= FINANCIAL_TOLERANCE,
        `sheet £${sc.weott.toFixed(2)} engine £${fin.baseCost.toFixed(2)} Δ £${weottDelta.toFixed(2)}`,
      ),
      step(
        'Inc VAT vs Quote Builder 2026',
        Math.abs(grandDelta) <= Math.max(FINANCIAL_TOLERANCE, 0.05),
        `sheet £${sc.grand.toFixed(2)} engine £${fin.grand.toFixed(2)} Δ £${grandDelta.toFixed(2)} (margin ${sc.marginPercent}%)`,
      ),
    );
  } else if (targets?.weottCost != null) {
    const delta = money(fin.baseCost - targets.weottCost);
    steps.push(
      step(
        'WEOTT vs enquiry/sheet column',
        Math.abs(delta) <= FINANCIAL_TOLERANCE,
        `sheet £${targets.weottCost.toFixed(2)} calc £${fin.baseCost.toFixed(2)} Δ £${delta.toFixed(2)} (${targets.source})`,
      ),
    );
  }

  steps.push(
    step(
      'Parity package/VAT chain',
      !sc || parity.ok || Math.abs(fin.grand - sc.grand) <= FINANCIAL_TOLERANCE,
      `WEOTT £${fin.baseCost.toFixed(2)} grand £${fin.grand.toFixed(2)}`,
    ),
  );

  return {
    ref: lead.referenceNumber,
    name: lead.name,
    kind,
    ok: steps.every((s) => s.ok),
    steps,
    weott: fin.baseCost,
    sheetWeott: sc?.weott ?? targets?.weottCost,
    hours,
    yesLabels,
  };
}

export async function runLiveFinancialPlaybook(mode: 'demo' | 'live' = 'live'): Promise<LivePlaybookReport> {
  const steps: LivePlaybookStep[] = [];

  const defaultLabels = getQuoteLines()
    .filter((l) => defaultSelectedLineIds().includes(l.id))
    .map((l) => l.label);
  const forbiddenDefault = defaultLabels.filter((l) =>
    /cocktail|photographer|head chef|canapes|hot fork|street food/i.test(l),
  );
  steps.push(
    step(
      'Default YES (walkthrough 6–10)',
      forbiddenDefault.length === 0 &&
        defaultLabels.some((l) => /own food/i.test(l)) &&
        defaultLabels.some((l) => /background music/i.test(l)) &&
        defaultLabels.some((l) => /catering delivery/i.test(l)),
      defaultLabels.join(' · ') || '(none)',
    ),
  );

  let ratesRaw: unknown;
  try {
    ratesRaw = await postWebhook('CostRatesFetch', mode);
    const rates = parseCostRatesPayload(ratesRaw);
    const structured =
      rates.costMother ||
      parseCostMotherRows(
        ((rates.costMotherItems || rates.cateringRates || []) as Record<string, unknown>[]),
      );
    if (structured?.items?.length) {
      setLiveCostMotherRates(structured as Parameters<typeof setLiveCostMotherRates>[0]);
    }
    if (Array.isArray(rates.lines) && rates.lines.length) {
      setLiveCatalogLines(rates.lines);
    }
    const meta = getCostMotherMeta();
    steps.push(
      step(
        `CostRatesFetch (${mode})`,
        true,
        `${meta.source} · ${meta.itemCount} lines · live=${meta.live}`,
      ),
    );
  } catch (err) {
    steps.push(step('CostRatesFetch', false, err instanceof Error ? err.message : String(err)));
    return { ok: false, mode, steps, leads: [] };
  }

  let leads: QuoteLead[] = [];
  try {
    const raw = await postWebhook('LeadDataFetch', mode);
    const parsed = parseLeadDataFetch(raw);
    leads = (parsed.leads || []).map((row, i) => mapLead(row as Record<string, unknown>, i));
    steps.push(step(`LeadDataFetch (${mode})`, leads.length > 0, `${leads.length} enquiry rows`));
  } catch (err) {
    steps.push(step('LeadDataFetch', false, err instanceof Error ? err.message : String(err)));
    return { ok: false, mode, steps, leads: [] };
  }

  const picked = pickLeads(leads);
  steps.push(
    step(
      'Quote Builder 2026 complete rows from live enquiry',
      picked.complete.length === QB2026_COMPLETE.length,
      `found ${picked.complete.map((l) => l.referenceNumber).join(', ') || 'none'}`,
    ),
  );

  const skipRuns: LiveLeadRun[] = picked.skipped.map(({ ref, reason, lead }) => ({
    ref,
    name: lead?.name || '—',
    kind: 'skip',
    ok: true,
    steps: [
      step(
        'Cannot compute',
        true,
        `${reason} · enquiry Live/Dead=${lead?.liveDead || '?'} status=${lead?.status || '?'} guests=${lead?.groupSize || '?'}`,
      ),
    ],
    yesLabels: [],
  }));

  const runs = [...picked.complete.map((l) => runOneLead(l, 'qb2026')), ...skipRuns];
  const ok = steps.every((s) => s.ok) && runs.every((r) => r.ok);
  return { ok, mode, steps, leads: runs };
}

export function formatLivePlaybookReport(report: LivePlaybookReport): string {
  const lines: string[] = [
    `WEOTT live finance playbook — mode=${report.mode} (UX + backend webhooks, no AI)`,
    report.ok ? 'RESULT  PASS' : 'RESULT  FAIL',
    '',
    '== Pipeline ==',
  ];
  for (const s of report.steps) {
    lines.push(`  ${s.ok ? 'ok' : 'XX'}  ${s.step}: ${s.detail}`);
  }
  for (const lead of report.leads) {
    lines.push('');
    lines.push(
      `${lead.ok ? 'PASS' : 'FAIL'}  [${lead.kind}] ${lead.ref}  ${lead.name}  WEOTT £${(lead.weott ?? 0).toFixed(2)}${
        lead.sheetWeott != null ? `  sheet £${lead.sheetWeott.toFixed(2)}` : ''
      }  hours=${lead.hours ?? '?'}`,
    );
    for (const s of lead.steps) {
      lines.push(`      ${s.ok ? 'ok' : 'XX'}  ${s.step}: ${s.detail}`);
    }
    const preview = lead.yesLabels.slice(0, 12).join(' · ');
    lines.push(
      `      YES lines (${lead.yesLabels.length}): ${preview}${lead.yesLabels.length > 12 ? ' …' : ''}`,
    );
  }
  if (!report.leads.length) {
    lines.push('');
    lines.push('No leads selected. Check LeadDataFetch mode=live and that LIVE rows have vessel / guests / notes.');
  }
  return lines.join('\n');
}
