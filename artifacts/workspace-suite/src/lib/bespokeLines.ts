import type { BespokeLine } from '@/lib/quoteFinance';

export type BespokeLineInput = {
  id?: string;
  label?: string;
  amount?: number;
  enabled?: boolean;
};

const EMPTY_SLOTS: BespokeLine[] = [1, 2, 3, 4].map((n) => ({
  id: `bespoke_${n}`,
  label: '',
  amount: 0,
  enabled: false,
}));

/** Normalize gold / lead bespoke rows into four UI slots (labels + amounts). */
export function normalizeBespokeLines(
  fromGold?: BespokeLineInput[],
  fallback?: { label?: string; amount?: number },
): BespokeLine[] {
  const slots = EMPTY_SLOTS.map((s) => ({ ...s }));

  if (fromGold?.length) {
    fromGold.forEach((g, i) => {
      if (i >= slots.length) return;
      const amount = Number(g.amount) || 0;
      const enabled = Boolean(g.enabled) && amount > 0;
      const label = (g.label || '').trim();
      slots[i] = {
        id: `bespoke_${i + 1}`,
        label: label || (i === 0 && fallback?.label ? fallback.label : ''),
        amount,
        enabled,
      };
    });
    return slots;
  }

  if (fallback?.amount && fallback.amount > 0) {
    slots[0] = {
      ...slots[0],
      label: fallback.label || 'Bar tab',
      amount: fallback.amount,
      enabled: true,
    };
  }

  return slots;
}

export function bespokeTotal(lines: BespokeLine[]): number {
  return lines.reduce((s, b) => (b.enabled && b.amount ? s + b.amount : s), 0);
}
