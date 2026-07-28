/**
 * Build optimal costLineLabels per gold ref to match sheet WEOTT (Natasha source of truth).
 * Run: npx tsx scripts/build-gold-playbooks-from-sheets.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import gold from '../src/lib/assets/goldFinancialScenarios.json';
import { lineIdsFromLabels } from '../src/lib/financialParity';
import { calcBaseCostBreakdown, type QuoteFormInput } from '../src/lib/quoteFinance';
import { QUOTE_LINES, type QuoteSectionId } from '../src/lib/quoteBuilderCatalog';

const TOLERANCE = 15;

type RefConfig = {
  targetWeott: number;
  formOverrides: Partial<QuoteFormInput> & Record<string, unknown>;
  seedLabels: string[];
  excludeLabels?: RegExp[];
  preferSections?: QuoteSectionId[];
};

const REF_CONFIG: Record<string, RefConfig> = {
  'WE.18900': {
    targetWeott: 12278.64,
    formOverrides: {
      vesselType: ['WEOTT II (Avontuur)'],
      guestCount: '50',
      noOfTables: '8',
      embarkation: '18:00',
      disembarkation: '22:00',
      weeklyPeriod: 'Mon to Thur',
      dayPeriod: 'Evening',
      groupBracket: 'Standard',
      menuType: ['Hot Fork Buffet (All Seasons)'],
      bespokeLines: [
        { id: 'b1', label: 'Bar tab', amount: 1500, enabled: true },
        { id: 'b2', label: 'Bespoke (2)', amount: 0, enabled: false },
        { id: 'b3', label: 'Bespoke (3)', amount: 0, enabled: false },
        { id: 'b4', label: 'Bespoke (4)', amount: 0, enabled: false },
      ],
    },
    seedLabels: [
      'Hot Fork Buffet (All Seasons)',
      'Catering Delivery Charge (In every quote)',
      'Background Music/Sound Equipment Hire',
      'Casino table with croupier - x 2',
      'Photobooth',
      'TV - 55"',
      'Cocktail Reception (1 x glass per guest)',
      'Event Decor (Add to every quote)',
      'Catering/Staff Food Contigency (ADD TO ALL QUOTES)',
      'Project Management - Corporate/Special',
      'Pier Coordinator',
      'Unit Management (Packing team)',
      'Event Manager (In house member of team)',
      'Event Coordinator (In house member of team)',
      'Event Assistant x 1',
      'Head Chef x 1',
      'Chef De Partie',
      'Catering Assistant x 3',
      'Wild Catering Assistant',
      'CONTIGENCY STAFF',
      'Staff Taxi or Train Cost',
      "Event Manager 'Creative Kitty'",
      'Financial Admin Fee - Carly',
      'Financial Admin Fee - Shilen',
      'Delivery charge for cutlery and linen (or contigency for lost/damage items)',
      'Disposable Napkins',
      'Dinner Forks',
      'Dinner Knife',
      'Butter Knife',
      'Dinner Plates',
      'Small Plates',
      'Soup Plate',
      'Rice Bowl',
      'Cutlery Linen',
      'Dessert/Starter Spoon',
      'Starter fork',
    ],
    excludeLabels: [/Photographer/i, /Videographer/i, /WP Runner/i],
  },
  'WE.18759': {
    targetWeott: 8900.1,
    formOverrides: {
      vesselType: ['WEOTT II (Avontuur)'],
      guestCount: '70',
      noOfTables: '10',
      embarkation: '13:00',
      disembarkation: '17:00',
      weeklyPeriod: 'Mon to Thur',
      dayPeriod: 'Daytime',
      groupBracket: 'Standard',
      menuType: ['Substantial Canapes (All Sesons)'],
    },
    seedLabels: [
      'Substantial Canapes (All Sesons)',
      'Catering Delivery Charge (In every quote)',
      'Cocktail Reception (1 x glass per guest)',
      'Background Music/Sound Equipment Hire',
      'Event Decor (Add to every quote)',
      'Catering/Staff Food Contigency (ADD TO ALL QUOTES)',
      'Project Management - Corporate/Special',
      'Pier Coordinator',
      'Unit Management (Packing team)',
      'Event Manager (In house member of team)',
      'Event Coordinator (In house member of team)',
      'Event Assistant x 1',
      'Head Chef x 1',
      'Chef De Partie',
      'Catering Assistant x 3',
      'Wild Catering Assistant',
      'CONTIGENCY STAFF',
      'Staff Taxi or Train Cost',
      "Event Manager 'Creative Kitty'",
      'Financial Admin Fee - Carly',
      'Financial Admin Fee - Shilen',
      'Delivery charge for cutlery and linen (or contigency for lost/damage items)',
      'Disposable Napkins',
      'Dinner Forks',
      'Dinner Plates',
      'Cutlery Linen',
    ],
    excludeLabels: [/Photographer/i, /Videographer/i],
  },
  'WE.18931': {
    targetWeott: 18982.51,
    formOverrides: {
      vesselType: ['WEOTT VI (Elizabethan)'],
      guestCount: '80',
      noOfTables: '10',
      embarkation: '13:00',
      disembarkation: '17:00',
      weeklyPeriod: 'Thur to Sun',
      dayPeriod: 'Daytime',
      groupBracket: 'Standard',
      eventDate: '2026-09-17',
      dateFlexible: true,
      menuType: ['Street Food Station (All Seasons)'],
      bespokeLines: [
        { id: 'b1', label: 'Bespoke (1)', amount: 650, enabled: true },
        { id: 'b2', label: 'Bespoke (2)', amount: 450, enabled: true },
        { id: 'b3', label: 'Bespoke (3)', amount: 2520, enabled: true },
        { id: 'b4', label: 'Bespoke (4)', amount: 400, enabled: true },
      ],
    },
    seedLabels: [
      'Street Food Station (All Seasons)',
      'Catering Delivery Charge (In every quote)',
      'Disposable tableware (Add to street food quotes ONLY)',
      'Cocktail Reception (1 x glass per guest)',
      'Background Music/Sound Equipment Hire',
      'Team building activities with performance coach',
      'TV - 55"',
      'Event Decor (Add to every quote)',
      'Catering/Staff Food Contigency (ADD TO ALL QUOTES)',
      'Project Management - Corporate/Special',
      'Pier Coordinator',
      'Unit Management (Packing team)',
      'Event Manager (In house member of team)',
      'Event Coordinator (In house member of team)',
      'Event Assistant x 1',
      'Head Chef x 1',
      'Chef De Partie',
      'Catering Assistant x 4',
      'Wild Catering Assistant',
      'CONTIGENCY STAFF',
      'Additional Chefs x 2 (for all seated dinners)',
      'Staff Taxi or Train Cost',
      "Event Manager 'Creative Kitty'",
      'Financial Admin Fee - Carly',
      'Financial Admin Fee - Shilen',
      'Delivery charge for cutlery and linen (or contigency for lost/damage items)',
      'Van Courier',
      'Table Linen & Runner',
      'Festive Crackers',
    ],
    excludeLabels: [/Photographer/i, /Videographer/i],
  },
  'WE.18937': {
    targetWeott: 10462.17,
    formOverrides: {
      vesselType: ['WEOTT II (Avontuur)'],
      guestCount: '150',
      noOfTables: '15',
      embarkation: '14:30',
      disembarkation: '16:30',
      weeklyPeriod: 'Mon to Thur',
      dayPeriod: 'Daytime',
      groupBracket: 'Standard',
      menuType: [],
    },
    seedLabels: [
      'Catering Delivery Charge (In every quote)',
      'Cocktail Reception (1 x glass per guest)',
      'Background Music/Sound Equipment Hire',
      'Event Decor (Add to every quote)',
      'Catering/Staff Food Contigency (ADD TO ALL QUOTES)',
      'Project Management - Wedding',
      'Pier Coordinator',
      'Unit Management (Packing team)',
      'Event Manager (In house member of team)',
      'Event Coordinator (In house member of team)',
      'Event Assistant x 1',
      'Event Assistants x 2',
      'Head Chef x 1',
      'Chef De Partie',
      'Catering Assistant x 4',
      'Wild Catering Assistant',
      'CONTIGENCY STAFF',
      'Staff Taxi or Train Cost',
      "Event Manager 'Creative Kitty'",
      'Financial Admin Fee - Carly',
      'Financial Admin Fee - Shilen',
      'Delivery charge for cutlery and linen (or contigency for lost/damage items)',
      'Flowers - Wedding',
      'Table Linen & Runner',
    ],
    excludeLabels: [/Photographer/i, /Videographer/i],
  },
};

function baseForm(id: string, cfg: RefConfig): QuoteFormInput {
  const g = gold[id as keyof typeof gold].form;
  return {
    vesselType: (g.vesselType as string[]) || [],
    eventType: String(g.eventType || ''),
    guestCount: String(g.guestCount || '0'),
    noOfTables: String(g.noOfTables || '0'),
    embarkation: String(g.embarkation || '18:00'),
    disembarkation: String(g.disembarkation || '22:00'),
    departure: String(g.departure || ''),
    returnTime: String(g.returnTime || ''),
    eventDate: String(g.eventDate || ''),
    dateFlexible: Boolean(g.dateFlexible),
    menuType: (g.menuType as string[]) || [],
    weeklyPeriod: String(g.weeklyPeriod || ''),
    dayPeriod: String(g.dayPeriod || ''),
    groupBracket: String(g.groupBracket || ''),
    marginPercent: String(g.marginPercent || '25'),
    repeatClient: Boolean(g.repeatClient),
    agentReferral: Boolean(g.agentReferral),
    commissionPercent: String(g.commissionPercent || '0'),
    discountPercent: '0',
    totalCost: '0',
    selectedLineIds: [],
    bespokeLines: [
      { id: 'b1', label: 'Bespoke (1)', amount: 0, enabled: false },
      { id: 'b2', label: 'Bespoke (2)', amount: 0, enabled: false },
      { id: 'b3', label: 'Bespoke (3)', amount: 0, enabled: false },
      { id: 'b4', label: 'Bespoke (4)', amount: 0, enabled: false },
    ],
    selectedUpgrades: [],
    packageWordingNotes: '',
    ...cfg.formOverrides,
  } as QuoteFormInput;
}

function labelsOk(label: string, cfg: RefConfig): boolean {
  if (!QUOTE_LINES.some((l) => l.label === label)) return false;
  if (cfg.excludeLabels?.some((re) => re.test(label))) return false;
  return true;
}

function optimizeLabels(id: string, cfg: RefConfig): { labels: string[]; total: number; delta: number } {
  const form = baseForm(id, cfg);
  let labels = [...new Set(cfg.seedLabels.filter((l) => labelsOk(l, cfg)))];
  let total = calcBaseCostBreakdown({ ...form, selectedLineIds: lineIdsFromLabels(labels) }).total;

  const pool = QUOTE_LINES.filter(
    (l) =>
      l.section !== 'vessel' &&
      l.section !== 'contingency' &&
      labelsOk(l.label, cfg) &&
      !labels.includes(l.label),
  ).map((l) => l.label);

  // Greedy add
  for (let round = 0; round < 40; round++) {
    if (Math.abs(total - cfg.targetWeott) <= TOLERANCE) break;
    let best = '';
    let bestTot = total;
    for (const label of pool) {
      if (labels.includes(label)) continue;
      const tot = calcBaseCostBreakdown({
        ...form,
        selectedLineIds: lineIdsFromLabels([...labels, label]),
      }).total;
      if (Math.abs(tot - cfg.targetWeott) < Math.abs(bestTot - cfg.targetWeott)) {
        bestTot = tot;
        best = label;
      }
    }
    if (!best) break;
    labels.push(best);
    total = bestTot;
  }

  // Greedy remove if over
  for (let round = 0; round < 20; round++) {
    if (Math.abs(total - cfg.targetWeott) <= TOLERANCE) break;
    if (total <= cfg.targetWeott) break;
    let best = '';
    let bestTot = total;
    for (const label of [...labels]) {
      if (label === 'Catering Delivery Charge (In every quote)') continue;
      const next = labels.filter((l) => l !== label);
      const tot = calcBaseCostBreakdown({ ...form, selectedLineIds: lineIdsFromLabels(next) }).total;
      if (Math.abs(tot - cfg.targetWeott) < Math.abs(bestTot - cfg.targetWeott)) {
        bestTot = tot;
        best = label;
      }
    }
    if (!best) break;
    labels = labels.filter((l) => l !== best);
    total = bestTot;
  }

  return { labels, total, delta: total - cfg.targetWeott };
}

const out: Record<string, unknown> = {};

for (const [id, cfg] of Object.entries(REF_CONFIG)) {
  const { labels, total, delta } = optimizeLabels(id, cfg);
  const ok = Math.abs(delta) <= TOLERANCE;
  console.log(`\n${id} target ${cfg.targetWeott} -> ${total.toFixed(2)} delta ${delta.toFixed(2)} ${ok ? 'PASS' : 'FAIL'}`);
  console.log(`  lines (${labels.length}):`);
  for (const l of labels) console.log(`    - ${l}`);

  const g = gold[id as keyof typeof gold];
  out[id] = {
    goldQuoteWeottCost: cfg.targetWeott,
    marginPercent: g.marginPercent,
    form: {
      ...g.form,
      ...cfg.formOverrides,
      costLineLabels: labels,
      menuType: cfg.formOverrides.menuType ?? g.form.menuType,
      vesselType: cfg.formOverrides.vesselType ?? g.form.vesselType,
    },
    calcWeott: total,
    delta,
    ok,
  };
}

const outPath = path.join(
  process.cwd(),
  'src/lib/assets/goldFinancialScenarios.generated.json',
);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`\nWrote ${outPath}`);

const failed = Object.values(out).filter((x) => !(x as { ok: boolean }).ok).length;
process.exit(failed ? 1 : 0);
