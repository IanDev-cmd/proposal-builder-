/**
 * Playbook rerun gate — finances + line labels + package wording (no tsx).
 * Run from repo: node exports/e2e-proposal-agent/verify-playbooks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const WS = path.join(ROOT, 'artifacts/workspace-suite/src/lib');

const goldFinancial = JSON.parse(
  fs.readFileSync(path.join(WS, 'assets/goldFinancialScenarios.json'), 'utf8'),
);
const goldWording = JSON.parse(
  fs.readFileSync(path.join(WS, 'assets/goldPackageWording.json'), 'utf8'),
);
const costMother = JSON.parse(
  fs.readFileSync(path.join(WS, 'costMotherRates.generated.json'), 'utf8'),
);

const CONTINGENCY = 0.0225;
const VAT = 0.2;
const TOL = 0.02;

const VESSEL_MAP = {
  'WEOTT I (Rose)': 'London Rose',
  'WEOTT II (Avontuur)': 'Avontuur',
  'WEOTT III (Golden Sal)': 'Golden Salamander',
};

function money(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildRateIndex() {
  const idx = new Map();
  for (const col of costMother.columns || []) {
    const key = `${col.vessel}|${col.weekly}|${col.day}|${col.group}`;
    for (const item of costMother.items || []) {
      const rate = item.rates?.[String(col.c)];
      if (rate == null) continue;
      if (!idx.has(item.label)) idx.set(item.label, new Map());
      idx.get(item.label).set(key, rate);
    }
  }
  return idx;
}

const RATE_IDX = buildRateIndex();

function lookupRate(label, parts) {
  const map = RATE_IDX.get(label);
  if (!map) return null;
  const key = `${parts.vessel}|${parts.weekly}|${parts.day}|${parts.group}`;
  if (map.has(key)) return map.get(key);
  for (const [k, v] of map.entries()) {
    if (k.startsWith(parts.vessel) && k.includes(parts.day)) return v;
  }
  return null;
}

function hours(emb, dis) {
  const toM = (t) => {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const mins = toM(dis) - toM(emb);
  return mins > 0 ? mins / 60 : 4;
}

function calcWeott(form) {
  const vessel = VESSEL_MAP[form.vesselType?.[0]] || 'Avontuur';
  const parts = {
    vessel,
    weekly: form.weeklyPeriod || 'Mon to Thur',
    day: form.dayPeriod || 'Evening',
    group: form.groupBracket || 'Standard',
  };
  const guests = Number(form.guestCount) || 0;
  const tables = Number(form.noOfTables) || Math.ceil(guests / 8) || 1;
  const hrs = hours(form.embarkation, form.disembarkation);
  let sub = 0;

  for (const label of form.costLineLabels || []) {
    const rate = lookupRate(label, parts);
    if (rate == null) continue;
    const n = norm(label);
    if (n.includes('vessel') || n.includes('venue hire')) sub += rate * hrs;
    else if (n.includes('delivery') || n.includes('contigency') || n.includes('contingency') || n.includes('decor (add'))
      sub += rate;
    else if (n.includes('tableware')) sub += rate * tables;
    else if (n.includes('casino') || n.includes('photobooth') || n.includes('tv')) sub += rate * hrs;
    else if (n.includes('team building')) sub += rate * hrs;
    else if (n.includes('music') || n.includes('background')) sub += rate * hrs;
    else sub += rate * guests;
  }
  let bespoke = 0;
  if (Array.isArray(form.bespokeLines) && form.bespokeLines.some((b) => b.enabled)) {
    for (const b of form.bespokeLines) {
      if (b.enabled && b.amount) bespoke += Number(b.amount);
    }
  } else if (form.bespokeAmount) {
    bespoke += Number(form.bespokeAmount);
  }
  sub += bespoke;
  return money(sub * (1 + CONTINGENCY));
}

function clientTotals(weott, marginPct) {
  const pkg = money(weott * (1 + marginPct / 100));
  const vat = money(pkg * VAT);
  return { pkg, vat, grand: money(pkg + vat) };
}

const rows = [];
let failed = 0;

for (const [id, sc] of Object.entries(goldFinancial)) {
  const f = sc.form;
  const actual = calcWeott(f);
  const delta = money(actual - sc.goldQuoteWeottCost);
  const finOk = Math.abs(delta) <= TOL;
  const derived = clientTotals(sc.goldQuoteWeottCost, sc.marginPercent);
  const wordingOk = Boolean(goldWording[id]);
  const linesOk = (f.costLineLabels || []).length >= 5;
  if (!finOk || !wordingOk || !linesOk) failed++;
  rows.push({
    id,
    label: sc.label,
    expectedWeott: sc.goldQuoteWeottCost,
    actualWeott: actual,
    delta,
    finOk,
    grand: derived.grand,
    wordingOk,
    lines: (f.costLineLabels || []).length,
  });
}

console.log('\nGold playbook rerun (Cost Mother snapshot)\n');
for (const r of rows) {
  console.log(
    `${r.finOk ? 'PASS' : 'FAIL'} ${r.id} — ${r.label}\n` +
      `  WEOTT  expected £${r.expectedWeott.toFixed(2)}  playbook calc £${r.actualWeott.toFixed(2)}  Δ £${r.delta.toFixed(2)}\n` +
      `  Grand target £${r.grand.toFixed(2)} · wording ${r.wordingOk ? 'OK' : 'MISSING'} · ${r.lines} cost lines\n`,
  );
}
console.log(failed ? `${failed} scenario(s) need playbook/rate fix\n` : 'All playbook scenarios PASS\n');
process.exit(failed ? 1 : 0);
