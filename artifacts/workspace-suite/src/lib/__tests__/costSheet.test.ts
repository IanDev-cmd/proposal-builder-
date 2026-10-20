import { describe, expect, it } from 'vitest';
import { costSheetCsv, displayGrandTotal, linesWithContingency } from '@/lib/costSheet';
import { calcFinancials, money, type QuoteFormInput } from '@/lib/quoteFinance';

function form(overrides: Partial<QuoteFormInput> = {}): QuoteFormInput {
  return {
    vesselType: ['WEOTT I (Rose)'],
    eventType: 'Christmas Event',
    eventDate: '2026-12-10',
    guestCount: '55',
    embarkation: '18:00',
    departure: '18:00',
    returnTime: '23:30',
    disembarkation: '23:30',
    menuType: [],
    repeatClient: false,
    totalCost: '',
    baseCostAuto: true,
    selectedUpgrades: [],
    marginPercent: '25',
    weeklyPeriod: 'Mon to Thur',
    dayPeriod: 'Evening',
    groupBracket: 'Standard',
    noOfTables: '',
    selectedLineIds: ['in_house_unit_management_packing_team'],
    lineAmountOverrides: { 'Unit Management (Packing team)': 1000 },
    ...overrides,
  };
}

describe('cost sheet contingency row', () => {
  it('prints contingency so the rows add up to Total to WEOTT', () => {
    const input = form();
    const fin = calcFinancials(input);
    const csv = costSheetCsv(input, 'Christmas Event V1');
    expect(csv).toContain('Contingency (2.25%)');
    expect(csv).toContain(fin.contingency.toFixed(2));
    const lineSum = linesWithContingency(fin).reduce((sum, line) => sum + (line.amount || 0), 0);
    expect(money(lineSum)).toBe(fin.baseCost);
  });

  it('uses the recalculated grand total when cost lines were saved', () => {
    const input = form();
    const fin = calcFinancials(input);
    expect(displayGrandTotal({ grandTotal: 1, data: input as unknown as Record<string, unknown> })).toBe(fin.grand);
    expect(displayGrandTotal({ grandTotal: 11582 })).toBe(11582);
  });
});
