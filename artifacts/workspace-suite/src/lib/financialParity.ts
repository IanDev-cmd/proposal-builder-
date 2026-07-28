/**
 * Financial parity — UI calc vs Quote Sheet / progress-notes / gold scenarios.
 */
import goldScenarios from '@/lib/assets/goldFinancialScenarios.json';
import { QUOTE_LINES } from '@/lib/quoteBuilderCatalog';
import {
  calcFinancials,
  money,
  VAT_RATE,
  type QuoteFormInput,
} from '@/lib/quoteFinance';
import type { SheetFinancialColumns } from '@/lib/progressNotesFinance';
import { normalizeBespokeLines } from '@/lib/bespokeLines';

export const FINANCIAL_TOLERANCE = 0.02;

export type GoldScenarioEntry = {
  label: string;
  goldQuoteWeottCost: number;
  marginPercent: number;
  form: Record<string, unknown>;
};

export const GOLD_FINANCIAL_SCENARIOS = goldScenarios as Record<string, GoldScenarioEntry>;

export function goldScenarioForRef(ref?: string): GoldScenarioEntry | null {
  if (!ref) return null;
  return GOLD_FINANCIAL_SCENARIOS[ref] || null;
}

export function lineIdsFromLabels(labels: string[]): string[] {
  const ids = new Set<string>();
  for (const label of labels) {
    const line = QUOTE_LINES.find((l) => l.label === label);
    if (line) ids.add(line.id);
  }
  // Structural defaults (vessel hire, delivery, decor, contingency) — required for WEOTT roll-up.
  for (const line of QUOTE_LINES) {
    if (line.defaultOn) ids.add(line.id);
  }
  return [...ids];
}

export function isGoldScenarioRef(ref?: string | null): boolean {
  return Boolean(ref && GOLD_FINANCIAL_SCENARIOS[ref]);
}

/** Block generate when WEOTT must match sheet / gold North Star. */
export function costApprovalBlocked(
  parity: FinancialParityReport,
  targets: SheetFinancialColumns | null,
): boolean {
  if (!targets?.weottCost) return false;
  if (targets.source === 'gold_scenario' || targets.source === 'sheet_column') {
    return !parity.ok;
  }
  return false;
}

export function clientTotalsFromWeott(weott: number, marginPercent: number) {
  const margin = marginPercent / 100;
  const packageCost = money(weott * (1 + margin));
  const vat = money(packageCost * VAT_RATE);
  const grand = money(packageCost + vat);
  return { weott, packageCost, vat, grand, marginPercent };
}

export type ParityRow = {
  label: string;
  expected?: number;
  actual: number;
  delta?: number;
  ok: boolean;
  source?: string;
};

export type FinancialParityReport = {
  ok: boolean;
  blockApprove: boolean;
  rows: ParityRow[];
  hints: string[];
};

export function financialParityReport(
  fin: ReturnType<typeof calcFinancials>,
  targets: SheetFinancialColumns | null,
  tolerance = FINANCIAL_TOLERANCE,
): FinancialParityReport {
  const rows: ParityRow[] = [];
  const hints: string[] = [];

  const push = (label: string, expected: number | undefined, actual: number, source?: string) => {
    if (expected == null) return;
    const delta = money(actual - expected);
    rows.push({
      label,
      expected,
      actual,
      delta,
      ok: Math.abs(delta) <= tolerance,
      source,
    });
  };

  const derived =
    targets?.weottCost != null && targets.marginPercent != null
      ? clientTotalsFromWeott(targets.weottCost, targets.marginPercent)
      : null;

  push('WEOTT total cost', targets?.weottCost, fin.baseCost, targets?.source);

  if (derived) {
    push('Package (sheet WEOTT × margin)', derived.packageCost, fin.costToClient, 'derived');
    push('VAT (20%)', derived.vat, fin.vat, 'derived');
    push('Grand total', derived.grand, fin.grand, 'derived');
  } else {
    push('Cost to client (exc VAT)', targets?.packageCost, fin.costToClient, targets?.source);
    if (targets?.weottCost != null) {
      const marginPct = fin.margin * 100;
      const fallback = clientTotalsFromWeott(targets.weottCost, marginPct);
      push('VAT (20%)', fallback.vat, fin.vat, 'derived');
      push('Grand total', fallback.grand, fin.grand, 'derived');
    }
  }

  const weottRow = rows.find((r) => r.label === 'WEOTT total cost');
  const blockApprove =
    targets?.weottCost != null &&
    weottRow != null &&
    !weottRow.ok &&
    (targets.source === 'sheet_column' || targets.source === 'gold_scenario');

  if (weottRow && !weottRow.ok) {
    hints.push(
      `WEOTT mismatch £${Math.abs(weottRow.delta || 0).toFixed(2)} — check vessel rate key (weekly/day/group), cost lines, and bespoke.`,
    );
  }

  const ok = rows.length === 0 || rows.every((r) => r.ok);
  return { ok, blockApprove, rows, hints };
}

/** Build QuoteFormInput from embedded gold playbook (self-check / demo). */
export function quoteFormFromGoldScenario(ref: string): QuoteFormInput | null {
  const g = goldScenarioForRef(ref);
  if (!g?.form) return null;
  const f = g.form;
  const labels = (f.costLineLabels as string[]) || [];
  const bespokeAmount = f.bespokeAmount as number | undefined;
  const bespokeFromForm = f.bespokeLines as
    | { id: string; label: string; amount: number; enabled: boolean }[]
    | undefined;
  const bespokeAmount = f.bespokeAmount as number | undefined;
  const bespokeLines = normalizeBespokeLines(bespokeFromForm, {
    label: String(f.bespokeLabel || 'Bar tab'),
    amount: bespokeAmount,
  });
  return {
    vesselType: (f.vesselType as string[]) || [],
    eventType: String(f.eventType || ''),
    eventDate: String(f.eventDate || ''),
    dateFlexible: Boolean(f.dateFlexible),
    guestCount: String(f.guestCount || ''),
    guestCountHigh: String(f.guestCountHigh || f.guestCount || ''),
    embarkation: String(f.embarkation || '10:00'),
    departure: String(f.departure || '12:00'),
    returnTime: String(f.returnTime || '17:00'),
    disembarkation: String(f.disembarkation || '18:00'),
    menuType: (f.menuType as string[]) || [],
    repeatClient: Boolean(f.repeatClient),
    totalCost: '',
    selectedUpgrades: [],
    agentReferral: Boolean(f.agentReferral),
    marginOverride:
      f.marginPercent != null && String(f.marginPercent).trim() !== ''
        ? Number(f.marginPercent) / 100
        : null,
    weeklyPeriod: String(f.weeklyPeriod || ''),
    dayPeriod: String(f.dayPeriod || ''),
    groupBracket: String(f.groupBracket || ''),
    noOfTables: String(f.noOfTables || ''),
    selectedLineIds: lineIdsFromLabels(labels),
    bespokeLines,
    discountPercent: String(f.discountPercent || ''),
    commissionPercent: String(f.commissionPercent ?? ''),
  };
}

export type GoldVerifyResult = {
  id: string;
  label: string;
  expectedWeott: number;
  actualWeott: number;
  delta: number;
  ok: boolean;
  expectedGrand: number;
  actualGrand: number;
  grandOk: boolean;
};

/** Run all gold scenarios against Cost Mother calc (CI / dev script). */
export function verifyAllGoldFinancials(): GoldVerifyResult[] {
  return Object.entries(GOLD_FINANCIAL_SCENARIOS).map(([id, sc]) => {
    const form = quoteFormFromGoldScenario(id);
    if (!form) {
      return {
        id,
        label: sc.label,
        expectedWeott: sc.goldQuoteWeottCost,
        actualWeott: 0,
        delta: sc.goldQuoteWeottCost,
        ok: false,
        expectedGrand: 0,
        actualGrand: 0,
        grandOk: false,
      };
    }
    const fin = calcFinancials(form);
    const delta = money(fin.baseCost - sc.goldQuoteWeottCost);
    const derived = clientTotalsFromWeott(sc.goldQuoteWeottCost, sc.marginPercent);
    return {
      id,
      label: sc.label,
      expectedWeott: sc.goldQuoteWeottCost,
      actualWeott: fin.baseCost,
      delta,
      ok: Math.abs(delta) <= FINANCIAL_TOLERANCE,
      expectedGrand: derived.grand,
      actualGrand: fin.grand,
      grandOk: Math.abs(fin.grand - derived.grand) <= FINANCIAL_TOLERANCE,
    };
  });
}
