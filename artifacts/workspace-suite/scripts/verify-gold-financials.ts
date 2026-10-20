import { FINANCIAL_TOLERANCE, verifyAllGoldFinancials } from '../src/lib/financialParity.ts';

const rows = verifyAllGoldFinancials();
let failed = 0;
for (const row of rows) {
  const weottDrift = Math.abs(row.delta);
  const grandDrift = Math.abs(row.actualGrand - row.expectedGrand);
  const ok = row.ok && row.grandOk && weottDrift <= FINANCIAL_TOLERANCE && grandDrift <= FINANCIAL_TOLERANCE;
  const mark = ok ? 'ok' : 'FAIL';
  console.log(
    `${mark} ${row.id} weott ${row.actualWeott} vs ${row.expectedWeott} (drift ${weottDrift.toFixed(2)}) grand ${row.actualGrand} vs ${row.expectedGrand}`,
  );
  if (!ok) failed += 1;
}
if (!rows.length) {
  console.error('no gold financial scenarios');
  process.exit(1);
}
if (failed) {
  console.error(`${failed} gold scenario(s) drifted by more than £${FINANCIAL_TOLERANCE.toFixed(2)}`);
  process.exit(1);
}
console.log(`${rows.length} gold scenarios within £${FINANCIAL_TOLERANCE.toFixed(2)}`);
