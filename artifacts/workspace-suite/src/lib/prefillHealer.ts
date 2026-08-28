/**
 * Optional catalogue prefill from CRM notes.
 * Remote Gemini matching was retired; applyPrefillHealerMatches still
 * accepts matches if a caller supplies them.
 */
import {
  LOW_CONFIDENCE_THRESHOLD,
  type PrefillMatch,
} from '@/lib/contracts';
import { QUOTE_LINES, findLineByAlias } from '@/lib/quoteBuilderCatalog';
import { MENU_TYPES, VESSEL_TYPES } from '@/lib/formOptions';
import { prefillHealerTasks, type PrefillHealerTasks } from '@/lib/leadPrefill';

const MONEY_FIELD_RE = /^(guestCount|guestCountHigh|marginPercent|discountPercent|commissionPercent|totalCost|noOfTables)$/i;

export async function requestPrefillHealer(_opts: {
  notes: string;
  quoteVersion?: string;
  tasks: PrefillHealerTasks;
}): Promise<PrefillMatch[] | null> {
  return null;
}

function spanFromNotes(notes: string, span: string): string {
  const raw = String(span || '').replace(/\s+/g, ' ').trim();
  if (raw.length < 8) return '';
  const hay = notes.replace(/\s+/g, ' ');
  if (!hay.toLowerCase().includes(raw.toLowerCase())) return '';
  if (/\b(proposal sent|voicemail|spoke to|called|no answer)\b/i.test(raw) && raw.length < 40) return '';
  return raw.slice(0, 220);
}

function resolveLine(value: string) {
  return findLineByAlias(value) || QUOTE_LINES.find((l) => l.label === value) || null;
}

export function applyPrefillHealerMatches<T extends Record<string, unknown>>(opts: {
  matches: PrefillMatch[];
  notes: string;
  data: T;
  tasks: PrefillHealerTasks;
}): {
  data: Partial<T>;
  prefilledKeys: string[];
  prefilledLineIds: string[];
  lowConfidenceKeys: string[];
  removedLineIds: string[];
} {
  const prefilledKeys: string[] = [];
  const prefilledLineIds: string[] = [];
  const lowConfidenceKeys: string[] = [];
  const removedLineIds: string[] = [];
  const patch: Record<string, unknown> = {};
  const selected = new Set((opts.data.selectedLineIds as string[]) || []);
  const menus = [...((opts.data.menuType as string[]) || [])];

  for (const m of opts.matches) {
    const field = String(m.field || '').trim();
    if (MONEY_FIELD_RE.test(field) || /guest/i.test(field)) continue;

    if (field === 'keyItems' && opts.tasks.keyItems) {
      const span = spanFromNotes(opts.notes, m.evidence_span || m.value);
      if (!span) continue;
      if (!String(opts.data.keyItems || '').trim()) {
        patch.keyItems = span;
        prefilledKeys.push('keyItems');
        if (m.confidence < LOW_CONFIDENCE_THRESHOLD) lowConfidenceKeys.push('keyItems');
      }
      continue;
    }

    if (field === 'veto' || (field === 'lineLabel' && m.confidence < LOW_CONFIDENCE_THRESHOLD)) {
      const line = resolveLine(m.value);
      if (line && selected.has(line.id)) {
        selected.delete(line.id);
        removedLineIds.push(line.id);
      }
      continue;
    }

    if (field === 'lineLabel' && m.confidence >= LOW_CONFIDENCE_THRESHOLD) {
      const line = resolveLine(m.value);
      if (!line) continue;
      if (opts.tasks.collisionVeto && /TV - 55|Cocktail Reception/i.test(line.label)) {
        continue;
      }
      if (/Cocktail Reception/i.test(line.label)) continue;
      if (!selected.has(line.id)) {
        selected.add(line.id);
        prefilledLineIds.push(line.id);
      }
      continue;
    }

    if (field === 'menuType' && m.confidence >= LOW_CONFIDENCE_THRESHOLD) {
      const hit = MENU_TYPES.find((x) => x === m.value || x.toLowerCase() === m.value.toLowerCase());
      if (hit && !menus.includes(hit)) {
        menus.push(hit);
        patch.menuType = menus;
        prefilledKeys.push('menuType');
        if (m.confidence < 0.9) lowConfidenceKeys.push('menuType');
      }
      continue;
    }

    if (field === 'vesselType' && m.confidence >= LOW_CONFIDENCE_THRESHOLD) {
      const current = (opts.data.vesselType as string[]) || [];
      if (current.length) continue;
      const hit = VESSEL_TYPES.find((x) => x === m.value || x.toLowerCase().includes(m.value.toLowerCase()));
      if (hit) {
        patch.vesselType = [hit];
        prefilledKeys.push('vesselType');
        if (m.confidence < 0.9) lowConfidenceKeys.push('vesselType');
      }
    }
  }

  if (removedLineIds.length || prefilledLineIds.length) {
    patch.selectedLineIds = [...selected];
  }

  return {
    data: patch as Partial<T>,
    prefilledKeys,
    prefilledLineIds,
    lowConfidenceKeys,
    removedLineIds,
  };
}

export { prefillHealerTasks };
