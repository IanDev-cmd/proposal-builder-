import { describe, expect, it } from 'vitest';
import { buildLeadPrefill } from '@/lib/leadPrefill';
import { calcFinancials } from '@/lib/quoteFinance';
import type { QuoteLead } from '@/lib/quoteLeadStore';

const lead = {
  id: 19311,
  name: 'Lucy Palmer',
  email: 'lucy@example.com',
  phone: '',
  designation: '',
  company: 'LexisNexis',
  referenceNumber: 'WE.19311',
  initials: 'LP',
  color: '#FF5A45',
  eventType: 'Social Gathering',
  fullEventDate: '2027-03-11',
  eventDateDisplay: '2027-03-11',
  requestedEventTimes: '18:00 - 22:00',
  groupSizeQuote: '230',
  vessels: 'WEOTT V (Dixie Queen)',
  progressNotes: 'Spoke to the client about parking. No vessel is named in this note.',
} as QuoteLead;

describe('lead prefill uses the lead fields before the notes', () => {
  it('fills vessel, event, date, timings, and guests when the notes omit the vessel', () => {
    const prefill = buildLeadPrefill(lead, { vesselType: [], eventType: '', guestCount: '', eventDate: '' }, []);
    const data = prefill.data as {
      vesselType?: string[];
      eventType?: string;
      eventDate?: string;
      guestCount?: string;
      departure?: string;
    };
    expect(data.vesselType?.length).toBeGreaterThan(0);
    expect(String(data.vesselType?.[0] || '')).toMatch(/Dixie|WEOTT V/i);
    expect(data.eventType).toBe('Social Gathering');
    expect(data.eventDate).toBe('2027-03-11');
    expect(data.guestCount).toBe('230');
    expect(data.departure || data.eventDate).toBeTruthy();
    const fin = calcFinancials({
      vesselType: data.vesselType || [],
      eventType: data.eventType || '',
      eventDate: data.eventDate || '',
      guestCount: data.guestCount || '',
      embarkation: '18:00',
      departure: '18:00',
      returnTime: '22:00',
      disembarkation: '22:00',
      menuType: [],
      repeatClient: false,
      totalCost: '1000',
      baseCostAuto: false,
      selectedUpgrades: [],
      marginPercent: '10',
      weeklyPeriod: 'Thur to Sun',
      dayPeriod: 'Evening',
      groupBracket: 'Standard',
      noOfTables: '10',
      selectedLineIds: [],
    });
    expect(fin.baseCost).toBeGreaterThan(0);
    expect(fin.grand).toBeGreaterThan(0);
  });
});
