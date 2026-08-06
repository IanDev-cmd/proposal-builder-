/**
 * Apply embedded gold Quote Sheet playbook when lead ref matches (demo / QA).
 */
import type { GoldScenarioEntry } from '@/lib/financialParity';
import { goldScenarioForRef, lineIdsFromLabels } from '@/lib/financialParity';
import { normalizeBespokeLines } from '@/lib/bespokeLines';
import { QUOTE_LINES } from '@/lib/quoteBuilderCatalog';

export function applyGoldScenarioPlaybook<T extends Record<string, unknown>>(
  ref: string | undefined,
  data: T,
  prefilledKeys: Set<string>,
): T {
  const gold = goldScenarioForRef(ref);
  if (!gold?.form) return data;

  const f = gold.form;
  const next = { ...data } as T & Record<string, unknown>;

  const set = (key: string, val: unknown, prefill = true) => {
    (next as Record<string, unknown>)[key] = val;
    if (prefill) prefilledKeys.add(key);
  };

  if (f.vesselType) set('vesselType', f.vesselType);
  if (f.eventType) set('eventType', f.eventType);
  if (f.quoteVersion) set('quoteVersion', f.quoteVersion);
  if (f.weeklyPeriod) set('weeklyPeriod', f.weeklyPeriod);
  if (f.dayPeriod) set('dayPeriod', f.dayPeriod);
  if (f.groupBracket) set('groupBracket', f.groupBracket);
  if (f.guestCount) set('guestCount', String(f.guestCount));
  if (f.noOfTables) set('noOfTables', String(f.noOfTables));
  if (f.embarkation) set('embarkation', f.embarkation);
  if (f.disembarkation) set('disembarkation', f.disembarkation);
  if (f.departure) set('departure', f.departure);
  if (f.returnTime) set('returnTime', f.returnTime);
  if (f.eventDate) set('eventDate', f.eventDate);
  if (f.dateFlexible != null) set('dateFlexible', f.dateFlexible);
  if (f.menuType) set('menuType', f.menuType);
  if (f.marginPercent != null) set('marginPercent', String(f.marginPercent));
  if (f.lineAmountOverrides && typeof f.lineAmountOverrides === 'object') {
    set('lineAmountOverrides', f.lineAmountOverrides);
  }
  if (f.repeatClient != null) set('repeatClient', f.repeatClient);
  if (f.agentReferral != null) set('agentReferral', f.agentReferral);
  if (f.commissionPercent != null) set('commissionPercent', String(f.commissionPercent));
  if (f.templateId) set('templateId', f.templateId);
  if (f.proposalCategory) set('proposalCategory', f.proposalCategory);
  if (f.requiresInserts != null) set('requiresInserts', f.requiresInserts);
  if (Array.isArray(f.selectedInserts) && f.selectedInserts.length) {
    set('selectedInserts', f.selectedInserts);
    for (const id of f.selectedInserts as string[]) prefilledKeys.add(`insert:${id}`);
  }
  if (f.keyItems) set('keyItems', f.keyItems);

  const labels = (f.costLineLabels as string[]) || [];
  if (labels.length) {
    set('selectedLineIds', lineIdsFromLabels(labels));
    for (const id of lineIdsFromLabels(labels)) {
      const line = QUOTE_LINES.find((l) => l.id === id);
      if (line) prefilledKeys.add(`line:${id}`);
    }
  }

  const bespokeFromForm = f.bespokeLines as
    | { id: string; label: string; amount: number; enabled: boolean }[]
    | undefined;
  const bespokeAmount = f.bespokeAmount as number | undefined;
  const bespokeLabel = f.bespokeLabel as string | undefined;
  if (bespokeFromForm?.length || bespokeAmount) {
    set(
      'bespokeLines',
      normalizeBespokeLines(bespokeFromForm, {
        label: String(bespokeLabel || 'Bar tab'),
        amount: bespokeAmount,
      }),
    );
  }

  // Force formula WEOTT — drop stale manual override when gold playbook applies.
  set('totalCost', '', false);

  return next as T;
}

export function goldTargetsFromRef(ref?: string): GoldScenarioEntry | null {
  return goldScenarioForRef(ref);
}
