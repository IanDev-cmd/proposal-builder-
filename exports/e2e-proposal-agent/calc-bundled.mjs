/**
 * Bundled Cost Mother calc mirror (no tsx) — debug gold WEOTT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WS = path.join(__dirname, '../../artifacts/workspace-suite/src/lib');
const cm = JSON.parse(fs.readFileSync(path.join(WS, 'costMotherRates.generated.json'), 'utf8'));
const gold = JSON.parse(fs.readFileSync(path.join(WS, 'assets/goldFinancialScenarios.json'), 'utf8'));

const CONTINGENCY = 0.0225;
const STAFF_BUF = 0.5;
const VESSEL = { 'WEOTT II (Avontuur)': 'Avontuur' };

const MULT = {
  'Vessel/Venue Hire': 'vessel_hours',
  'Hot Fork Buffet (All Seasons)': 'guests',
  'Catering Delivery Charge (In every quote)': 'set',
  'Background Music/Sound Equipment Hire': 'hours',
  'Casino table with croupier - x 2': 'hours',
  Photobooth: 'hours',
  'TV - 55"': 'hours',
  'Cocktail Reception (1 x glass per guest)': 'guests',
  'Event Decor (Add to every quote)': 'tables',
  "Catering/Staff Food Contigency (ADD TO ALL QUOTES)": 'set',
  'Project Management - Corporate/Special': 'set',
  'Pier Coordinator': 'set',
  'Unit Management (Packing team)': 'set',
  'Event Manager (In house member of team)': 'staff_hours',
  'Event Coordinator (In house member of team)': 'staff_hours',
  'Event Assistant x 1': 'staff_hours',
  'Head Chef x 1': 'staff_hours',
  'Chef De Partie': 'staff_hours',
  'Catering Assistant x 3': 'staff_hours',
  'Wild Catering Assistant': 'staff_hours',
  'CONTIGENCY STAFF': 'set',
  'Staff Taxi or Train Cost': 'set',
  "Event Manager 'Creative Kitty'": 'set',
  'Financial Admin Fee - Carly': 'set',
  'Financial Admin Fee - Shilen': 'set',
  'Delivery charge for cutlery and linen (or contigency for lost/damage items)': 'set',
};

function buildIndex() {
  const idx = new Map();
  for (const item of cm.items) {
    const map = new Map();
    for (const col of cm.columns) {
      const key = `${col.vessel}|${col.weekly}|${col.day}|${col.group}`;
      const r = item.rates[String(col.c)];
      if (r != null) map.set(key, r);
    }
    idx.set(item.label, map);
  }
  return idx;
}
const IDX = buildIndex();

function lookup(label, parts) {
  const map = IDX.get(label);
  if (!map) return null;
  const key = `${parts.vessel}|${parts.weekly}|${parts.day}|${parts.group}`;
  return map.get(key) ?? map.get(`${parts.vessel}|Mon to Thur|${parts.day}|Standard`) ?? null;
}

function calc(id) {
  const sc = gold[id];
  const f = sc.form;
  const parts = {
    vessel: VESSEL[f.vesselType[0]] || 'Avontuur',
    weekly: f.weeklyPeriod,
    day: f.dayPeriod,
    group: f.groupBracket,
  };
  const guests = Number(f.guestCount);
  const tables = Number(f.noOfTables);
  const [eh, em] = f.embarkation.split(':').map(Number);
  const [dh, dm] = f.disembarkation.split(':').map(Number);
  const hours = (dh * 60 + dm - (eh * 60 + em)) / 60;

  const labels = ['Vessel/Venue Hire', ...f.costLineLabels];
  let sub = 0;
  const missing = [];
  for (const label of labels) {
    const rate = lookup(label, parts);
    if (rate == null) {
      missing.push(label);
      continue;
    }
    const m = MULT[label] || (label.includes('Fork') || label.includes('Plate') || label.includes('Knife') || label.includes('Napkin') || label.includes('Spoon') || label.includes('Bowl') || label.includes('Linen') ? 'guests' : 'set');
    let mult = 1;
    if (m === 'vessel_hours' || m === 'hours') mult = hours;
    else if (m === 'staff_hours') mult = hours + STAFF_BUF;
    else if (m === 'guests') mult = guests;
    else if (m === 'tables') mult = tables;
    sub += rate * mult;
  }
  for (const b of f.bespokeLines || []) {
    if (b.enabled) sub += b.amount;
  }
  if (f.bespokeAmount && !f.bespokeLines?.some((b) => b.enabled)) sub += f.bespokeAmount;
  const total = Math.round((sub * (1 + CONTINGENCY) + Number.EPSILON) * 100) / 100;
  console.log(id, 'sub', sub.toFixed(2), 'WEOTT', total, 'target', sc.goldQuoteWeottCost, 'delta', (total - sc.goldQuoteWeottCost).toFixed(2));
  if (missing.length) console.log('  missing rates:', missing.join(' | '));
}

for (const id of Object.keys(gold)) calc(id);
