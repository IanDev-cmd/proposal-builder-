/**
 * Quote Builder 2026 — Sections 1–14 line catalogue.
 * Labels match Cost Mother Sheet (WEOTT). Multipliers match QB formulas.
 * Canonical taxonomy: src/lib/assets/catalogueTaxonomy.json
 */
import taxonomyJson from '@/lib/assets/catalogueTaxonomy.json';

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

export type TaxonomyLine = {
  id: string;
  section: QuoteSectionId;
  label: string;
  multiplier: LineMultiplier;
  aliases?: string[];
  defaultOn?: boolean;
  autoWithMenu?: string;
  proposalWording?: string;
};

export const CATALOGUE_TAXONOMY = taxonomyJson as {
  schema: string;
  version: number;
  lines: TaxonomyLine[];
  vesselAliases: Record<string, string>;
  menuAliases: Record<string, string>;
  upgradeToLineLabel: Record<string, string>;
  noteAliases: Record<string, string>;
};

function lineFromTaxonomy(raw: TaxonomyLine): CatalogLine {
  return {
    id: raw.id,
    section: raw.section,
    label: raw.label,
    multiplier: raw.multiplier,
    defaultOn: raw.defaultOn,
    autoWithMenu: raw.autoWithMenu ? new RegExp(raw.autoWithMenu, 'i') : undefined,
    proposalWording: raw.proposalWording,
  };
}

/** Full QB line catalogue — sourced from catalogueTaxonomy.json (excl. bespoke manual rows). */
export const QUOTE_LINES: CatalogLine[] = CATALOGUE_TAXONOMY.lines.map(lineFromTaxonomy);

export const VESSEL_TO_COST_MOTHER: Record<string, string> = CATALOGUE_TAXONOMY.vesselAliases;
export const MENU_TO_COST_MOTHER: Record<string, string> = CATALOGUE_TAXONOMY.menuAliases;
export const UPGRADE_TO_LINE_LABEL: Record<string, string> = CATALOGUE_TAXONOMY.upgradeToLineLabel;

export function findLineByAlias(token: string): CatalogLine | null {
  const n = token.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return null;
  for (const raw of CATALOGUE_TAXONOMY.lines) {
    const aliases = raw.aliases || [raw.label];
    if (aliases.some((a) => a.toLowerCase() === n)) {
      return QUOTE_LINES.find((l) => l.id === raw.id) || null;
    }
  }
  return null;
}

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
