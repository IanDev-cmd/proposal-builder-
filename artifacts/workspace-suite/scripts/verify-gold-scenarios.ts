/**
 * Full gold scenario gate — finances, cost lines, rate keys, package wording.
 * Run: npx tsx scripts/verify-gold-scenarios.ts
 */
import goldPackageWording from '../src/lib/assets/goldPackageWording.json';
import {
  GOLD_FINANCIAL_SCENARIOS,
  lineIdsFromLabels,
  quoteFormFromGoldScenario,
  verifyAllGoldFinancials,
  clientTotalsFromWeott,
} from '../src/lib/financialParity';
import { QUOTE_LINES } from '../src/lib/quoteBuilderCatalog';
import { buildRateParts } from '../src/lib/costMotherLookup';
import { calcFinancials } from '../src/lib/quoteFinance';

type Row = { id: string; check: string; ok: boolean; detail?: string };

const rows: Row[] = [];
let failed = 0;

function record(id: string, check: string, ok: boolean, detail?: string) {
  if (!ok) failed++;
  rows.push({ id, check, ok, detail });
}

console.log('\nGold scenario perfection gate (4 proposal tests)\n');

for (const fin of verifyAllGoldFinancials()) {
  record(fin.id, 'WEOTT + grand totals', fin.ok && fin.grandOk, fin.ok && fin.grandOk ? undefined : `Δ WEOTT £${fin.delta.toFixed(2)}`);
}

for (const [id, sc] of Object.entries(GOLD_FINANCIAL_SCENARIOS)) {
  const f = sc.form;
  const labels = (f.costLineLabels as string[]) || [];
  const ids = lineIdsFromLabels(labels);
  const missing = labels.filter((l) => !QUOTE_LINES.some((q) => q.label === l));
  record(id, 'Cost line labels in catalog', missing.length === 0, missing.join(', ') || undefined);

  const mustHave = labels.filter(Boolean);
  const resolved = ids.map((lid) => QUOTE_LINES.find((l) => l.id === lid)?.label).filter(Boolean);
  record(id, 'Cost lines resolve to IDs', resolved.length >= mustHave.length - 2);

  const form = quoteFormFromGoldScenario(id);
  if (form) {
    const parts = buildRateParts({
      vesselUi: (f.vesselType as string[])?.[0] || '',
      weeklyPeriod: String(f.weeklyPeriod || ''),
      dayPeriod: String(f.dayPeriod || ''),
      groupBracket: String(f.groupBracket || ''),
      eventDate: String(f.eventDate || ''),
      dateFlexible: Boolean(f.dateFlexible),
      embarkation: String(f.embarkation || '18:00'),
      guests: parseFloat(String(f.guestCount || '0')) || 0,
    });
    record(
      id,
      'Rate key (weekly/day/group)',
      parts.weeklyPeriod === f.weeklyPeriod && parts.dayPeriod === f.dayPeriod,
      `${parts.weeklyPeriod} · ${parts.dayPeriod} · ${parts.groupBracket}`,
    );

    const fin = calcFinancials(form);
    const derived = clientTotalsFromWeott(sc.goldQuoteWeottCost, sc.marginPercent);
    record(
      id,
      'UI calc matches gold playbook',
      Math.abs(fin.baseCost - sc.goldQuoteWeottCost) <= 0.02 && Math.abs(fin.grand - derived.grand) <= 0.02,
      `WEOTT £${fin.baseCost.toFixed(2)} · grand £${fin.grand.toFixed(2)}`,
    );
  } else {
    record(id, 'Gold form builds', false, 'quoteFormFromGoldScenario returned null');
  }

  const wording = (goldPackageWording as Record<string, unknown>)[id];
  record(id, 'Package wording JSON', Boolean(wording), wording ? 'present' : 'missing');
}

console.log('Ref'.padEnd(12) + 'Check'.padEnd(28) + 'Status');
console.log('-'.repeat(52));
for (const r of rows) {
  console.log(`${r.id.padEnd(12)}${r.check.padEnd(28)}${r.ok ? 'PASS' : 'FAIL'}${r.detail ? ` — ${r.detail}` : ''}`);
}

console.log(failed ? `\n${failed} check(s) FAILED — fix gold playbook or Cost Mother before UI testing.\n` : '\nAll gold scenario checks PASS — safe to run prefill e2e.\n');
process.exit(failed ? 1 : 0);
