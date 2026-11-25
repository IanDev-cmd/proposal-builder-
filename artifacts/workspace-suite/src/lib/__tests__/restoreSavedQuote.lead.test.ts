import { beforeEach, describe, expect, it } from 'vitest';
import { getQuoteLead, setQuoteLead, type QuoteLead } from '@/lib/quoteLeadStore';
import { restoreSavedQuote } from '@/lib/restoreSavedQuote';
import type { SavedQuote } from '@/lib/savedQuotesStore';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

function lead(partial: Partial<QuoteLead> & Pick<QuoteLead, 'name' | 'referenceNumber'>): QuoteLead {
  return {
    id: 1,
    email: '',
    phone: '',
    designation: '',
    company: '',
    initials: '',
    color: '',
    ...partial,
  };
}

function quote(partial: Partial<SavedQuote> & Pick<SavedQuote, 'id' | 'leadKey' | 'leadName'>): SavedQuote {
  return {
    savedAt: '2026-11-12T13:46:51.000Z',
    title: partial.leadName,
    vesselType: '',
    eventType: '',
    guestCount: '',
    eventDate: '',
    grandTotal: 0,
    step: 1,
    lead: null,
    data: {},
    ...partial,
  };
}

describe('opening a saved quote does not keep the previous client', () => {
  beforeEach(() => {
    const storage = memoryStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
  });

  it('clears the last lead when the opened quote has none', async () => {
    const su = lead({
      name: 'Su Vaughan',
      email: 'su@sriservices.co.uk',
      company: 'SRI Services',
      referenceNumber: 'WE.19316',
      progressNotes: 'Su conference notes',
    });
    const suQuote = quote({
      id: 'quote-WE.19316-V1',
      leadKey: 'WE.19316',
      leadName: 'Su Vaughan',
      referenceNumber: 'WE.19316',
      lead: su,
      data: { progressNotes: 'Su conference notes', guestCount: '150' },
    });
    const michael = quote({
      id: 'quote-WE.19323-V1',
      leadKey: 'WE.19323',
      leadName: 'Michael Emmerson',
      referenceNumber: 'WE.19323',
      lead: null,
      eventType: 'Transfer',
      guestCount: '180',
      data: { eventType: 'Transfer', guestCount: '180', progressNotes: 'DODGY transfer notes' },
    });

    setQuoteLead(su);
    await restoreSavedQuote(suQuote);
    expect(getQuoteLead()?.name).toBe('Su Vaughan');

    await restoreSavedQuote(michael);
    expect(getQuoteLead()).toBeNull();
    expect(suQuote.lead?.email).toBe('su@sriservices.co.uk');
    expect(michael.data).toMatchObject({
      eventType: 'Transfer',
      guestCount: '180',
      progressNotes: 'DODGY transfer notes',
    });
    expect(JSON.stringify(michael)).not.toContain('su@sriservices.co.uk');
  });
});
