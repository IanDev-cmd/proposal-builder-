/**
 * Quote finance — source of truth mirrors WEOTT Client Data & Quote Sheet.
 *
 * Sheets used:
 *  - Price Comparison Vessel & Event  → vessel hourly / package rates (cost to WEOTT)
 *  - Price Comparison (CATERING)      → menu cost-to-WEOTT per guest
 *  - Minimum target margin per event  → default margin by event type (simplified)
 *  - Quote Builder 2026 structure     → Base → Contingency → Margin → VAT
 *
 * Formula (Quote Builder / Process Financials):
 *   Base Cost = Vessel (hours × rate) + Σ(menu £pp × guests) + fixed ops + upgrades
 *   Contingency = Base × 2.25%
 *   Margin = (Base + Contingency) × marginRate  (repeat 15% / new 25% unless event override)
 *   Cost to Client = Base + Contingency + Margin
 *   VAT = Cost to Client × 20%
 *   Grand Total = Cost to Client + VAT
 *
 * Gaps awaiting Sapphire clarification are flagged in `notes`.
 */

export const CONTINGENCY_RATE = 0.0225;
export const VAT_RATE = 0.2;
export const REPEAT_CLIENT_MARGIN = 0.15;
export const NEW_CLIENT_MARGIN = 0.25;
export const FIXED_OPS_COST = 250;
/** Mandatory BBQ inclusion (Quote Sheet catering extras practice). */
export const FRUIT_SKEWER_PER_HEAD = 8;
/** Summer Event drinks inclusion when applicable. */
export const PIMMS_PROSECCO_PER_HEAD = 12;

/** Cost-to-WEOTT vessel rates from Price Comparison sheet. */
export type VesselRate =
  | { kind: 'hourly'; monThu: number; friSun: number; note?: string }
  | { kind: 'package_day'; monWed: number; thuSun: number; note?: string }
  | { kind: 'limo'; hours2: number; hours3: number; gratuity: number; note?: string };

export const VESSEL_COST_TO_WEOTT: Record<string, VesselRate> = {
  'WEOTT I (Rose)': { kind: 'hourly', monThu: 300, friSun: 330 },
  'London Rose (WEOTT I)': { kind: 'hourly', monThu: 300, friSun: 330 },
  'WEOTT II (Avontuur)': { kind: 'hourly', monThu: 315, friSun: 375 },
  Avontuur: { kind: 'hourly', monThu: 315, friSun: 375 },
  'WEOTT III (Golden Sal)': {
    kind: 'hourly',
    monThu: 347.5,
    friSun: 372.5,
    note: 'GS also has daytime/evening splits — using weekly peak until Sapphire clarifies',
  },
  'WEOTT IV (Vaulla)': { kind: 'hourly', monThu: 280, friSun: 325 },
  'WEOTT IV (Valulla)': { kind: 'hourly', monThu: 280, friSun: 325 },
  'WEOTT V (Dixie)': {
    kind: 'package_day',
    monWed: 2200,
    thuSun: 2600,
    note: 'Dixie listed as day-rate package on Price Comparison (client column used as proxy where cost blank)',
  },
  'WEOTT VI (Elizabethan)': { kind: 'package_day', monWed: 1500, thuSun: 1700 },
  'WEOTT VII (Edwardian)': { kind: 'package_day', monWed: 1100, thuSun: 1300 },
  'WEOTT Limo III (Bourne)': {
    kind: 'limo',
    hours2: 2000,
    hours3: 3000,
    gratuity: 0.12,
    note: 'Bourne / Yacht package + gratuity',
  },
  'Thames Limo (WEOTT Limo)': { kind: 'limo', hours2: 1200, hours3: 1500, gratuity: 0.08 },
};

/** Cost-to-WEOTT catering £ per guest (Price Comparison, WP standard). */
export const MENU_COST_TO_WEOTT_PP: Record<string, number> = {
  'Charcuterie Cups': 11.5,
  Canapés: 13.5,
  Canapes: 13.5,
  'Street Food': 16.0,
  'Substantial Canapes': 19.6,
  'Bowl Food': 24.0,
  'Dipping Mezze': 5.8,
  'Continental Breakfast': 9.5,
  'Charcuterie Station': 15.0,
  'Salad Bar': 16.5,
  Brunch: 18.2,
  'Burger Station': 16.5,
  'Light Bites': 16.9,
  Barbecue: 21.8,
  'Summer Barbecue': 21.8,
  'Traditional Pie Station': 20.7,
  'Hot Fork Buffet': 24.0, // approximate — confirm on Cost Mother Sheet
  '2-Course Seated Dinner': 35.35, // derived from Quote Builder 2026 V2 (£1767.5 / 50)
  'Two Course Seated Dinner': 35.35,
  'Three Course Seated Dinner': 42.0, // placeholder until Cost Mother Sheet confirmed
};

/** Upgrade catalogue — flat or per-guest; ids align with stargtm UPGRADE_CATALOGUE. */
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
  selectedUpgrades: string[];
  agentReferral?: boolean;
  /** When set, overrides repeat/new/event default margin (0–1). REP commercial judgment. */
  marginOverride?: number | null;
  dateFlexible?: boolean;
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

function resolveVesselRate(vesselLabel: string): VesselRate | null {
  if (VESSEL_COST_TO_WEOTT[vesselLabel]) return VESSEL_COST_TO_WEOTT[vesselLabel];
  const lower = vesselLabel.toLowerCase();
  for (const [k, v] of Object.entries(VESSEL_COST_TO_WEOTT)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  if (lower.includes('rose') || lower.includes('weott i')) return VESSEL_COST_TO_WEOTT['WEOTT I (Rose)'];
  if (lower.includes('avon')) return VESSEL_COST_TO_WEOTT['WEOTT II (Avontuur)'];
  if (lower.includes('golden') || lower.includes('sal')) return VESSEL_COST_TO_WEOTT['WEOTT III (Golden Sal)'];
  if (lower.includes('dixie')) return VESSEL_COST_TO_WEOTT['WEOTT V (Dixie)'];
  if (lower.includes('elizabeth')) return VESSEL_COST_TO_WEOTT['WEOTT VI (Elizabethan)'];
  if (lower.includes('edward')) return VESSEL_COST_TO_WEOTT['WEOTT VII (Edwardian)'];
  if (lower.includes('bourne') || lower.includes('yacht')) return VESSEL_COST_TO_WEOTT['WEOTT Limo III (Bourne)'];
  if (lower.includes('limo')) return VESSEL_COST_TO_WEOTT['Thames Limo (WEOTT Limo)'];
  return null;
}

export function calcVesselHire(data: QuoteFormInput): { amount: number; hours: number; notes: string[] } {
  const notes: string[] = [];
  const hours = eventHours(data);
  const peak = isWeekendOrPeak(data.eventDate, data.dateFlexible);
  if (isEventDateTbc(data.eventDate, data.dateFlexible)) {
    notes.push('Event date TBC — using peak (Fri–Sun) vessel rate to protect margin');
  }
  let total = 0;
  const vessels = data.vesselType.length ? data.vesselType : [];
  if (!vessels.length) {
    notes.push('No vessel selected — vessel hire = 0');
    return { amount: 0, hours, notes };
  }
  for (const v of vessels) {
    const rate = resolveVesselRate(v);
    if (!rate) {
      notes.push(`No Quote Sheet rate for "${v}" — skipped`);
      continue;
    }
    if (rate.kind === 'hourly') {
      const r = peak ? rate.friSun : rate.monThu;
      total += r * hours;
    } else if (rate.kind === 'package_day') {
      total += peak || new Date(data.eventDate).getDay() >= 4 ? rate.thuSun : rate.monWed;
      if (rate.note) notes.push(rate.note);
    } else if (rate.kind === 'limo') {
      const base = hours <= 2 ? rate.hours2 : rate.hours3;
      total += base * (1 + rate.gratuity);
      if (rate.note) notes.push(rate.note);
    }
  }
  return { amount: money(total), hours, notes };
}

export function calcCatering(data: QuoteFormInput): { amount: number; notes: string[] } {
  const notes: string[] = [];
  const guests = parseFloat(data.guestCount) || 0;
  let amount = 0;
  for (const menu of data.menuType) {
    const pp = MENU_COST_TO_WEOTT_PP[menu];
    if (pp == null) {
      notes.push(`No Quote Sheet catering rate for "${menu}" — skipped`);
      continue;
    }
    amount += pp * guests;
  }
  if (data.menuType.some((m) => /barbecue|bbq/i.test(m))) {
    amount += FRUIT_SKEWER_PER_HEAD * guests;
    notes.push('BBQ fruit skewer inclusion (+£8pp)');
  }
  if (data.eventType === 'Summer Event') {
    amount += PIMMS_PROSECCO_PER_HEAD * guests;
    notes.push("Summer Event Pimm's/Prosecco inclusion (+£12pp)");
  }
  return { amount: money(amount), notes };
}

export function calcUpgradesTotal(data: QuoteFormInput): number {
  const guests = parseFloat(data.guestCount) || 0;
  return money(
    UPGRADES.filter((u) => data.selectedUpgrades.includes(u.label)).reduce(
      (s, u) => s + (u.type === 'perGuest' ? u.price * guests : u.price),
      0,
    ),
  );
}

export function calcBaseCostBreakdown(data: QuoteFormInput) {
  const vessel = calcVesselHire(data);
  const catering = calcCatering(data);
  const upgradesTotal = calcUpgradesTotal(data);
  const fixedOps = FIXED_OPS_COST;
  const total = money(vessel.amount + catering.amount + fixedOps + upgradesTotal);
  return {
    vesselHire: vessel.amount,
    hours: vessel.hours,
    menuCost: catering.amount,
    fixedOps,
    upgradesTotal,
    total,
    peak: isWeekendOrPeak(data.eventDate, data.dateFlexible),
    notes: [...vessel.notes, ...catering.notes],
  };
}

export function marginRateFor(data: QuoteFormInput): number {
  if (data.marginOverride != null && Number.isFinite(data.marginOverride)) {
    return Math.min(1, Math.max(0, data.marginOverride));
  }
  if (data.repeatClient) return REPEAT_CLIENT_MARGIN;
  // Minimum target margin sheet — simplified defaults by event family
  const et = (data.eventType || '').toLowerCase();
  if (et.includes('transfer')) return 0.1;
  if (et.includes('meeting')) return 0.12;
  return NEW_CLIENT_MARGIN;
}

export function calcFinancials(data: QuoteFormInput) {
  const baseCost = parseFloat(data.totalCost) || 0;
  const upgradeTotal = calcUpgradesTotal(data);
  const contingency = money(baseCost * CONTINGENCY_RATE);
  const afterContingency = baseCost + contingency;
  const margin = marginRateFor(data);
  const marginAmount = money(afterContingency * margin);
  let costToClient = money(afterContingency + marginAmount);
  if (data.agentReferral) {
    costToClient = money(costToClient * 1.1);
  }
  const vat = money(costToClient * VAT_RATE);
  const grand = money(costToClient + vat);
  return {
    baseCost,
    contingency,
    contingencyRate: CONTINGENCY_RATE,
    margin,
    marginAmount,
    costToClient,
    vat,
    vatRate: VAT_RATE,
    grand,
    upgradeTotal,
  };
}

export function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
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
  /** Full Sapphire lead object for n8n Transform (nexusLead). */
  nexusLead?: Record<string, unknown> | null;
  templateId?: string;
  category?: 'corporate' | 'wedding';
  selectedInserts?: string[];
  progressNotes?: string;
  packageWording?: Record<string, string[]>;
  menuLinks?: Record<string, string>;
  /** From selected staff insert — overrides default Katherine contact. */
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

  const preparedBy =
    lead?.preparedBy || lead?.assignedRep || contact.name;
  const eventDate =
    form.dateFlexible || isEventDateTbc(form.eventDate, form.dateFlexible)
      ? 'Date TBC'
      : form.eventDate || lead?.eventDateDisplay || '';

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
      proposal_ref: lead?.referenceNumber || undefined,
      client_name: lead?.name,
      organisation: lead?.company,
      telephone: lead?.phone,
      email: lead?.email,
      event_type: form.eventType,
      event_date: eventDate,
      event_timings: `${form.embarkation || ''} - ${form.disembarkation || ''}`,
      guest_range: form.guestCount || lead?.groupSize,
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
    },
    calculations: {
      guests,
      package_cost: fin.costToClient,
      vat: fin.vat,
      grand_total: fin.grand,
    },
    selectedUpgrades: UPGRADES.filter((u) => form.selectedUpgrades.includes(u.label)).map((u) => u.id),
    selectedUpgradeLabels: form.selectedUpgrades,
    packageWording: packageWording || {},
    menuLinks: menuLinks || {},
    financials: {
      baseCost: fin.baseCost,
      contingency: fin.contingency,
      contingencyRate: fin.contingencyRate,
      margin: fin.margin,
      marginAmount: fin.marginAmount,
      costToClient: fin.costToClient,
      vat: fin.vat,
      vatRate: fin.vatRate,
      upgradeTotal: fin.upgradeTotal,
      grandTotal: fin.grand,
    },
    form,
    progressNotes: opts.progressNotes || lead?.progressNotes || '',
  };
}
