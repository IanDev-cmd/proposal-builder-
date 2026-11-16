import { describe, expect, it } from 'vitest';
import { planQuoteSync } from '@/lib/workspaceTraffic';

const body = { guestCount: '180', selectedLineIds: ['staff_chef'] };

describe('planQuoteSync', () => {
  it('fetches when the server is newer even if this device already has the form', () => {
    expect(
      planQuoteSync({
        local: { id: 'quote-WE.19296-V1', updatedAt: '2026-10-22T09:50:52.000Z', data: body, syncRevision: 4 },
        remote: { id: 'quote-WE.19296-V1', updatedAt: '2026-11-03T18:40:14.000Z', syncRevision: 2 },
        deleted: false,
      }),
    ).toBe('fetch');
  });

  it('uploads only when the local edit is newer', () => {
    expect(
      planQuoteSync({
        local: { id: 'quote-WE.19296-V1', updatedAt: '2026-11-04T10:00:00.000Z', data: body },
        remote: { id: 'quote-WE.19296-V1', updatedAt: '2026-11-03T18:40:14.000Z' },
        deleted: false,
      }),
    ).toBe('upload');
  });

  it('keeps an equal revision', () => {
    expect(
      planQuoteSync({
        local: { id: 'q', updatedAt: '2026-11-03T18:40:14.000Z', syncRevision: 3, savedAt: '2026-10-22T09:50:52.000Z', data: body },
        remote: { id: 'q', updatedAt: '2026-11-03T18:40:14.000Z', syncRevision: 3, savedAt: '2026-10-22T09:50:52.000Z' },
        deleted: false,
      }),
    ).toBe('keep');
  });

  it('does not delete the server row for a stale tombstone', () => {
    expect(
      planQuoteSync({
        local: null,
        remote: { id: 'quote-WE.19306-V2', updatedAt: '2026-11-03T18:40:11.000Z' },
        deleted: true,
        deletedThisSession: false,
      }),
    ).toBe('fetch');
  });

  it('drops the server row only when this session deleted it', () => {
    expect(
      planQuoteSync({
        local: null,
        remote: { id: 'quote-WE.19254-V3' },
        deleted: true,
        deletedThisSession: true,
      }),
    ).toBe('drop-remote');
  });
});
