import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, Record<string, unknown>>();

vi.mock('@/lib/nexusWorkspaceDb', () => ({
  WORKSPACE_STORES: {
    leads: 'leads',
    savedQuotes: 'savedQuotes',
    proposals: 'proposals',
    opsNotes: 'opsNotes',
    opsQuotes: 'opsQuotes',
    catalog: 'catalog',
    syncOutbox: 'syncOutbox',
  },
  workspacePut: vi.fn(async (_store: string, row: { id: string }) => {
    rows.set(row.id, row);
  }),
  workspaceGetAll: vi.fn(async () => [...rows.values()]),
  workspaceDelete: vi.fn(async (_store: string, id: string) => {
    rows.delete(id);
  }),
  workspaceGet: vi.fn(async (_store: string, id: string) => rows.get(id) ?? null),
}));

import { planQuoteSync } from '@/lib/workspaceTraffic';
import { dequeueSyncOutbox, enqueueSyncOutbox, listSyncOutbox } from '@/lib/syncOutbox';
import { upsertSavedQuote } from '@/lib/savedQuotesStore';

describe('outbox revisions and stale-server rejection', () => {
  beforeEach(() => {
    rows.clear();
    localStorage.clear();
  });

  it('increments the local revision and stamps a UTC time on each edit', () => {
    const first = upsertSavedQuote({
      id: 'quote-1',
      leadKey: 'lead-1',
      title: 'First',
      vesselType: '',
      eventType: 'Meeting',
      guestCount: '10',
      eventDate: '2026-12-02',
      grandTotal: 100,
      step: 1,
      data: { guestCount: '10' },
    });
    const second = upsertSavedQuote({
      ...first,
      data: { guestCount: '12' },
      grandTotal: 120,
    });
    expect(first.syncRevision).toBe(1);
    expect(second.syncRevision).toBe(2);
    expect(second.syncUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(second.syncUpdatedAt! >= first.syncUpdatedAt!).toBe(true);
  });

  it('keeps the local quote when the server revision is older', () => {
    expect(
      planQuoteSync({
        local: { id: 'q', syncRevision: 5, savedAt: '2026-01-01T00:00:00.000Z', data: { a: 1 } },
        remote: { id: 'q', syncRevision: 3, savedAt: '2026-02-01T00:00:00.000Z', data: { a: 0 } },
        deleted: false,
      }),
    ).toBe('upload');
    expect(
      planQuoteSync({
        local: { id: 'q', syncRevision: 4, savedAt: '2026-01-01T00:00:00.000Z', data: { a: 1 } },
        remote: { id: 'q', syncRevision: 8, savedAt: '2026-03-01T00:00:00.000Z', data: { a: 2 } },
        deleted: false,
      }),
    ).toBe('keep');
  });

  it('flushes ten queued edits one id at a time without duplicates', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    for (let n = 0; n < 10; n += 1) {
      await enqueueSyncOutbox('quote', `quote-${n}`, 'offline', {
        revision: n + 1,
        updatedAt: '2026-10-20T08:00:00.000Z',
      });
    }
    const queued = await listSyncOutbox();
    expect(new Set(queued.map((job) => job.entityId)).size).toBe(10);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const flushed: string[] = [];
    for (const job of await listSyncOutbox()) {
      flushed.push(job.entityId);
      await dequeueSyncOutbox(job.kind, job.entityId);
    }
    expect(flushed).toEqual(Array.from({ length: 10 }, (_v, n) => `quote-${n}`));
    expect(await listSyncOutbox()).toEqual([]);
  });
});
