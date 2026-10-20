import { describe, expect, it } from 'vitest';
import { getQuoteLines } from '@/lib/quoteBuilderCatalog';
import {
  CONTINGENCY_RATE,
  MIN_BILLABLE_HOURS,
  STAFF_HOURS_BUFFER,
  VAT_RATE,
  calcFinancials,
  calcSectionLines,
  eventHours,
  money,
  pound,
  type QuoteFormInput,
} from '@/lib/quoteFinance';

function form(overrides: Partial<QuoteFormInput> = {}): QuoteFormInput {
  return {
    vesselType: ['WEOTT II (Avontuur)'],
    eventType: 'Christmas Event',
    eventDate: '2026-12-02',
    guestCount: '50',
    embarkation: '18:00',
    departure: '18:00',
    returnTime: '20:00',
    disembarkation: '20:00',
    menuType: [],
    repeatClient: false,
    totalCost: '',
    baseCostAuto: true,
    selectedUpgrades: [],
    marginPercent: '25',
    weeklyPeriod: 'Mon to Thur',
    dayPeriod: 'Evening',
    groupBracket: 'Standard',
    noOfTables: '15',
    selectedLineIds: [],
    ...overrides,
  };
}

describe('quoteFinance formulas', () => {
  it('keeps the catalogue rates for VAT, contingency, minimum hours, and staff buffers', () => {
    expect(VAT_RATE).toBe(0.2);
    expect(CONTINGENCY_RATE).toBe(0.0225);
    expect(MIN_BILLABLE_HOURS).toBe(4);
    expect(STAFF_HOURS_BUFFER).toBe(3);
    const manager = getQuoteLines().find((line) => line.id === 'staff_event_manager_in_house_member_of_team');
    const coordinator = getQuoteLines().find((line) => line.id === 'staff_event_coordinator_in_house_member_of_team');
    expect(manager?.staffBuffer).toBe(4);
    expect(coordinator?.multiplier).toBe('staff_hours');
    expect(coordinator?.staffBuffer).toBeUndefined();
  });

  it('bills a short event at the 4 hour minimum and adds staff buffers', () => {
    expect(eventHours(form())).toBe(2);
    const section = calcSectionLines(
      form({
        selectedLineIds: [
          'staff_event_manager_in_house_member_of_team',
          'staff_event_coordinator_in_house_member_of_team',
        ],
      }),
    );
    const manager = section.lines.find((line) => line.id === 'staff_event_manager_in_house_member_of_team');
    const coordinator = section.lines.find((line) => line.id === 'staff_event_coordinator_in_house_member_of_team');
    expect(manager?.multiplier).toBe(MIN_BILLABLE_HOURS + 4);
    expect(coordinator?.multiplier).toBe(MIN_BILLABLE_HOURS + STAFF_HOURS_BUFFER);
  });

  it('applies 2.25% contingency and 20% VAT, with client totals in whole pounds', () => {
    const fin = calcFinancials(
      form({
        selectedLineIds: ['in_house_unit_management_packing_team'],
        lineAmountOverrides: { 'Unit Management (Packing team)': 1000 },
        marginPercent: '25',
      }),
    );
    expect(fin.contingencyRate).toBe(0.0225);
    expect(fin.baseCost).toBe(money(1000 * 1.0225));
    expect(fin.vatRate).toBe(0.2);
    expect(fin.marginAmount).toBe(pound(fin.baseCost * 0.25));
    expect(fin.costToClient).toBe(pound(fin.baseCost + fin.marginAmount));
    expect(fin.vat).toBe(pound(fin.costToClient * 0.2));
    expect(fin.grand).toBe(fin.costToClient + fin.vat);
    expect(Number.isInteger(fin.costToClient)).toBe(true);
    expect(Number.isInteger(fin.vat)).toBe(true);
    expect(Number.isInteger(fin.grand)).toBe(true);
  });

  it('keeps line money at 2 decimal places and rounds client pounds half away from zero via Math.round', () => {
    expect(money(10.005)).toBe(10.01);
    expect(money(10.004)).toBe(10);
    expect(pound(10.5)).toBe(11);
    expect(pound(10.4)).toBe(10);
  });
});
