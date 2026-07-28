/**
 * Sync e2e scenarios.json from goldFinancialScenarios.json (Natasha quote sheets).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const goldPath = path.join(ROOT, 'artifacts/workspace-suite/src/lib/assets/goldFinancialScenarios.json');
const scenariosPath = path.join(__dirname, 'scenarios.json');

const gold = JSON.parse(fs.readFileSync(goldPath, 'utf8'));
const existing = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
const metaById = Object.fromEntries(existing.map((s) => [s.id, s]));

const E2E_LABELS = {
  'WE.18900': 'José Rubio / Hannah Charles — Space Made — Christmas V4',
  'WE.18759': 'Mankaasha Umba — The Outnet — Summer V2',
  'WE.18937': 'Loretta Greeley-Ward — Caribou — Wedding Transfer V2',
  'WE.18931': 'Mia Cruickshank — Databarracks — Team Building V2',
};

const out = ['WE.18900', 'WE.18759', 'WE.18937', 'WE.18931'].map((id) => {
  const sc = gold[id];
  const prev = metaById[id] || {};
  const form = { ...sc.form, source: prev.form?.source || 'Build your event form' };
  if (form.bespokeLines?.length) {
    form.bespoke = form.bespokeLines
      .filter((b) => b.enabled && b.amount)
      .map((b) => ({ label: b.label, amount: b.amount }));
  } else if (form.bespokeAmount) {
    form.bespoke = [{ label: form.bespokeLabel || 'Bar tab', amount: form.bespokeAmount }];
  }
  return {
    id,
    label: E2E_LABELS[id] || sc.label,
    goldQuoteVersion: form.quoteVersion,
    goldQuoteWeottCost: sc.goldQuoteWeottCost,
    marginPercent: sc.marginPercent,
    leadFixture: prev.leadFixture || `../proposal-testing-scenario/fixtures/${id}.lead.json`,
    form,
  };
});

fs.writeFileSync(scenariosPath, JSON.stringify(out, null, 2) + '\n');
console.log('Synced', scenariosPath);
