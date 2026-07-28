import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  SECTION_META,
  linesForSection,
  type QuoteSectionId,
} from '@/lib/quoteBuilderCatalog';
import type { BespokeLine, QuoteFormInput } from '@/lib/quoteFinance';
import { calcBaseCostBreakdown } from '@/lib/quoteFinance';

import { PREFILL_INPUT_CLS } from '@/lib/leadPrefill';

type Props = {
  data: QuoteFormInput;
  selectedLineIds: string[];
  bespokeLines: BespokeLine[];
  prefilledLineIds?: Set<string>;
  prefilledBespoke?: boolean;
  onToggleLine: (id: string) => void;
  onBespokeChange: (lines: BespokeLine[]) => void;
};

export function QuoteCostLines({
  data,
  selectedLineIds,
  bespokeLines,
  prefilledLineIds,
  prefilledBespoke,
  onToggleLine,
  onBespokeChange,
}: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTION_META.map((s) => [s.id, s.id === 'catering' || s.id === 'entertainment'])),
  );
  const selected = useMemo(() => new Set(selectedLineIds), [selectedLineIds]);
  const breakdown = useMemo(() => calcBaseCostBreakdown(data), [data]);
  const amountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of breakdown.lines) m.set(l.id, l.amount);
    return m;
  }, [breakdown.lines]);

  const toggleOpen = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  const sections = SECTION_META.filter((s) => s.id !== 'contingency');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-gray-500">
        YES lines from Quote Builder 2026 · rates from Cost Mother
        {breakdown.rateParts
          ? ` (${breakdown.rateParts.vessel} · ${breakdown.rateParts.weeklyPeriod} · ${breakdown.rateParts.dayPeriod} · ${breakdown.rateParts.groupBracket})`
          : ''}
        . Untick to remove a default add-on.
      </p>

      {sections.map((sec) => {
        if (sec.id === 'bespoke') {
          const secTotal = breakdown.sectionTotals.bespoke || 0;
          return (
            <div key={sec.id} className="overflow-hidden rounded-[10px] border border-[#e3e6e4]">
              <div className="bg-[#fafafa] px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">{sec.title}</p>
                    <p className="text-[11px] text-gray-400">{sec.hint || 'Manual amounts (bar tab, extras, etc.)'}</p>
                  </div>
                  <span className="text-[13px] font-bold text-[#00e676]">£{secTotal.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-[#f0f0f0] p-3">
                {bespokeLines.map((b, idx) => (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2 rounded-[8px] p-1 ${prefilledBespoke && b.enabled ? PREFILL_INPUT_CLS : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...bespokeLines];
                        next[idx] = { ...b, enabled: !b.enabled };
                        onBespokeChange(next);
                      }}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ${
                        b.enabled ? 'bg-[#FF5A45]' : 'border border-[#d0d0d0]'
                      }`}
                    >
                      {b.enabled && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </button>
                    <input
                      value={b.label}
                      onChange={(e) => {
                        const next = [...bespokeLines];
                        next[idx] = { ...b, label: e.target.value };
                        onBespokeChange(next);
                      }}
                      placeholder={`Bespoke (${idx + 1})`}
                      className="flex-1 rounded-[8px] border border-[#e3e6e4] px-3 py-2 text-[12.5px]"
                    />
                    <input
                      type="number"
                      min={0}
                      value={b.amount || ''}
                      onChange={(e) => {
                        const next = [...bespokeLines];
                        next[idx] = { ...b, amount: parseFloat(e.target.value) || 0, enabled: true };
                        onBespokeChange(next);
                      }}
                      placeholder="£"
                      className="w-24 rounded-[8px] border border-[#e3e6e4] px-3 py-2 text-[12.5px] font-semibold text-[#00e676]"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        const lines = linesForSection(sec.id as QuoteSectionId);
        const secTotal = breakdown.sectionTotals[sec.id] || 0;
        const selectedCount = lines.filter((l) => selected.has(l.id)).length;
        const isOpen = open[sec.id];
        return (
          <div key={sec.id} className="overflow-hidden rounded-[10px] border border-[#e3e6e4]">
            <button
              type="button"
              onClick={() => toggleOpen(sec.id)}
              className="flex w-full items-center justify-between bg-[#fafafa] px-4 py-3 text-left"
            >
              <div>
                <p className="text-[13px] font-semibold text-gray-800">{sec.title}</p>
                {sec.hint && <p className="text-[11px] text-gray-400">{sec.hint}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-400">
                  {selectedCount}/{lines.length}
                </span>
                <span className="text-[13px] font-bold text-[#00e676]">£{secTotal.toFixed(2)}</span>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-1 border-t border-[#f0f0f0] p-2">
                {lines.map((line) => {
                  const on = selected.has(line.id);
                  const amt = amountById.get(line.id) || 0;
                  return (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => onToggleLine(line.id)}
                      className={`flex items-center justify-between rounded-[8px] px-3 py-2.5 text-left transition-colors ${
                        on
                          ? prefilledLineIds?.has(line.id)
                            ? `bg-blue-50 ${PREFILL_INPUT_CLS}`
                            : 'bg-[#FFF1F0]'
                          : 'hover:bg-[#fafafa]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] ${
                            on ? 'bg-[#FF5A45]' : 'border border-[#d0d0d0]'
                          }`}
                        >
                          {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-[12.5px] font-medium text-gray-800">{line.label}</span>
                      </div>
                      <span className={`text-[12px] font-semibold ${on ? 'text-[#00e676]' : 'text-gray-300'}`}>
                        {on ? `£${amt.toFixed(2)}` : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between rounded-[10px] border border-[#FF5A45] bg-[#FFF1F0] px-4 py-3">
        <span className="text-[12px] font-semibold text-[#E22A12]">
          Sections 1–13 subtotal
        </span>
        <span className="text-[14px] font-black text-[#00e676]">
          £{breakdown.subtotalBeforeContingency.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
