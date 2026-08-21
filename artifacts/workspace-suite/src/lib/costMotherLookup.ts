/**
 * Cost Mother rate lookup — bundled snapshot + optional live overlay from n8n.
 * Keys: vessel|weeklyPeriod|dayPeriod|groupBracket
 */

import bundled from '@/lib/costMotherRates.generated.json';
import { resolveCostMotherVessel } from '@/lib/quoteBuilderCatalog';

export type RateKeyParts = {
  vessel: string;
  weeklyPeriod: string;
  dayPeriod: string;
  groupBracket: string;
};

export type CostMotherBundle = {
  source?: string;
  items: { row: number; label: string; rates: Record<string, number> }[];
  margins?: {
    eventService: string;
    market: string;
    months: Record<string, number>;
  }[];
};

type RateIndex = Map<string, Map<string, number>>; // label → key → rate

let liveOverlay: CostMotherBundle | null = null;
let indexCache: RateIndex | null = null;
let indexSource: string | null = null;
let bundledIndexCache: RateIndex | null = null;

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”"]/g, '"')
    .trim();
}

function buildIndex(bundle: CostMotherBundle): RateIndex {
  const idx: RateIndex = new Map();
  for (const item of bundle.items || []) {
    const map = new Map<string, number>();
    for (const [k, v] of Object.entries(item.rates || {})) {
      if (Number.isFinite(v)) map.set(k, v);
    }
    idx.set(normalizeLabel(item.label), map);
    // also store exact label for convenience
    idx.set(item.label, map);
  }
  return idx;
}

function getBundledIndex(): RateIndex {
  if (!bundledIndexCache) bundledIndexCache = buildIndex(bundled as CostMotherBundle);
  return bundledIndexCache;
}

function bundledCast(): CostMotherBundle {
  return bundled as CostMotherBundle;
}

function activeBundle(): CostMotherBundle {
  if (!liveOverlay) return bundledCast();
  const liveMargins = liveOverlay.margins && liveOverlay.margins.length
    ? liveOverlay.margins
    : bundledCast().margins;
  return { ...liveOverlay, margins: liveMargins };
}

/** Bundled snapshot + live overlay (live wins per label/key when > 0; bundled fills gaps). */
function getIndex(): RateIndex {
  const src = liveOverlay ? 'merged' : 'bundled';
  if (!indexCache || indexSource !== src) {
    indexCache = new Map();
    for (const [label, map] of getBundledIndex()) {
      indexCache.set(label, new Map(map));
    }
    if (liveOverlay) {
      const liveIdx = buildIndex(liveOverlay);
      for (const [label, liveMap] of liveIdx.entries()) {
        const baseMap = new Map(indexCache.get(label) || []);
        for (const [k, v] of liveMap.entries()) {
          // Never let blank/zero live cells wipe a real bundled rate (shows as £0.00 in UI).
          if (!Number.isFinite(v)) continue;
          if (v > 0 || !baseMap.has(k) || !(Number(baseMap.get(k)) > 0)) {
            baseMap.set(k, v);
          }
        }
        indexCache.set(label, baseMap);
      }
    }
    indexSource = src;
  }
  return indexCache;
}

/** Apply structured Cost Mother payload from CostRatesFetch (when shaped). */
export function setLiveCostMotherRates(bundle: CostMotherBundle | null): void {
  liveOverlay = bundle && bundle.items?.length ? bundle : null;
  indexCache = null;
  indexSource = null;
}

export function getCostMotherMeta(): { source: string; itemCount: number; live: boolean; merged: boolean } {
  const b = activeBundle();
  return {
    source: b.source || 'Cost Mother',
    itemCount: getIndex().size,
    live: Boolean(liveOverlay),
    merged: Boolean(liveOverlay),
  };
}

export function makeRateKey(parts: RateKeyParts): string {
  return `${parts.vessel}|${parts.weeklyPeriod}|${parts.dayPeriod}|${parts.groupBracket}`;
}

/** Infer weekly period from date (and vessel family for Erasmus/Dixie Mon–Wed splits). */
export function inferWeeklyPeriod(
  eventDate: string,
  dateFlexible: boolean | undefined,
  costMotherVessel: string | null,
): string {
  const usesMidweekSplit =
    costMotherVessel === 'Erasmus' ||
    costMotherVessel === 'Dixie Queen' ||
    costMotherVessel === 'Elizabethan' ||
    costMotherVessel === 'Edwardian';

  if (!eventDate?.trim() || dateFlexible || /tbc/i.test(eventDate)) {
    return usesMidweekSplit ? 'Thur to Sun' : 'Fri to Sun';
  }
  const d = new Date(eventDate);
  if (Number.isNaN(d.getTime())) {
    return usesMidweekSplit ? 'Thur to Sun' : 'Fri to Sun';
  }
  const day = d.getDay(); // 0 Sun … 6 Sat
  if (usesMidweekSplit) {
    // Mon(1)–Wed(3) vs Thur(4)–Sun(0)
    return day >= 1 && day <= 3 ? 'Mon to Wed' : 'Thur to Sun';
  }
  return day === 0 || day >= 5 ? 'Fri to Sun' : 'Mon to Thur';
}

/** Infer day period from event start hour (evening if departure/embark ≥ 16:00). */
export function inferDayPeriod(embarkation: string): string {
  const h = parseInt((embarkation || '12:00').split(':')[0] || '12', 10);
  return h >= 16 ? 'Evening' : 'Daytime';
}

export function inferGroupBracket(guests: number, costMotherVessel: string | null): string {
  if (costMotherVessel === 'Erasmus') {
    return guests >= 200 ? '200 to 335 guests' : '1 to 199 guests';
  }
  if (costMotherVessel === 'Dixie Queen') {
    // Cost Mother uses several Dixie brackets; prefer 1–249 / 250–400 when present
    return guests >= 250 ? '250 to 400 guests' : '1 to 249 guests';
  }
  return 'Standard';
}

function resolveSheetLabel(label: string): string {
  const n = normalizeLabel(label);
  if (n === 'weott providing') return 'Own Food Surcharge';
  return label;
}

function findRateMap(label: string, idx: RateIndex = getIndex()): Map<string, number> | null {
  const resolved = resolveSheetLabel(label);
  if (idx.has(resolved)) return idx.get(resolved)!;
  if (idx.has(label)) return idx.get(label)!;
  const n = normalizeLabel(resolved);
  if (idx.has(n)) return idx.get(n)!;
  for (const [k, map] of idx.entries()) {
    if (normalizeLabel(k) === n) return map;
    if (normalizeLabel(k).includes(n) || n.includes(normalizeLabel(k))) return map;
  }
  return null;
}

function lookupInMap(
  map: Map<string, number> | null,
  label: string,
  parts: RateKeyParts,
): { rate: number | null; keyUsed: string | null; note?: string } {
  if (!map || !map.size) return { rate: null, keyUsed: null, note: `No Cost Mother row for "${label}"` };

  const exact = makeRateKey(parts);
  const exactRate = map.has(exact) ? map.get(exact)! : null;
  // Sheet often stores 0 for N/A cells — treat as missing so weekly/group fallbacks can win.
  if (exactRate != null && exactRate > 0) return { rate: exactRate, keyUsed: exact };

  const candidates: string[] = [];
  const weeklyAlts =
    parts.weeklyPeriod === 'Fri to Sun'
      ? ['Fri to Sun', 'Thur to Sun']
      : parts.weeklyPeriod === 'Mon to Thur'
        ? ['Mon to Thur', 'Mon to Wed']
        : parts.weeklyPeriod === 'Thur to Sun'
          ? ['Thur to Sun', 'Fri to Sun']
          : parts.weeklyPeriod === 'Mon to Wed'
            ? ['Mon to Wed', 'Mon to Thur']
            : [parts.weeklyPeriod];

  for (const w of weeklyAlts) {
    for (const g of [parts.groupBracket, 'Standard', '1 to 199 guests', '1 to 249 guests']) {
      candidates.push(`${parts.vessel}|${w}|${parts.dayPeriod}|${g}`);
    }
  }

  for (const k of candidates) {
    if (!map.has(k)) continue;
    const rate = map.get(k)!;
    if (!(rate > 0)) continue;
    return {
      rate,
      keyUsed: k,
      note: exactRate === 0 ? `Rate fallback (sheet 0 at ${exact}) → ${k}` : `Rate fallback key ${k}`,
    };
  }

  if (exactRate === 0) {
    return {
      rate: null,
      keyUsed: exact,
      note: `Cost Mother rate is 0 for ${label} @ ${exact}`,
    };
  }

  return {
    rate: null,
    keyUsed: null,
    note: `No Cost Mother rate for ${label} @ ${exact}`,
  };
}

/**
 * Look up unit cost for a Cost Mother line under vessel/period/day/group.
 * Falls back across nearby weekly/group keys when exact match missing or zero.
 * Live overlay zeros never block the bundled snapshot.
 */
export function lookupUnitRate(
  label: string,
  parts: RateKeyParts,
): { rate: number | null; keyUsed: string | null; note?: string } {
  const primary = lookupInMap(findRateMap(label), label, parts);
  if (primary.rate != null && primary.rate > 0) return primary;
  if (!liveOverlay) return primary;

  const bundled = lookupInMap(findRateMap(label, getBundledIndex()), label, parts);
  if (bundled.rate != null && bundled.rate > 0) {
    return { ...bundled, note: `Bundled fallback${bundled.note ? `: ${bundled.note}` : ''}` };
  }
  return primary.rate != null ? primary : bundled.rate != null ? bundled : primary;
}

export function buildRateParts(opts: {
  vesselUi: string;
  weeklyPeriod?: string;
  dayPeriod?: string;
  groupBracket?: string;
  eventDate?: string;
  dateFlexible?: boolean;
  embarkation?: string;
  departure?: string;
  guests?: number;
}): RateKeyParts {
  const vessel = resolveCostMotherVessel(opts.vesselUi) || opts.vesselUi;
  const weekly =
    opts.weeklyPeriod ||
    inferWeeklyPeriod(opts.eventDate || '', opts.dateFlexible, vessel);
  const day = opts.dayPeriod || inferDayPeriod(opts.departure || opts.embarkation || '12:00');
  const group =
    opts.groupBracket ||
    inferGroupBracket(opts.guests || 0, vessel);
  return { vessel, weeklyPeriod: weekly, dayPeriod: day, groupBracket: group };
}

/** Minimum target margin from bundled matrix (event × month). */
export function lookupMinMargin(eventType: string, eventDate: string, market?: string): number | null {
  const b = activeBundle();
  const rows = b.margins || [];
  if (!rows.length) return null;
  const et = (eventType || '').toLowerCase();
  const monthIdx = (() => {
    const d = new Date(eventDate);
    if (Number.isNaN(d.getTime())) return null;
    return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][
      d.getMonth()
    ];
  })();
  if (!monthIdx) return null;

  const wedding = /wedding/i.test(et) || /wedding/i.test(market || '');
  const scored = rows
    .map((r) => {
      const svc = r.eventService.toLowerCase();
      let score = 0;
      if (et.includes(svc) || svc.includes(et.split(' ')[0] || '___')) score += 2;
      if (wedding && /wedding|special/i.test(r.market)) score += 2;
      if (!wedding && /corporate/i.test(r.market)) score += 1;
      // fuzzy event family
      if (/summer/.test(et) && /summer/.test(svc)) score += 3;
      if (/christmas|xmas/.test(et) && /christmas/.test(svc)) score += 3;
      if (/award/.test(et) && /award/.test(svc)) score += 3;
      if (/network|client event|product launch/.test(et) && /network|client|product/.test(svc))
        score += 3;
      if (/meeting/.test(et) && /meeting/.test(svc)) score += 3;
      if (/conference/.test(et) && /conference/.test(svc)) score += 3;
      if (/transfer/.test(et) && /transfer/.test(svc)) score += 3;
      if (/social/.test(et) && /social/.test(svc)) score += 3;
      if (/team/.test(et) && /team/.test(svc)) score += 3;
      if (/anniversary/.test(et) && /anniversary/.test(svc)) score += 3;
      if (/wedding/.test(et) && /wedding/.test(svc)) score += 3;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const hit = scored[0]?.r;
  if (!hit) return null;
  const v = hit.months[monthIdx];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Parse raw Cost Mother Google Sheets rows (n8n) into a CostMotherBundle.
 * Tolerates header-style columns from Sheets API.
 */
export function parseCostMotherRows(rows: Record<string, unknown>[]): CostMotherBundle | null {
  if (!rows?.length) return null;
  // Sheets may return either array-of-objects with A/B/C keys or first-column labels.
  // Prefer our structured Assembled shape when present.
  const structured = rows as unknown as CostMotherBundle;
  if (
    structured &&
    typeof structured === 'object' &&
    Array.isArray((structured as CostMotherBundle).items)
  ) {
    return structured as CostMotherBundle;
  }

  // Heuristic: find objects that look like { label, rates }
  const items = rows
    .map((r) => {
      const label = String(
        r.label || r.Label || r['Item'] || r['Cost Item'] || r['A'] || '',
      ).trim();
      const ratesRaw = r.rates;
      if (label && ratesRaw && typeof ratesRaw === 'object') {
        return {
          row: Number(r.row) || 0,
          label,
          rates: ratesRaw as Record<string, number>,
        };
      }
      return null;
    })
    .filter(Boolean) as CostMotherBundle['items'];

  if (!items.length) return null;
  return { source: 'CostRatesFetch', items };
}
