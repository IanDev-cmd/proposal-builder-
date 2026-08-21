/**
 * Proposal package column wording keyed by gold scenario ref (matches testing zip PDFs).
 */
import goldPackageWording from '@/lib/assets/goldPackageWording.json';

export type PackageWordingGroup = { heading: string; items: string[] };
export type PackageWordingColumns = Record<string, PackageWordingGroup[]>;

const WORDING = goldPackageWording as Record<string, PackageWordingColumns>;

const TIMING_ITEM_RE =
  /^(Embark will begin|Boat departs|Returns to pier|Disembark completes)/i;
const ITINERARY_HEADING_RE = /private venue hire|itinerary/i;

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
    items: [...timingBlock.items, ...extras],
  };
  if (idx >= 0) cols[idx] = next;
  else cols.unshift(next);
  base.venue_and_management = cols;
  return base;
}
