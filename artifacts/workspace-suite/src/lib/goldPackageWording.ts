/**
 * Proposal package column wording.
 * Gold JSON is a fallback; live quotes are built from Cost Lines ticks + itinerary.
 */
import goldPackageWording from '@/lib/assets/goldPackageWording.json';
import { getQuoteLines, type QuoteSectionId } from '@/lib/quoteBuilderCatalog';
import type { BespokeLine } from '@/lib/quoteFinance';

export type PackageWordingGroup = { heading: string; items: string[] };
export type PackageWordingColumns = Record<string, PackageWordingGroup[]>;

const WORDING = goldPackageWording as Record<string, PackageWordingColumns>;

const TIMING_ITEM_RE =
  /^(Embark will begin|Boat departs|Returns to pier|Disembark completes)/i;
const ITINERARY_HEADING_RE = /private venue hire|itinerary/i;

const EVENT_MGMT: PackageWordingGroup = {
  heading: 'Full event management – before, during and after;',
  items: ['Assigned event planner', 'Event coordinators', 'Pier coordinator'],
};

const PIER_STOP = 'Complimentary pier stop can be added at any point during your cruise';

const SKIP_COPY =
  /contingen|financial admin|delivery charge|wp runner|admin fee|own food surcharge|cutlery hire|disposable tableware/i;

export function goldPackageWordingForRef(ref?: string | null): PackageWordingColumns | null {
  if (!ref) return null;
  return WORDING[ref] || null;
}

function cloneWording(src: PackageWordingColumns): PackageWordingColumns {
  const out: PackageWordingColumns = {};
  for (const [k, groups] of Object.entries(src)) {
    out[k] = groups.map((g) => ({ heading: g.heading, items: [...g.items] }));
  }
  return out;
}

function clientPhrase(label: string, proposalWording?: string): string | null {
  const phrase = (proposalWording || '').trim() || String(label || '').trim();
  if (!phrase || SKIP_COPY.test(phrase)) return null;
  return phrase.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '');
}

function uniquePhrases(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function phrasesForSections(selectedIds: string[], sections: QuoteSectionId[]): string[] {
  const wanted = new Set(selectedIds);
  const items: string[] = [];
  for (const line of getQuoteLines()) {
    if (!wanted.has(line.id) || !sections.includes(line.section)) continue;
    const phrase = clientPhrase(line.label, line.proposalWording);
    if (phrase) items.push(phrase);
  }
  return uniquePhrases(items);
}

/**
 * Keep template / gold package copy. Only replace the itinerary heading + timing lines.
 */
export function overlayItineraryOnPackageWording(
  wording: PackageWordingColumns | null,
  timingBlock: PackageWordingGroup,
): PackageWordingColumns {
  const base = wording ? cloneWording(wording) : {};
  const cols = [...(base.venue_and_management || [])];
  const idx = cols.findIndex(
    (g) => ITINERARY_HEADING_RE.test(g.heading) || g.items.some((i) => TIMING_ITEM_RE.test(i)),
  );
  const extras = idx >= 0 ? cols[idx].items.filter((i) => !TIMING_ITEM_RE.test(i)) : [];
  const next: PackageWordingGroup = {
    heading: timingBlock.heading,
    items: uniquePhrases([...timingBlock.items, ...extras, PIER_STOP]),
  };
  if (idx >= 0) cols[idx] = next;
  else cols.unshift(next);
  if (!cols.some((g) => /event management/i.test(g.heading))) cols.push({ ...EVENT_MGMT, items: [...EVENT_MGMT.items] });
  base.venue_and_management = cols;
  return base;
}

export function buildLivePackageWording(opts: {
  selectedLineIds: string[];
  menuType?: string[];
  bespokeLines?: BespokeLine[];
  timingBlock: PackageWordingGroup;
  extraNotes?: string;
}): PackageWordingColumns {
  const selected = opts.selectedLineIds || [];
  const itinerary: PackageWordingGroup = {
    heading: opts.timingBlock.heading,
    items: uniquePhrases([...opts.timingBlock.items, PIER_STOP]),
  };

  const entertainment = phrasesForSections(selected, ['entertainment']);
  const decor = phrasesForSections(selected, ['decor', 'decor_table']);
  const catering = uniquePhrases([
    ...(opts.menuType || []),
    ...phrasesForSections(selected, ['catering', 'catering_equipment']),
  ]);
  const drinks = phrasesForSections(selected, ['beverages']);
  const stationery = phrasesForSections(selected, ['other']);
  const bespoke = uniquePhrases(
    (opts.bespokeLines || [])
      .filter((b) => b.enabled && (Number(b.amount) > 0 || String(b.label || '').trim()))
      .map((b) => String(b.label || '').trim())
      .filter((s) => s && !/^bespoke\s*\(\d+\)$/i.test(s)),
  );

  const entertainmentCol: PackageWordingGroup[] = [];
  if (entertainment.length) entertainmentCol.push({ heading: 'Entertainment;', items: entertainment });
  if (decor.length) entertainmentCol.push({ heading: 'Decorative items;', items: decor });

  const cateringCol: PackageWordingGroup[] = [];
  if (stationery.length) cateringCol.push({ heading: 'Stationery;', items: stationery });
  const foodItems = uniquePhrases([...catering, ...drinks, ...bespoke]);
  if (foodItems.length) cateringCol.push({ heading: 'Food and beverages;', items: foodItems });

  const venue: PackageWordingGroup[] = [itinerary, { ...EVENT_MGMT, items: [...EVENT_MGMT.items] }];
  if (opts.extraNotes?.trim()) {
    venue.push({
      heading: 'Notes;',
      items: opts.extraNotes.trim().split(/\n+/).map((s) => s.trim()).filter(Boolean),
    });
  }

  return {
    venue_and_management: venue,
    entertainment_and_decor: entertainmentCol.length
      ? entertainmentCol
      : [{ heading: 'Entertainment;', items: ['Personalised playlist'] }],
    stationery_and_catering: cateringCol.length
      ? cateringCol
      : [{ heading: 'Food and beverages;', items: ['Menu as confirmed on the quote sheet'] }],
  };
}
