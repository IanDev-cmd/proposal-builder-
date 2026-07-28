/**
 * Verify UI Cost Mother roll-up vs gold Quote Sheet WEOTT targets.
 * Run: npx tsx scripts/verify-gold-financials.ts
 */
import { verifyAllGoldFinancials } from '../src/lib/financialParity';

const results = verifyAllGoldFinancials();
let failed = 0;

console.log('\nGold financial parity (WEOTT + grand)\n');
for (const r of results) {
  const status = r.ok && r.grandOk ? 'PASS' : 'FAIL';
  if (status === 'FAIL') failed++;
  console.log(
    `${status} ${r.id} — ${r.label}\n` +
      `  WEOTT  expected £${r.expectedWeott.toFixed(2)}  actual £${r.actualWeott.toFixed(2)}  Δ £${r.delta.toFixed(2)}\n` +
      `  Grand  expected £${r.expectedGrand.toFixed(2)}  actual £${r.actualGrand.toFixed(2)}\n`,
  );
}

console.log(failed ? `\n${failed} scenario(s) FAILED\n` : '\nAll gold scenarios PASS\n');
process.exit(failed ? 1 : 0);
