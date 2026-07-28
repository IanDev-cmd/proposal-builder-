import { quoteFormFromGoldScenario } from '../src/lib/financialParity';
import { calcBaseCostBreakdown } from '../src/lib/quoteFinance';

for (const id of ['WE.18900', 'WE.18759', 'WE.18931', 'WE.18937']) {
  const f = quoteFormFromGoldScenario(id);
  if (!f) continue;
  const b = calcBaseCostBreakdown(f);
  console.log(`\n=== ${id} WEOTT ${b.total} (target from gold JSON) ===`);
  console.log('rateParts', b.rateParts);
  console.log('sectionTotals', JSON.stringify(b.sectionTotals, null, 2));
  const missing = b.lines.filter((l) => l.unitRate == null && l.section !== 'bespoke');
  if (missing.length) {
    console.log('MISSING RATES:', missing.map((l) => l.label).join(' | '));
  }
  const top = b.lines.filter((l) => l.amount > 0).sort((a, c) => c.amount - a.amount).slice(0, 12);
  for (const l of top) {
    console.log(`  ${l.amount.toFixed(2).padStart(10)}  ${l.label} (${l.multiplier} × ${l.unitRate ?? '?'})`);
  }
}
