import { calcBaseCostBreakdown, money, type QuoteFormInput } from '@/lib/quoteFinance';

/**
 * Section 2 header must equal the sum of catering lines that are actually selected.
 * Guards the menuType auto-add bug (visible ~£2.9k vs header ~£7.7k)
 * and the selectedUpgrades silent-merge sibling (ticks vs calc).
 */
export function cateringSectionMatchesSelectedLines(form: QuoteFormInput): {
  ok: boolean;
  header: number;
  selectedSum: number;
} {
  const b = calcBaseCostBreakdown(form);
  const selected = new Set(form.selectedLineIds || []);
  const selectedSum = money(
    b.lines
      .filter((l) => l.section === 'catering' && selected.has(l.id))
      .reduce((s, l) => s + l.amount, 0),
  );
  const header = money(b.sectionTotals.catering || 0);
  return { ok: Math.abs(header - selectedSum) < 0.001, header, selectedSum };
}
