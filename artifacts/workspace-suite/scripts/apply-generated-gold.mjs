/**
 * Promote goldFinancialScenarios.generated.json → goldFinancialScenarios.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, '../src/lib/assets');

const gen = JSON.parse(fs.readFileSync(path.join(assets, 'goldFinancialScenarios.generated.json'), 'utf8'));

const LABELS = {
  'WE.18900': 'Christmas V4 — Space Made',
  'WE.18759': 'Summer V2 — The Outnet',
  'WE.18931': 'Team Building V2 — Databarracks',
  'WE.18937': 'Wedding Transfer V2 — Caribou',
};

const TRIM = {
  'WE.18900': ['Barbecue'],
  'WE.18759': ['Afternoon Tea'],
  'WE.18937': ['Saxophonist'],
};

const out = {};
for (const [id, raw] of Object.entries(gen)) {
  const trim = new Set(TRIM[id] || []);
  const form = { ...raw.form };
  form.costLineLabels = (form.costLineLabels || []).filter((l) => !trim.has(l));
  out[id] = {
    label: LABELS[id],
    goldQuoteWeottCost: raw.goldQuoteWeottCost,
    marginPercent: raw.marginPercent,
    form,
  };
}

const dest = path.join(assets, 'goldFinancialScenarios.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log('Wrote', dest);
