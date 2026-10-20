import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUOTE_LINES } from '@/lib/quoteBuilderCatalog';

const here = path.dirname(fileURLToPath(import.meta.url));
const taxonomy = JSON.parse(
  readFileSync(path.resolve(here, '../catalogueTaxonomy.json'), 'utf8'),
) as {
  lines: { id: string; section: string; label: string; multiplier: string }[];
};

const MULTIPLIERS = new Set([
  'vessel_hours',
  'guests',
  'guests_hours',
  'hours',
  'staff_hours',
  'tables',
  'set',
]);

describe('catalogue taxonomy ingestion', () => {
  it('loads every Cost Mother line and multiplier into the quote catalogue', () => {
    expect(taxonomy.lines.length).toBeGreaterThan(50);
    const byId = new Map(QUOTE_LINES.map((line) => [line.id, line]));
    for (const raw of taxonomy.lines) {
      expect(raw.id, raw.label).toBeTruthy();
      expect(raw.section, raw.id).toBeTruthy();
      expect(raw.label, raw.id).toBeTruthy();
      expect(MULTIPLIERS.has(raw.multiplier), raw.id).toBe(true);
      const bound = byId.get(raw.id);
      expect(bound, raw.id).toBeTruthy();
      expect(bound?.multiplier).toBe(raw.multiplier);
      expect(bound?.section).toBe(raw.section);
      expect(bound?.label).toBe(raw.label);
    }
  });
});
