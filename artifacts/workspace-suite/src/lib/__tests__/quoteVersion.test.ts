import { describe, expect, it } from 'vitest';
import {
  findSavedQuoteByVersion,
  nextFreeQuoteVersion,
  nextQuoteVersion,
  quoteLeadKey,
  quoteVersionOf,
  retitleQuoteVersion,
  savedQuoteId,
} from '@/lib/quoteBuilderCatalog';

describe('next quote version', () => {
  it('adds one to the version on the card', () => {
    expect(nextQuoteVersion('V1')).toBe('V2');
    expect(nextQuoteVersion('V2')).toBe('V3');
    expect(nextQuoteVersion('BF Costs')).toBe('V1');
  });

  it('skips a version that already has its own card', () => {
    const quotes = [
      { id: savedQuoteId('WE.19282', 'V1'), leadKey: 'WE.19282', data: { quoteVersion: 'V1' } },
      { id: savedQuoteId('WE.19282', 'V2'), leadKey: 'WE.19282', data: { quoteVersion: 'V2' } },
    ];
    expect(nextFreeQuoteVersion(quotes, 'WE.19282', 'V1')).toBe('V3');
    expect(savedQuoteId('WE.19282', 'V3')).not.toBe(quotes[0].id);
  });

  it('refuses the shared quote-draft id', () => {
    expect(quoteLeadKey({ fallbackKey: 'quote-draft' })).toBe('');
    expect(savedQuoteId('quote-draft', 'V1')).toBe('');
    expect(savedQuoteId('quote-draft', 'V2')).toBe('');
    expect(savedQuoteId('WE.19306', 'V2')).toBe('quote-WE.19306-V2');
  });

  it('opens the quote whose lead key matches, even when the costs match another lead', () => {
    const shared = { guestCount: '50', grandTotal: 9558 };
    const quotes = [
      { id: savedQuoteId('WE.19314', 'V1'), leadKey: 'WE.19314', data: { quoteVersion: 'V1', ...shared, keyItems: 'ROSE' } },
      {
        id: savedQuoteId('WE.19299', 'V1'),
        leadKey: 'WE.19299',
        data: { quoteVersion: 'V1', ...shared, keyItems: 'ROSE, REMOVE PHOTOGRAPHER' },
      },
    ];
    expect(findSavedQuoteByVersion(quotes, 'WE.19314', 'V1')?.id).toBe('quote-WE.19314-V1');
    expect(findSavedQuoteByVersion(quotes, 'WE.19299', 'V1')?.data.keyItems).toContain('REMOVE PHOTOGRAPHER');
  });

  it('reads the version from the saved form and retitles only that token', () => {
    expect(quoteVersionOf({ data: { quoteVersion: 'V1' }, title: 'WE.19282_V1 (V1)' })).toBe('V1');
    expect(retitleQuoteVersion('Proposal - Tracy - WE.19282_V1 (V1)', 'V1', 'V2')).toBe(
      'Proposal - Tracy - WE.19282_V2 (V2)',
    );
    expect(retitleQuoteVersion('WE.19282_V10', 'V1', 'V2')).toBe('WE.19282_V10');
  });
});
