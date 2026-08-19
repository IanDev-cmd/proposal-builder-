/**
 * Quote Builder 2026 — Sections 1–14 line catalogue.
 * Labels match Cost Mother Sheet (WEOTT). Multipliers match QB formulas.
 */

export type LineMultiplier =
  | 'vessel_hours' // × event hours (Section 1)
  | 'guests' // × guests
  | 'hours' // × event hours
  | 'staff_hours' // × (event hours + 3)
  | 'tables' // × no. of tables
  | 'set'; // fixed set value

export type QuoteSectionId =
  | 'vessel'
  | 'catering'
  | 'catering_surcharge'
  | 'catering_equipment'
  | 'beverages'
  | 'entertainment'
  | 'bespoke'
  | 'decor'
  | 'decor_table'
  | 'in_house'
  | 'staff'
  | 'other'
  | 'financial'
  | 'contingency';

export type CatalogLine = {
  id: string;
  section: QuoteSectionId;
  label: string;
  multiplier: LineMultiplier;
  /** Always included when section defaults apply (REP can still remove). */
  defaultOn?: boolean;
  /** Auto-select when matching menu is chosen. */
  autoWithMenu?: RegExp;
  /**
   * Optional client-facing proposal phrasing (Prompt 3 scaffold).
   * When set, used instead of the raw Cost Mother label in package wording.
   */
  proposalWording?: string;
};

export const WEEKLY_PERIODS = ['Mon to Thur', 'Fri to Sun', 'Mon to Wed', 'Thur to Sun'] as const;
export const DAY_PERIODS = ['Daytime', 'Evening'] as const;
export const GROUP_BRACKETS = [
  'Standard',
  '1 to 199 guests',
  '200 to 335 guests',
  '1 to 249 guests',
  '250 to 400 guests',
] as const;
export const QUOTE_VERSIONS = ['V1', 'V2', 'V3', 'V4'] as const;

export const SECTION_META: { id: QuoteSectionId; title: string; hint?: string }[] = [
  { id: 'vessel', title: 'Section 1 — Vessel Cost', hint: 'Always on · × event hours' },
  { id: 'catering', title: 'Section 2 — Catering', hint: '× guests' },
  { id: 'catering_surcharge', title: 'Section 3 — Catering Surcharge', hint: 'Set value (own food)' },
  { id: 'catering_equipment', title: 'Section 4 — Catering Equipment', hint: '× guests · cutlery ratios' },
  { id: 'beverages', title: 'Section 5 — Beverages', hint: '× guests · min spend Dixie/Elizab £1800 · Edwardian £600' },
  { id: 'entertainment', title: 'Section 6 — Entertainment / Experience', hint: '× event hours' },
  { id: 'bespoke', title: 'Section 7 — Bespoke', hint: 'Manual amounts' },
  { id: 'decor', title: 'Section 8 — Decor', hint: '× event hours' },
  { id: 'decor_table', title: 'Section 9 — Decor by the Table', hint: '× tables' },
  { id: 'in_house', title: 'Section 10 — In House Costs', hint: 'Set value' },
  { id: 'staff', title: 'Section 11 — Event Staff', hint: '× (hours + 3)' },
  { id: 'other', title: 'Section 12 — Other', hint: 'Set value' },
  { id: 'financial', title: 'Section 13 — Financial Admin', hint: 'Set value' },
  { id: 'contingency', title: 'Section 14 — Contingency', hint: '2.25% of sections 1–13' },
];

function L(
  section: QuoteSectionId,
  label: string,
  multiplier: LineMultiplier,
  opts?: Partial<CatalogLine>,
): CatalogLine {
  const id = `${section}:${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return { id, section, label, multiplier, ...opts };
}

/** Full QB line catalogue (excl. bespoke manual rows — handled separately). */
export const QUOTE_LINES: CatalogLine[] = [
  L('vessel', 'Vessel/Venue Hire', 'vessel_hours', { defaultOn: true }),

  L('catering', 'Continental Breakfast', 'guests'),
  L('catering', 'Canapes (All Seasons)', 'guests'),
  L('catering', 'Substantial Canapes (All Sesons)', 'guests'),
  L('catering', 'Brunch/Or English Breakfast', 'guests'),
  L('catering', 'Bowl Food (All Seasons)', 'guests'),
  L('catering', 'Street Food Station (All Seasons)', 'guests'),
  L('catering', 'Charcuterie Cups (All Seasons)', 'guests'),
  L('catering', 'Afternoon Tea', 'guests'),
  L('catering', 'Charcuterie Station (All Seasons)', 'guests'),
  L('catering', 'Light Bites (All Season)', 'guests'),
  L('catering', 'Traditional Pie Station', 'guests'),
  L('catering', 'Hot Fork Buffet (All Seasons)', 'guests'),
  L('catering', 'Barbecue', 'guests'),
  L(
    'catering',
    'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
    'guests',
  ),
  L('catering', 'Three Course Seated Dinner (All Seasons)', 'guests'),
  L('catering', 'Burger Station', 'guests'),
  L('catering', 'Mini Desserts', 'guests'),
  L('catering', 'Desserts', 'guests'),
  L('catering', 'Fruit Skewers (Spring/Summer Only)', 'guests', {
    autoWithMenu: /barbecue|bbq/i,
  }),
  L('catering', 'Cranberry, chesnut & Goats cheese mini tart', 'guests'),
  // Cost Mother stores a flat £ fee (e.g. 153) — not a per-guest rate despite sitting under Sec 2.
  L('catering', 'Catering Delivery Charge (In every quote)', 'set', { defaultOn: true }),

  L('catering_surcharge', 'Own Food Surcharge', 'set'),

  L('catering_equipment', 'Dessert/Starter Spoon', 'guests'),
  L('catering_equipment', 'Starter fork', 'guests'),
  L('catering_equipment', 'Starter Knife', 'guests'),
  L('catering_equipment', 'Tea Spoon', 'guests'),
  L('catering_equipment', 'Soup Spoons', 'guests'),
  L('catering_equipment', 'Dinner Forks', 'guests'),
  L('catering_equipment', 'Dinner Knife', 'guests'),
  L('catering_equipment', 'Butter Knife', 'guests'),
  L('catering_equipment', 'Rice Bowl', 'guests'),
  L('catering_equipment', 'Soup Plate', 'guests'),
  L('catering_equipment', 'Small Plates', 'guests'),
  L('catering_equipment', 'Dinner Plates', 'guests'),
  L('catering_equipment', 'Cutlery Linen', 'guests'),
  L('catering_equipment', 'Disposable Napkins', 'guests'),
  L(
    'catering_equipment',
    'Delivery charge for cutlery and linen (or contigency for lost/damage items)',
    'guests',
  ),

  L('beverages', 'Reception drink - Pimms', 'guests'),
  L('beverages', 'Reception drink - Mulled Wine', 'guests'),
  L('beverages', 'Reception drink - Prosecco', 'guests'),
  L('beverages', 'Reception drink - Champagne', 'guests'),
  L('beverages', 'Drink tokens - x 2', 'guests'),
  L('beverages', 'Drink tokens - x 3', 'guests'),
  L('beverages', 'Drink tokens - x 4', 'guests'),
  L('beverages', 'Half a bottle of wine with dinner', 'guests'),
  L('beverages', 'Tea/Coffee', 'guests'),
  L('beverages', 'Unlimited Drinks', 'guests'),
  L('beverages', 'Unlimited Drinks (with Prosecco)', 'guests'),
  L('beverages', 'Prosecco hour', 'guests'),
  L('beverages', 'Champagne hour', 'guests'),
  L('beverages', 'Cocktail Reception (1 x glass per guest)', 'guests'),

  L('entertainment', 'Background Music/Sound Equipment Hire', 'hours'),
  L('entertainment', 'DJ (now need to pair with the above item)', 'hours'),
  L('entertainment', 'Live Band - 4 piece', 'hours'),
  L('entertainment', 'Live Band - 3 piece', 'hours'),
  L('entertainment', 'Live Acoustic', 'hours'),
  L('entertainment', 'Steel Band', 'hours'),
  L('entertainment', 'Jazz Duo', 'hours'),
  L('entertainment', 'Piano Ben', 'hours'),
  L('entertainment', 'Saxophonist', 'hours'),
  L('entertainment', 'Piano Bingo', 'hours'),
  L('entertainment', 'Karaoke', 'hours'),
  L('entertainment', 'Magician', 'hours'),
  L('entertainment', 'Tour Guide', 'hours'),
  L('entertainment', 'Team building activities with performance coach', 'hours'),
  L('entertainment', 'Casino table with croupier - x 1', 'hours', {
    proposalWording: 'Casino table with professional croupier',
  }),
  L('entertainment', 'Casino table with croupier - x 2', 'hours', {
    proposalWording: 'Two casino tables with professional croupiers',
  }),
  L('entertainment', 'Photobooth', 'hours', {
    proposalWording: 'Interactive photobooth experience for your guests',
  }),
  L('entertainment', 'Chocolate fountain', 'hours'),
  L('entertainment', 'Dessert Treat Table (Combination of sweet and dessert treats)', 'hours'),
  L('entertainment', 'Wine Tasting', 'hours'),

  L('decor', 'Astro Turf', 'hours'),
  L('decor', 'Rattan Set - 7 seater with coffee table', 'hours'),
  L('decor', 'Red Carpet 4m', 'hours'),
  L('decor', 'Red Carpet 6m', 'hours'),
  L('decor', 'Bean Bags x 4', 'hours'),
  L('decor', 'Roll Up Banner x 1', 'hours'),
  L('decor', 'Branded Backdrop Banner', 'hours'),
  L('decor', 'Welcome Board', 'hours'),
  L('decor', 'TV - 50"', 'hours'),
  L('decor', 'TV - 55"', 'hours'),
  L('decor', 'TV - 65"', 'hours'),
  L('decor', 'Projector and Screen with PA', 'hours'),
  L('decor', 'Stationary (Pens/Paper)', 'hours'),
  L('decor', 'White Board', 'hours'),
  L('decor', 'Boat Flag', 'hours'),
  L('decor', 'Bunting', 'hours'),
  L('decor', 'Flower/Plant Wall', 'hours'),
  L('decor', 'Onboard WiFi', 'hours'),

  L('decor_table', 'Flowers or Xmas Centrepiece - Corporate/Special', 'tables'),
  L('decor_table', 'Flowers - Wedding', 'tables'),
  // Quote Sheet bills Festive Crackers × guests (not tables)
  L('decor_table', 'Festive Crackers', 'guests'),
  L('decor_table', 'Table Linen & Runner', 'tables'),
  L('decor_table', 'Event Decor (Add to every quote)', 'tables', { defaultOn: true }),
  L('decor_table', 'Disposable tableware (Add to street food quotes ONLY)', 'tables', {
    autoWithMenu: /street food/i,
  }),

  L('in_house', 'Project Management - Corporate/Special', 'set'),
  L('in_house', 'Project Management - Wedding', 'set'),
  L('in_house', 'Pier Coordinator', 'set'),
  L('in_house', 'Unit Management (Packing team)', 'set'),

  L('staff', 'Event Manager (In house member of team)', 'staff_hours'),
  L('staff', 'Event Coordinator (In house member of team)', 'staff_hours'),
  L('staff', 'Event Assistant x 1', 'staff_hours'),
  L('staff', 'Event Assistants x 2', 'staff_hours'),
  L('staff', 'WP Runner', 'staff_hours'),
  L('staff', 'Wild Catering Assistant', 'staff_hours'),
  L('staff', 'Head Chef x 1', 'staff_hours'),
  L('staff', 'Chef De Partie', 'staff_hours'),
  L('staff', 'Catering Assistant x 1', 'staff_hours'),
  L('staff', 'Catering Assistant x 2', 'staff_hours'),
  L('staff', 'Catering Assistant x 3', 'staff_hours'),
  L('staff', 'Catering Assistant x 4', 'staff_hours'),
  // Photographers billed × event hours on Quote Sheet (not staff_hours)
  L('staff', 'Photographer - Corporate/Special', 'hours'),
  L('staff', 'Photographer - Wedding', 'hours'),
  L('staff', 'Videographer', 'staff_hours'),
  L('staff', 'Security x 1', 'staff_hours'),
  // CONTIGENCY STAFF billed × event hours on Quote Sheet
  L('staff', 'CONTIGENCY STAFF', 'hours'),
  L('staff', 'Additional Chefs x 2 (for all seated dinners)', 'staff_hours', {
    autoWithMenu: /seated dinner|2csd|3csd|fine dining/i,
  }),

  L('other', 'Van Courier', 'set'),
  L('other', 'Staff Taxi or Train Cost', 'set'),
  L('other', 'Additional Pier Stop - x 1', 'set'),
  L('other', 'Embark and Disembark', 'set'),
  L('other', 'Pack Down Fee', 'set'),
  L('other', 'Stationary', 'set', {
    proposalWording: 'Personalised digital invitation and on-board stationery suite',
  }),
  L('other', 'Welcome and Thank You Pack', 'set', {
    proposalWording: 'Welcome and thank-you guest packs on arrival and departure',
  }),
  L('other', 'Graphic Work (Design & Print) + Gift Vouchers', 'set', {
    proposalWording: 'Bespoke graphic design, print, and gift vouchers',
  }),
  L('other', "Catering/Staff Food Contigency (ADD TO ALL QUOTES)", 'set', { defaultOn: true }),
  L('other', "Event Manager 'Creative Kitty'", 'set'),

  L('financial', 'Financial Admin Fee - Carly', 'set'),
  L('financial', 'Financial Admin Fee - Shilen', 'set'),
];

/** UI vessel label → Cost Mother vessel name. */
export const VESSEL_TO_COST_MOTHER: Record<string, string> = {
  'WEOTT I (Rose)': 'London Rose',
  'London Rose (WEOTT I)': 'London Rose',
  'London Rose': 'London Rose',
  'WEOTT II (Avontuur)': 'Avontuur',
  Avontuur: 'Avontuur',
  'WEOTT III (Golden Sal)': 'Golden Salamander',
  'Golden Salamander': 'Golden Salamander',
  'WEOTT IV (Vaulla)': 'Alternative Vessel',
  'WEOTT IV (Valulla)': 'Alternative Vessel',
  'WEOTT V (Dixie)': 'Dixie Queen',
  'Dixie Queen': 'Dixie Queen',
  'WEOTT VI (Elizabethan)': 'Elizabethan',
  Elizabethan: 'Elizabethan',
  'WEOTT VII (Edwardian)': 'Edwardian',
  Edwardian: 'Edwardian',
  'WEOTT Limo III (Bourne)': 'Thames Limo',
  'Thames Limo (WEOTT Limo)': 'Thames Limo',
  'Thames Limo': 'Thames Limo',
  Erasmus: 'Erasmus',
};

/** Menu Type UI labels → Cost Mother catering labels. */
export const MENU_TO_COST_MOTHER: Record<string, string> = {
  'Charcuterie Cups': 'Charcuterie Cups (All Seasons)',
  'Charcuterie Cups (All Seasons)': 'Charcuterie Cups (All Seasons)',
  Canapés: 'Canapes (All Seasons)',
  Canapes: 'Canapes (All Seasons)',
  'Canapes (All Seasons)': 'Canapes (All Seasons)',
  'Street Food': 'Street Food Station (All Seasons)',
  'Street Food Station': 'Street Food Station (All Seasons)',
  'Street Food Station (All Seasons)': 'Street Food Station (All Seasons)',
  'Substantial Canapes': 'Substantial Canapes (All Sesons)',
  'Substantial Canapes (All Seasons)': 'Substantial Canapes (All Sesons)',
  'Substantial Canapes (All Sesons)': 'Substantial Canapes (All Sesons)',
  'Bowl Food': 'Bowl Food (All Seasons)',
  'Bowl Food (All Seasons)': 'Bowl Food (All Seasons)',
  'Continental Breakfast': 'Continental Breakfast',
  'Charcuterie Station': 'Charcuterie Station (All Seasons)',
  'Charcuterie Station (All Seasons)': 'Charcuterie Station (All Seasons)',
  Brunch: 'Brunch/Or English Breakfast',
  'Brunch / English Breakfast': 'Brunch/Or English Breakfast',
  'Brunch/Or English Breakfast': 'Brunch/Or English Breakfast',
  'Afternoon Tea': 'Afternoon Tea',
  'Burger Station': 'Burger Station',
  'Light Bites': 'Light Bites (All Season)',
  'Light Bites (All Seasons)': 'Light Bites (All Season)',
  'Light Bites (All Season)': 'Light Bites (All Season)',
  Barbecue: 'Barbecue',
  'Summer Barbecue': 'Barbecue',
  'Traditional Pie Station': 'Traditional Pie Station',
  'Hot Fork Buffet': 'Hot Fork Buffet (All Seasons)',
  'Hot Fork Buffet (All Seasons)': 'Hot Fork Buffet (All Seasons)',
  '2-Course Seated Dinner':
    'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
  'Two Course Seated Dinner':
    'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
  'Two Course Seated Dinner - Main & Dessert (All Seasons)':
    'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
  'Two Course Seated Dinner - Starter & Main (All Seasons)':
    'Two Course Seated Dinner - Main & Dessert OR Starter & Main (All Seasons)',
  'Three Course Seated Dinner': 'Three Course Seated Dinner (All Seasons)',
  'Three Course Seated Dinner (All Seasons)': 'Three Course Seated Dinner (All Seasons)',
};

/** Legacy upgrade labels → Cost Mother entertainment/beverage lines (for migration). */
export const UPGRADE_TO_LINE_LABEL: Record<string, string> = {
  'Live DJ': 'DJ (now need to pair with the above item)',
  Saxophonist: 'Saxophonist',
  Karaoke: 'Karaoke',
  'Photo Booth': 'Photobooth',
  'Close-up Magician': 'Magician',
  'Acoustic Artist': 'Live Acoustic',
  'Jazz and Sax Duo': 'Jazz Duo',
  'Casino Table with Croupier': 'Casino table with croupier - x 1',
  'Mingling Tour Guide': 'Tour Guide',
  'Branded Vessel Flag': 'Boat Flag',
  'Bespoke Logo Bunting': 'Bunting',
  'Unlimited Drinks (4 hrs)': 'Unlimited Drinks',
  'Drink Tokens': 'Drink tokens - x 2',
};

export function resolveCostMotherVessel(uiVessel: string): string | null {
  if (VESSEL_TO_COST_MOTHER[uiVessel]) return VESSEL_TO_COST_MOTHER[uiVessel];
  const lower = uiVessel.toLowerCase();
  for (const [k, v] of Object.entries(VESSEL_TO_COST_MOTHER)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  if (lower.includes('rose')) return 'London Rose';
  if (lower.includes('avon')) return 'Avontuur';
  if (lower.includes('golden') || lower.includes('sal')) return 'Golden Salamander';
  if (lower.includes('dixie')) return 'Dixie Queen';
  if (lower.includes('elizabeth')) return 'Elizabethan';
  if (lower.includes('edward')) return 'Edwardian';
  if (lower.includes('erasmus')) return 'Erasmus';
  if (lower.includes('limo') || lower.includes('bourne')) return 'Thames Limo';
  return null;
}

export function resolveCostMotherMenu(uiMenu: string): string | null {
  if (MENU_TO_COST_MOTHER[uiMenu]) return MENU_TO_COST_MOTHER[uiMenu];
  const lower = uiMenu.toLowerCase().replace(/\(all seasons?\)/gi, '').trim();
  for (const [k, v] of Object.entries(MENU_TO_COST_MOTHER)) {
    const kk = k.toLowerCase().replace(/\(all seasons?\)/gi, '').trim();
    if (lower === kk || lower.includes(kk) || kk.includes(lower)) return v;
  }
  return null;
}

const SECTION_IDS = new Set<QuoteSectionId>([
  'vessel',
  'catering',
  'catering_surcharge',
  'catering_equipment',
  'beverages',
  'entertainment',
  'bespoke',
  'decor',
  'decor_table',
  'in_house',
  'staff',
  'other',
  'financial',
  'contingency',
]);

const MULTIPLIERS = new Set<LineMultiplier>([
  'vessel_hours',
  'guests',
  'hours',
  'staff_hours',
  'tables',
  'set',
]);

function normLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function lineId(section: string, label: string): string {
  return `${section}:${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

let liveCatalogLines: CatalogLine[] | null = null;

/** Extra Cost Mother lines from n8n / Apps Script catalog (new rows appear as cards). */
export function setLiveCatalogLines(
  lines: Array<{ id?: string; section?: string; label?: string; multiplier?: string }> | null,
): void {
  if (!lines?.length) {
    liveCatalogLines = null;
    return;
  }
  liveCatalogLines = lines
    .map((raw) => {
      const label = String(raw.label || '').trim();
      if (!label) return null;
      const section = SECTION_IDS.has(raw.section as QuoteSectionId)
        ? (raw.section as QuoteSectionId)
        : 'other';
      const multiplier = MULTIPLIERS.has(raw.multiplier as LineMultiplier)
        ? (raw.multiplier as LineMultiplier)
        : 'set';
      return {
        id: raw.id && String(raw.id).trim() ? String(raw.id) : lineId(section, label),
        section,
        label,
        multiplier,
      } satisfies CatalogLine;
    })
    .filter(Boolean) as CatalogLine[];
}

/** Bundled catalogue plus any new live-sheet lines (bundled wins on matching labels). */
export function getQuoteLines(): CatalogLine[] {
  if (!liveCatalogLines?.length) return QUOTE_LINES;
  const have = new Set(QUOTE_LINES.map((l) => normLabel(l.label)));
  const extra = liveCatalogLines.filter((l) => !have.has(normLabel(l.label)));
  return extra.length ? [...QUOTE_LINES, ...extra] : QUOTE_LINES;
}

export function linesForSection(section: QuoteSectionId): CatalogLine[] {
  return getQuoteLines().filter((l) => l.section === section);
}

const PHOTO_CORP = 'Photographer - Corporate/Special';
const PHOTO_WEDDING = 'Photographer - Wedding';

/** Line ids for both photographer variants (mutually exclusive). */
export function photographerLineIds(): { corporate?: string; wedding?: string } {
  return {
    corporate: QUOTE_LINES.find((l) => l.label === PHOTO_CORP)?.id,
    wedding: QUOTE_LINES.find((l) => l.label === PHOTO_WEDDING)?.id,
  };
}

/**
 * Keep exactly one photographer selected: Wedding vs Corporate/Special.
 * Preserves any explicit uncheck of both (REP opted out).
 */
export function syncExclusivePhotographer(
  selectedIds: string[],
  wedding: boolean,
  opts?: { force?: boolean },
): string[] {
  const { corporate, wedding: wedId } = photographerLineIds();
  const photoIds = [corporate, wedId].filter(Boolean) as string[];
  const without = selectedIds.filter((id) => !photoIds.includes(id));
  const hadAny = selectedIds.some((id) => photoIds.includes(id));
  if (!hadAny && !opts?.force) return without;
  const pick = wedding ? wedId : corporate;
  return pick ? [...without, pick] : without;
}

/**
 * Aggregate high-quality proposal phrasing for selected lines (Prompt 3 scaffold).
 * Only lines with proposalWording contribute — raw Cost Mother labels are skipped.
 */
export function buildPackageWordingNotes(selectedLineIds: string[]): string {
  const wanted = new Set(selectedLineIds);
  const lines: string[] = [];
  for (const line of getQuoteLines()) {
    if (!wanted.has(line.id) || !line.proposalWording?.trim()) continue;
    lines.push(line.proposalWording.trim());
  }
  return lines.join('\n');
}

/**
 * Default YES lines for a new quote.
 * Sapphire: Section 11 + 12 always on (REP unchecks), plus photographer unless stated otherwise.
 * Photographers are mutually exclusive — corporate vs wedding by event type.
 * Structural defaultOn lines (vessel / delivery / decor / contingency) stay forced.
 */
export function defaultSelectedLineIds(
  menus: string[] = [],
  opts?: { wedding?: boolean },
): string[] {
  const ids = new Set<string>();
  const wedding = Boolean(opts?.wedding);
  for (const line of getQuoteLines()) {
    if (line.defaultOn) ids.add(line.id);
    if (line.autoWithMenu && menus.some((m) => line.autoWithMenu!.test(m))) ids.add(line.id);
    // Section 12 — Other: always included in every quote
    if (line.section === 'other') ids.add(line.id);
    // Section 11 — Event Staff: always included except photographers (handled below)
    if (line.section === 'staff' && !/^Photographer\s*-/i.test(line.label)) ids.add(line.id);
  }
  // Force the correct photographer for this event type
  const withPhoto = syncExclusivePhotographer([...ids], wedding, { force: true });

  // Menus selected in Catering step → YES on matching catering lines
  const set = new Set(withPhoto);
  for (const menu of menus) {
    const cm = resolveCostMotherMenu(menu);
    if (!cm) continue;
    const line = getQuoteLines().find((l) => l.section === 'catering' && l.label === cm);
    if (line) set.add(line.id);
  }
  return [...set];
}
