/**
 * Quote finance — mirrors WEOTT Quote Builder 2026 + Cost Mother Sheet.
 *
 * Sections 1–13 line costs (YES × unit rate × multiplier)
 * Section 14 Contingency = Σ(1–13) × 2.25%
 * Margin % (editable) → Cost to client (exc VAT)
 * VAT 20% → Grand total
 * Optional discount % + agent commission % → updated profit / £ per guest
 *
 * Rates: Cost Mother (bundled snapshot or live CostRatesFetch overlay).
 * n8n Transform must NOT recalculate — pass-through only.
 */

import {
  QUOTE_LINES,
  UPGRADE_TO_LINE_LABEL,
  defaultSelectedLineIds,
  resolveCostMotherMenu,
  type CatalogLine,
} from '@/lib/quoteBuilderCatalog';
import {
  buildRateParts,
  lookupMinMargin,
  lookupUnitRate,
  type RateKeyParts,
} from '@/lib/costMotherLookup';
import { formatProposalRef } from '@/lib/goldScenarioCover';

export const CONTINGENCY_RATE = 0.0225;
export const VAT_RATE = 0.2;
export const REPEAT_CLIENT_MARGIN = 0.15;
export const NEW_CLIENT_MARGIN = 0.25;
/** Staff billable hours = event hours + 3 (Quote Builder Section 11). */
export const STAFF_HOURS_BUFFER = 3;
/** Quote Sheet minimum hire / entertainment / staff base hours. */
export const MIN_BILLABLE_HOURS = 4;

/** @deprecated Prefer Cost Mother line catalogue — kept for PDF upgrade ids. */
export const UPGRADES: { label: string; price: number; type: 'flat' | 'perGuest'; id: string }[] = [
  { label: 'Live DJ', price: 500, type: 'flat', id: 'live_dj' },
  { label: 'Saxophonist', price: 550, type: 'flat', id: 'saxophonist' },
  { label: 'Karaoke', price: 550, type: 'flat', id: 'karaoke' },
  { label: 'Photo Booth', price: 650, type: 'flat', id: 'photo_booth' },
  { label: 'Close-up Magician', price: 700, type: 'flat', id: 'close_up_magician' },
  { label: 'Branded Vessel Flag', price: 150, type: 'flat', id: 'branded_vessel_flag' },
  { label: 'Acoustic Artist', price: 650, type: 'flat', id: 'acoustic_artist' },
  { label: 'Jazz and Sax Duo', price: 650, type: 'flat', id: 'jazz_sax_duo' },
  { label: 'Additional Hour on Board', price: 650, type: 'flat', id: 'extra_hour' },
  { label: 'Casino Table with Croupier', price: 700, type: 'flat', id: 'casino_table' },
  { label: 'Social Media Highlight Reel', price: 450, type: 'flat', id: 'social_highlight_reel' },
  { label: 'Mingling Tour Guide', price: 420, type: 'flat', id: 'mingling_guide' },
  { label: 'Bespoke Logo Bunting', price: 230, type: 'flat', id: 'logo_bunting' },
  { label: 'Unlimited Drinks (4 hrs)', price: 50, type: 'perGuest', id: 'unlimited_drinks' },
  { label: 'Drink Tokens', price: 7.5, type: 'perGuest', id: 'drink_tokens' },
  { label: 'Street Food Upgrade', price: 3.5, type: 'perGuest', id: 'street_food_upgrade' },
];

export type BespokeLine = { id: string; label: string; amount: number; enabled: boolean };

export type QuoteFormInput = {
  vesselType: string[];
  eventType: string;
  eventDate: string;
  guestCount: string;
  embarkation: string;
  departure: string;
  returnTime: string;
  disembarkation: string;
  menuType: string[];
  repeatClient: boolean;
  totalCost: string;
  /** Legacy upgrade labels — merged into selectedLineIds when present. */
  selectedUpgrades: string[];
  agentReferral?: boolean;
  marginOverride?: number | null;
  dateFlexible?: boolean;
  weeklyPeriod?: string;
  dayPeriod?: string;
  groupBracket?: string;
  noOfTables?: string;
  guestCountHigh?: string;
  keyItems?: string;
  quoteVersion?: string;
  /** Cost Mother line ids (YES). */
  selectedLineIds?: string[];
  /** Manual Section 7 amounts. */
  bespokeLines?: BespokeLine[];
  /**
   * Optional per-label amount overrides (Quote Sheet formula drift).
   * When set, that label uses the override instead of rate × multiplier.
   */
  lineAmountOverrides?: Record<string, number>;
  /** Discount % of cost-to-client exc VAT (0–100). */
  discountPercent?: string;
  /** Agent/listing commission % (0–100). */
  commissionPercent?: string;
};

export function isEventDateTbc(eventDate: string, dateFlexible?: boolean): boolean {
  if (dateFlexible) return true;
  return !eventDate.trim() || /tbc/i.test(eventDate);
}

export function isWeekendOrPeak(eventDate: string, dateFlexible?: boolean): boolean {
  if (isEventDateTbc(eventDate, dateFlexible)) return true;
  const parsed = new Date(eventDate);
  if (Number.isNaN(parsed.getTime())) return false;
  const day = parsed.getDay();
  return day === 0 || day === 5 || day === 6;
}

/** Hours from embarkation → disembarkation (fallback 4). */
export function eventHours(data: Pick<QuoteFormInput, 'embarkation' | 'disembarkation'>): number {
  const toMin = (t: string) => {
    const [h, m] = (t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const mins = toMin(data.disembarkation) - toMin(data.embarkation);
  if (!Number.isFinite(mins) || mins <= 0) return 4;
  return Math.max(1, Math.round((mins / 60) * 100) / 100);
}

export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function resolveSelectedLineIds(data: QuoteFormInput): string[] {
  const base =
    data.selectedLineIds && data.selectedLineIds.length
      ? [...data.selectedLineIds]
      : defaultSelectedLineIds(data.menuType || []);

  const set = new Set(base);
  // Sync menus → catering lines
  for (const menu of data.menuType || []) {
    const cm = resolveCostMotherMenu(menu);
    if (!cm) continue;
    const line = QUOTE_LINES.find((l) => l.section === 'catering' && l.label === cm);
    if (line) set.add(line.id);
  }
  // Legacy upgrades → Cost Mother lines
  for (const u of data.selectedUpgrades || []) {
    const label = UPGRADE_TO_LINE_LABEL[u];
    if (!label) continue;
    const line = QUOTE_LINES.find((l) => l.label === label);
    if (line) set.add(line.id);
  }
  return [...set];
}

function multiplierValue(line: CatalogLine, hours: number, guests: number, tables: number): number {
  const billable = Math.max(hours, MIN_BILLABLE_HOURS);
  switch (line.multiplier) {
    case 'vessel_hours':
    case 'hours':
      return billable;
    case 'staff_hours':
      return billable + STAFF_HOURS_BUFFER;
    case 'guests':
      return guests;
    case 'tables':
      return Math.max(0, tables);
    case 'set':
      return 1;
    default:
      return 1;
  }
}

export type LineCalc = {
  id: string;
  section: string;
  label: string;
  unitRate: number;
  multiplier: number;
  amount: number;
  note?: string;
};

export function calcSectionLines(data: QuoteFormInput): {
  lines: LineCalc[];
  hours: number;
  guests: number;
  tables: number;
  rateParts: RateKeyParts | null;
  notes: string[];
  sectionTotals: Record<string, number>;
  subtotalBeforeContingency: number;
} {
  const notes: string[] = [];
  const hours = eventHours(data);
  const guests = parseFloat(data.guestCount) || 0;
  const tables = parseFloat(data.noOfTables || '') || 0;
  const vesselUi = data.vesselType[0] || '';
  if (!vesselUi) notes.push('No vessel selected — Cost Mother rates need a vessel column');

  const rateParts = vesselUi
    ? buildRateParts({
        vesselUi,
        weeklyPeriod: data.weeklyPeriod,
        dayPeriod: data.dayPeriod,
        groupBracket: data.groupBracket,
        eventDate: data.eventDate,
        dateFlexible: data.dateFlexible,
        embarkation: data.embarkation,
        guests,
      })
    : null;

  const selected = new Set(resolveSelectedLineIds(data));
  const lines: LineCalc[] = [];
  const sectionTotals: Record<string, number> = {};
  const overrides = data.lineAmountOverrides || {};

  for (const line of QUOTE_LINES) {
    if (!selected.has(line.id)) continue;
    if (!rateParts) {
      lines.push({
        id: line.id,
        section: line.section,
        label: line.label,
        unitRate: 0,
        multiplier: 0,
        amount: 0,
        note: 'Missing vessel / rate key',
      });
      continue;
    }
    const overrideAmt = overrides[line.label];
    if (overrideAmt != null && Number.isFinite(overrideAmt)) {
      const amount = money(Number(overrideAmt));
      lines.push({
        id: line.id,
        section: line.section,
        label: line.label,
        unitRate: amount,
        multiplier: 1,
        amount,
        note: 'Quote Sheet amount override',
      });
      sectionTotals[line.section] = money((sectionTotals[line.section] || 0) + amount);
      continue;
    }
    const looked = lookupUnitRate(line.label, rateParts);
    if (looked.rate == null) {
      notes.push(looked.note || `No rate: ${line.label}`);
      continue;
    }
    const mult = multiplierValue(line, hours, guests, tables);
    const amount = money(looked.rate * mult);
    lines.push({
      id: line.id,
      section: line.section,
      label: line.label,
      unitRate: looked.rate,
      multiplier: mult,
      amount,
      note: looked.note,
    });
    sectionTotals[line.section] = money((sectionTotals[line.section] || 0) + amount);
  }

  // Bespoke manual
  for (const b of data.bespokeLines || []) {
    if (!b.enabled || !b.amount) continue;
    const amount = money(Number(b.amount) || 0);
    lines.push({
      id: b.id,
      section: 'bespoke',
      label: b.label || 'Bespoke',
      unitRate: amount,
      multiplier: 1,
      amount,
    });
    sectionTotals.bespoke = money((sectionTotals.bespoke || 0) + amount);
  }

  const subtotalBeforeContingency = money(lines.reduce((s, l) => s + l.amount, 0));
  return {
    lines,
    hours,
    guests,
    tables,
    rateParts,
    notes,
    sectionTotals,
    subtotalBeforeContingency,
  };
}

export function calcBaseCostNumbers(data: QuoteFormInput) {
  const section = calcSectionLines(data);
  const contingency = money(section.subtotalBeforeContingency * CONTINGENCY_RATE);
  const total = money(section.subtotalBeforeContingency + contingency);
  return { ...section, contingency, total };
}

/** Back-compat wrapper used by Forms.tsx. */
export function calcBaseCostBreakdown(data: QuoteFormInput) {
  const b = calcBaseCostNumbers(data);
  const vesselHire = b.sectionTotals.vessel || 0;
  const menuCost = b.sectionTotals.catering || 0;
  const upgradesTotal = money(
    (b.sectionTotals.entertainment || 0) +
      (b.sectionTotals.beverages || 0) +
      (b.sectionTotals.decor || 0) +
      (b.sectionTotals.decor_table || 0) +
      (b.sectionTotals.bespoke || 0),
  );
  const fixedOps = money(
    (b.sectionTotals.in_house || 0) +
      (b.sectionTotals.staff || 0) +
      (b.sectionTotals.other || 0) +
      (b.sectionTotals.financial || 0) +
      (b.sectionTotals.catering_equipment || 0) +
      (b.sectionTotals.catering_surcharge || 0),
  );
  return {
    vesselHire,
    hours: b.hours,
    menuCost,
    fixedOps,
    upgradesTotal,
    /** Sections 1–13 + contingency (Section 14) — WEOTT total cost. */
    total: b.total,
    subtotalBeforeContingency: b.subtotalBeforeContingency,
    contingency: b.contingency,
    sectionTotals: b.sectionTotals,
    lines: b.lines,
    rateParts: b.rateParts,
    peak: isWeekendOrPeak(data.eventDate, data.dateFlexible),
    notes: b.notes,
  };
}

export function calcUpgradesTotal(data: QuoteFormInput): number {
  return calcBaseCostBreakdown(data).upgradesTotal;
}

export function marginRateFor(data: QuoteFormInput): number {
  if (data.marginOverride != null && Number.isFinite(data.marginOverride)) {
    return Math.min(1, Math.max(0, data.marginOverride));
  }
  const fromMatrix = lookupMinMargin(data.eventType, data.eventDate);
  if (fromMatrix != null) return fromMatrix;
  if (data.repeatClient) return REPEAT_CLIENT_MARGIN;
  const et = (data.eventType || '').toLowerCase();
  if (et.includes('transfer')) return 0.1;
  if (et.includes('meeting')) return 0.12;
  return NEW_CLIENT_MARGIN;
}

export function calcFinancials(data: QuoteFormInput) {
  const breakdown = calcBaseCostBreakdown(data);
  // R184 Total Cost (to WEOTT) = Sections 1–13 + contingency. Manual totalCost overrides that total.
  const autoTotal = breakdown.total;
  const manual = parseFloat(data.totalCost);
  const weottCost =
    Number.isFinite(manual) && data.totalCost.trim() !== '' ? money(manual) : autoTotal;

  const margin = marginRateFor(data);
  const marginAmount = money(weottCost * margin);
  const costToClientPreDiscount = money(weottCost + marginAmount);

  const discountPct = Math.min(100, Math.max(0, parseFloat(data.discountPercent || '') || 0)) / 100;
  const discountAmount = money(costToClientPreDiscount * discountPct);
  const costToClient = money(costToClientPreDiscount - discountAmount);

  // Commission = value lost from profit (QB). Agent toggle defaults to 10% when blank.
  const explicitCommission = data.commissionPercent?.trim()
    ? Math.min(100, Math.max(0, parseFloat(data.commissionPercent) || 0)) / 100
    : null;
  const effectiveCommission =
    explicitCommission != null ? explicitCommission : data.agentReferral ? 0.1 : 0;
  const commissionAmount = money(costToClient * effectiveCommission);
  const updatedProfit = money(marginAmount - discountAmount - commissionAmount);

  const vat = money(costToClient * VAT_RATE);
  const grand = money(costToClient + vat);
  const guests = parseFloat(data.guestCount) || 0;
  const costPerGuestExc = guests > 0 ? money(costToClient / guests) : 0;
  const costPerGuestInc = guests > 0 ? money(grand / guests) : 0;

  return {
    baseCost: weottCost,
    autoBaseCost: autoTotal,
    subtotalBeforeContingency: breakdown.subtotalBeforeContingency,
    contingency: breakdown.contingency,
    contingencyRate: CONTINGENCY_RATE,
    margin,
    marginAmount,
    costToClient,
    costToClientBeforeDiscount: costToClientPreDiscount,
    discountPercent: discountPct,
    discountAmount,
    commissionPercent: effectiveCommission,
    commissionAmount,
    updatedProfit,
    vat,
    vatRate: VAT_RATE,
    grand,
    upgradeTotal: breakdown.upgradesTotal,
    costPerGuestExc,
    costPerGuestInc,
    sectionTotals: breakdown.sectionTotals,
    lines: breakdown.lines,
    rateParts: breakdown.rateParts,
    hours: breakdown.hours,
    notes: breakdown.notes,
  };
}

/** Payload shape expected by n8n Transform → stargtm /generate. */
export function buildStargtmPayload(opts: {
  form: QuoteFormInput;
  financials: ReturnType<typeof calcFinancials>;
  lead?: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    referenceNumber?: string;
    designation?: string;
    preparedBy?: string;
    assignedRep?: string;
    budget?: string;
    vessels?: string;
    market?: string;
    source?: string;
    yearOfEvent?: string;
    repeatClient?: string | boolean;
    eventDateDisplay?: string;
    eventDateFlexibleBool?: boolean;
    requestedEventTimes?: string;
    groupSize?: string;
    groupSizeQuote?: number | string;
    progressNotes?: string;
  } | null;
  nexusLead?: Record<string, unknown> | null;
  templateId?: string;
  category?: 'corporate' | 'wedding';
  selectedInserts?: string[];
  progressNotes?: string;
  packageWording?: Record<string, string[]>;
  menuLinks?: Record<string, string>;
  staffContact?: {
    name: string;
    title: string;
    phone: string;
    email: string;
  };
}) {
  const {
    form,
    financials: fin,
    lead,
    nexusLead,
    templateId,
    category,
    selectedInserts,
    packageWording,
    menuLinks,
    staffContact,
  } = opts;
  const guests = parseFloat(form.guestCount) || 0;
  const guestHigh = parseFloat(form.guestCountHigh || '') || 0;
  const lower = (form.eventType || '').toLowerCase();
  const resolvedCategory =
    category ||
    (lower.includes('wedding') || lower.includes('engagement') ? 'wedding' : 'corporate');
  const contact = staffContact || {
    name: 'Katherine Bulaon',
    title: 'Client Relationship Manager',
    phone: '020 8323 5827',
    email: 'sales@westendonthethames.com',
  };

  const preparedBy = lead?.preparedBy || lead?.assignedRep || contact.name;
  const eventDate =
    lead?.eventDateDisplay && !/^date tbc$/i.test(String(lead.eventDateDisplay).trim())
      ? String(lead.eventDateDisplay)
      : form.dateFlexible || isEventDateTbc(form.eventDate, form.dateFlexible)
        ? 'Date TBC'
        : form.eventDate || lead?.eventDateDisplay || '';

  const guestRange =
    guestHigh > guests
      ? `${guests}-${guestHigh}`
      : form.guestCount || lead?.groupSize || '';

  const selectedLineLabels = (fin.lines || []).map((l) => l.label);

  return {
    event_type: form.eventType,
    category: resolvedCategory,
    template_id: templateId || undefined,
    manual_template: Boolean(templateId),
    selectedInserts: selectedInserts || [],
    vessel: form.vesselType[0] || undefined,
    vessels: form.vesselType.join(', ') || lead?.vessels || undefined,
    budget: lead?.budget || undefined,
    nexusLead: nexusLead || lead || undefined,
    lead: {
      proposal_ref: formatProposalRef(lead?.referenceNumber, form.quoteVersion),
      client_name: lead?.name,
      organisation: lead?.company,
      telephone: lead?.phone,
      email: lead?.email,
      event_type: form.eventType,
      event_date: eventDate,
      event_timings: `${form.embarkation || ''} - ${form.disembarkation || ''}`,
      guest_range: guestRange,
      guest_quote_n: String(guests || lead?.groupSizeQuote || ''),
      prepared_by: preparedBy,
      contact_name: contact.name,
      contact_title: contact.title,
      contact_phone: contact.phone,
      contact_email: contact.email,
      budget: lead?.budget,
      vessels: form.vesselType.join(', ') || lead?.vessels,
      market: lead?.market,
      source: lead?.source,
      year_of_event: lead?.yearOfEvent,
      repeat_client: form.repeatClient ? 'YES' : 'NO',
      key_items: form.keyItems || undefined,
      quote_version: form.quoteVersion || undefined,
      weekly_period: form.weeklyPeriod || fin.rateParts?.weeklyPeriod,
      day_period: form.dayPeriod || fin.rateParts?.dayPeriod,
      group_bracket: form.groupBracket || fin.rateParts?.groupBracket,
      no_of_tables: form.noOfTables || undefined,
    },
    calculations: {
      guests,
      package_cost: fin.costToClient,
      vat: fin.vat,
      grand_total: fin.grand,
    },
    selectedUpgrades: UPGRADES.filter((u) => form.selectedUpgrades.includes(u.label)).map((u) => u.id),
    selectedUpgradeLabels: form.selectedUpgrades,
    selectedLineIds: resolveSelectedLineIds(form),
    selectedLineLabels,
    packageWording: packageWording || {},
    menuLinks: menuLinks || {},
    financials: {
      baseCost: fin.baseCost,
      subtotalBeforeContingency: fin.subtotalBeforeContingency,
      contingency: fin.contingency,
      contingencyRate: fin.contingencyRate,
      margin: fin.margin,
      marginAmount: fin.marginAmount,
      costToClient: fin.costToClient,
      costToClientBeforeDiscount: fin.costToClientBeforeDiscount,
      discountPercent: fin.discountPercent,
      discountAmount: fin.discountAmount,
      commissionPercent: fin.commissionPercent,
      commissionAmount: fin.commissionAmount,
      updatedProfit: fin.updatedProfit,
      vat: fin.vat,
      vatRate: fin.vatRate,
      upgradeTotal: fin.upgradeTotal,
      grandTotal: fin.grand,
      costPerGuestExc: fin.costPerGuestExc,
      costPerGuestInc: fin.costPerGuestInc,
      sectionTotals: fin.sectionTotals,
      hours: fin.hours,
      rateParts: fin.rateParts,
    },
    form,
    progressNotes: opts.progressNotes || lead?.progressNotes || '',
  };
}
