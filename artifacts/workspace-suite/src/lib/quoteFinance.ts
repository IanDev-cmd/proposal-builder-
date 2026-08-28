/**
 * Quote finance — Quote Builder 2026 formulas (live sheet, not guessed).
 *
 * Hours: departure → disembarkation; embark buffer is not billed; min 4.
 * YES line = Cost Mother SUMIFS(vessel, weekly, day, group) × multiplier:
 *   vessel / BG music / CONTIGENCY STAFF / Additional Chefs × 2 → × billed hours
 *   menus / cutlery / prosecco / disposable tableware / onboard wifi → × guests
 *   unlimited drinks (incl. prosecco) → × guests × billed hours
 *   event decor / table linen → × tables
 *   delivery, own food, WP Runner, in-house set fees, admin → set (no hours)
 *   Event Manager (in house) → × (billed + 4)
 *   Event Coordinator, chefs, catering assistants, wild CA → × (billed + 3)
 * Contingency D182 = SUM(D21:D179) * 0.0225; WEOTT D184 = SUM(D21:D182).
 * Margin C186 typed; D186 = C186*D184; D187 = D184+D186; VAT = 0.2*D187; Inc VAT = D187+D188.
 * WEOTT / line items stay 2dp. Client-facing margin, cost-to-client, VAT, grand round to nearest pound.
 *
 * Rates: Cost Mother (bundled snapshot or live CostRatesFetch overlay).
 * Flask /generate must NOT recalculate — pass-through only.
 */

import {
  getQuoteLines,
  defaultSelectedLineIds,
  type CatalogLine,
} from '@/lib/quoteBuilderCatalog';
import {
  buildRateParts,
  lookupMinMargin,
  lookupUnitRate,
  type RateKeyParts,
} from '@/lib/costMotherLookup';
import { formatProposalRef, formatEventDateForProposal } from '@/lib/goldScenarioCover';
import type { PackageWordingColumns } from '@/lib/goldPackageWording';
import { formatEventTimingsPayload, itineraryHours } from '@/lib/proposalTimings';
import { isQuoteInstructionKeyItems } from '@/lib/quoteKeyItems';
import { fullStaffName } from '@/lib/staffContacts';
import { formatPhoneDisplay, staffPhoneSlots } from '@/lib/phoneFormat';

export const CONTINGENCY_RATE = 0.0225;
export const VAT_RATE = 0.2;
export const REPEAT_CLIENT_MARGIN = 0.15;
export const NEW_CLIENT_MARGIN = 0.25;
/** Default Section 11 hours = billed + 3. Event Manager in house uses staffBuffer 4; CONTIGENCY STAFF uses billed hours only. */
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
  /** Legacy upgrade labels — display only; ticks on Cost Lines are the cost source. */
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
  const value = String(eventDate || '');
  return !value.trim() || /tbc/i.test(value);
}

export function isWeekendOrPeak(eventDate: string, dateFlexible?: boolean): boolean {
  if (isEventDateTbc(eventDate, dateFlexible)) return true;
  const parsed = new Date(eventDate);
  if (Number.isNaN(parsed.getTime())) return false;
  const day = parsed.getDay();
  return day === 0 || day === 5 || day === 6;
}

/** Hours from departure → disembarkation. Never includes the 15-minute embark buffer. */
export function eventHours(
  data: Pick<QuoteFormInput, 'embarkation' | 'departure' | 'returnTime' | 'disembarkation'>,
): number {
  return itineraryHours(data);
}

export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Client-facing totals — nearest whole pound, matching Cost Mother display. */
export function pound(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n + Number.EPSILON);
}

export function resolveSelectedLineIds(data: QuoteFormInput): string[] {
  const wedding = /wedding|engagement/i.test(data.eventType || '');
  // Honour the UI ticks exactly. Do not add catering menus from menuType — that
  // made Section 2's header include unchecked lines (walkthrough £2.9k vs £7.7k).
  const base = Array.isArray(data.selectedLineIds)
    ? [...data.selectedLineIds]
    : defaultSelectedLineIds(data.menuType || [], { wedding });
  return [...new Set(base)];
}

function multiplierValue(line: CatalogLine, hours: number, guests: number, tables: number): number {
  const billable = Math.max(hours, MIN_BILLABLE_HOURS);
  switch (line.multiplier) {
    case 'vessel_hours':
    case 'hours':
      return billable;
    case 'staff_hours':
      return billable + (line.staffBuffer ?? STAFF_HOURS_BUFFER);
    case 'guests':
      return guests;
    case 'guests_hours':
      return guests * billable;
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
        departure: data.departure,
        guests,
      })
    : null;

  const selected = new Set(resolveSelectedLineIds(data));
  const lines: LineCalc[] = [];
  const sectionTotals: Record<string, number> = {};
  const overrides = data.lineAmountOverrides || {};

  for (const line of getQuoteLines()) {
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
      const amount = Number(overrideAmt);
      lines.push({
        id: line.id,
        section: line.section,
        label: line.label,
        unitRate: amount,
        multiplier: 1,
        amount,
        note: 'Quote Sheet amount override',
      });
      sectionTotals[line.section] = (sectionTotals[line.section] || 0) + amount;
      continue;
    }
    const looked = lookupUnitRate(line.label, rateParts);
    if (looked.rate == null || !(looked.rate > 0)) {
      const note = looked.note || `No rate: ${line.label}`;
      notes.push(note);
      // Keep the row so Cost Lines UI can show "No rate" instead of a silent £0.00.
      lines.push({
        id: line.id,
        section: line.section,
        label: line.label,
        unitRate: 0,
        multiplier: 0,
        amount: 0,
        note,
      });
      continue;
    }
    const mult = multiplierValue(line, hours, guests, tables);
    const amount = looked.rate * mult;
    lines.push({
      id: line.id,
      section: line.section,
      label: line.label,
      unitRate: looked.rate,
      multiplier: mult,
      amount,
      note: looked.note,
    });
    sectionTotals[line.section] = (sectionTotals[line.section] || 0) + amount;
  }

  // Bespoke manual
  for (const b of data.bespokeLines || []) {
    if (!b.enabled || !b.amount) continue;
    const amount = Number(b.amount) || 0;
    lines.push({
      id: b.id,
      section: 'bespoke',
      label: b.label || 'Bespoke',
      unitRate: amount,
      multiplier: 1,
      amount,
    });
    sectionTotals.bespoke = (sectionTotals.bespoke || 0) + amount;
  }

  const subtotalBeforeContingency = lines.reduce((s, l) => s + l.amount, 0);
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
  const contingency = section.subtotalBeforeContingency * CONTINGENCY_RATE;
  const total = section.subtotalBeforeContingency + contingency;
  return { ...section, contingency, total };
}

/** Back-compat wrapper used by Forms.tsx. */
export function calcBaseCostBreakdown(data: QuoteFormInput) {
  const b = calcBaseCostNumbers(data);
  const vesselHire = b.sectionTotals.vessel || 0;
  const menuCost = b.sectionTotals.catering || 0;
  const upgradesTotal =
    (b.sectionTotals.entertainment || 0) +
    (b.sectionTotals.beverages || 0) +
    (b.sectionTotals.decor || 0) +
    (b.sectionTotals.decor_table || 0) +
    (b.sectionTotals.bespoke || 0);
  const fixedOps =
    (b.sectionTotals.in_house || 0) +
    (b.sectionTotals.staff || 0) +
    (b.sectionTotals.other || 0) +
    (b.sectionTotals.financial || 0) +
    (b.sectionTotals.catering_equipment || 0) +
    (b.sectionTotals.catering_surcharge || 0);
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
  const weottRaw =
    Number.isFinite(manual) && data.totalCost.trim() !== '' ? Number(manual) : autoTotal;

  const margin = marginRateFor(data);
  const marginRaw = weottRaw * margin;
  const costToClientPreDiscount = weottRaw + marginRaw;

  const discountPct = Math.min(100, Math.max(0, parseFloat(data.discountPercent || '') || 0)) / 100;
  const discountAmount = costToClientPreDiscount * discountPct;
  const costToClientRaw = costToClientPreDiscount - discountAmount;

  // Commission = value lost from profit (QB). Agent toggle defaults to 10% when blank.
  const explicitCommission = data.commissionPercent?.trim()
    ? Math.min(100, Math.max(0, parseFloat(data.commissionPercent) || 0)) / 100
    : null;
  const effectiveCommission =
    explicitCommission != null ? explicitCommission : data.agentReferral ? 0.1 : 0;
  const commissionAmount = costToClientRaw * effectiveCommission;
  const updatedProfit = marginRaw - discountAmount - commissionAmount;

  const vatRaw = costToClientRaw * VAT_RATE;
  const grandRaw = costToClientRaw + vatRaw;
  const guests = parseFloat(data.guestCount) || 0;
  const weottCost = money(weottRaw);
  const marginAmount = pound(marginRaw);
  const costToClient = pound(costToClientRaw);
  const vat = pound(vatRaw);
  const grand = pound(grandRaw);
  const costPerGuestExc = guests > 0 ? money(costToClient / guests) : 0;
  const costPerGuestInc = guests > 0 ? money(grand / guests) : 0;

  return {
    baseCost: weottCost,
    autoBaseCost: money(autoTotal),
    subtotalBeforeContingency: money(breakdown.subtotalBeforeContingency),
    contingency: money(breakdown.contingency),
    contingencyRate: CONTINGENCY_RATE,
    margin,
    marginAmount,
    costToClient,
    costToClientBeforeDiscount: pound(costToClientPreDiscount),
    discountPercent: discountPct,
    discountAmount: money(discountAmount),
    commissionPercent: effectiveCommission,
    commissionAmount: money(commissionAmount),
    updatedProfit: pound(updatedProfit),
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

/** Payload shape expected by Flask POST /generate. Money is UI-only (quoteFinance.ts). */
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
  packageWording?: PackageWordingColumns | Record<string, string[]>;
  menuLinks?: Record<string, string>;
  staffContact?: {
    name: string;
    title: string;
    phone: string;
    mobile?: string;
    email: string;
  };
  /** Raw lead full event date (e.g. Wednesday 2nd December 2026) for flexible display. */
  fullEventDate?: string;
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
    fullEventDate,
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
  const contactPhones = staffPhoneSlots(contact.phone, contact.mobile);
  const clientPhones = formatPhoneDisplay(lead?.phone);

  const preparedRaw = String(lead?.preparedBy || lead?.assignedRep || contact.name || '');
  const preparedBy = fullStaffName(preparedRaw.includes('|') ? preparedRaw.split('|')[0].trim() : preparedRaw);
  const quoteDate =
    `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} | Quotation valid for 28 days`;
  const nexusOut = {
    ...(nexusLead || lead || {}),
    preparedBy,
    assignedRep: lead?.assignedRep || lead?.preparedBy || preparedBy,
    contact_name: contact.name,
    contact_title: contact.title,
    contact_phone: contactPhones.phone,
    contact_mobile: contactPhones.mobile || undefined,
    contact_email: contact.email,
    phone: clientPhones || undefined,
  } as Record<string, unknown>;
  const eventDate = formatEventDateForProposal({
    eventDate: form.eventDate,
    dateFlexible: form.dateFlexible,
    fullEventDate:
      fullEventDate ||
      (typeof nexusLead?.fullEventDate === 'string' ? nexusLead.fullEventDate : undefined),
    eventDateDisplay: lead?.eventDateDisplay,
  });

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
    nexusLead: nexusOut,
    lead: {
      proposal_ref: formatProposalRef(lead?.referenceNumber, form.quoteVersion),
      reference_number: lead?.referenceNumber || undefined,
      quote_date: quoteDate,
      client_name: lead?.name,
      organisation: lead?.company,
      telephone: clientPhones || undefined,
      email: lead?.email,
      event_type: form.eventType,
      event_date: eventDate,
      date_flexible: Boolean(form.dateFlexible),
      event_timings: formatEventTimingsPayload(form),
      departure: form.departure || undefined,
      returnTime: form.returnTime || undefined,
      guest_range: guestRange,
      guest_quote_n: String(guests || lead?.groupSizeQuote || ''),
      prepared_by: preparedBy,
      contact_name: contact.name,
      contact_title: contact.title,
      contact_phone: contactPhones.phone,
      contact_mobile: contactPhones.mobile || undefined,
      contact_email: contact.email,
      budget: lead?.budget,
      vessels: form.vesselType.join(', ') || lead?.vessels,
      market: lead?.market,
      source: lead?.source,
      year_of_event: lead?.yearOfEvent,
      repeat_client: form.repeatClient ? 'YES' : 'NO',
      agent: form.agentReferral ? 'YES' : undefined,
      key_items: isQuoteInstructionKeyItems(form.keyItems || '') ? form.keyItems : undefined,
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
    departure: form.departure,
    returnTime: form.returnTime,
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
