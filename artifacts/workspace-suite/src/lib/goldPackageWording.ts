/**
 * Page 13 package wording.
 * Live quotes overlay itinerary timings onto the InDesign template.
 * Gold JSON is kept for known replay refs only.
 */
import goldPackageWording from '@/lib/assets/goldPackageWording.json';

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

/**
 * Page 13 overlay payload: itinerary heading + four timing lines.
 * Entertainment, catering, and event management stay on the template.
 */
export function itineraryOverlayWording(timingBlock: PackageWordingGroup): PackageWordingColumns {
  const items = uniquePhrases(
    (timingBlock.items || []).filter((i) => !/complimentary pier stop/i.test(i)),
  );
  return {
    venue_and_management: [
      {
        heading: timingBlock.heading,
        items,
      },
    ],
  };
}
