import { describe, expect, it } from 'vitest';
import { FINANCIAL_TOLERANCE, verifyAllGoldFinancials } from '@/lib/financialParity';

describe('gold financial backtest', () => {
  it('keeps every gold scenario within £0.02 of WEOTT and the client grand total', () => {
    const rows = verifyAllGoldFinancials();
    expect(rows.length).toBeGreaterThan(0);
    const drifted = rows.filter((row) => {
      const weott = Math.abs(row.delta);
      const grand = Math.abs(row.actualGrand - row.expectedGrand);
      return !row.ok || !row.grandOk || weott > FINANCIAL_TOLERANCE || grand > FINANCIAL_TOLERANCE;
    });
    expect(drifted, drifted.map((row) => `${row.id} weott ${row.delta} grand ${row.actualGrand - row.expectedGrand}`).join('; ')).toEqual([]);
  });
});
