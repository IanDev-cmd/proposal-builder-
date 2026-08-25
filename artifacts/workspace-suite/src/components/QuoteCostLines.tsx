import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  SECTION_META,
  linesForSection,
  type QuoteSectionId,
} from '@/lib/quoteBuilderCatalog';
import type { BespokeLine, QuoteFormInput } from '@/lib/quoteFinance';
import { calcBaseCostBreakdown, CONTINGENCY_RATE, money } from '@/lib/quoteFinance';

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
  const calcData = useMemo(
    () => ({ ...data, selectedLineIds, bespokeLines }),
    [data, selectedLineIds, bespokeLines],
  );
  const breakdown = useMemo(() => calcBaseCostBreakdown(calcData), [calcData]);
  const amountById = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of breakdown.lines) m.set(l.id, l.amount);
    return m;
  }, [breakdown.lines]);
  const noteById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of breakdown.lines) {
      if (l.note) m.set(l.id, l.note);
    }
    return m;
  }, [breakdown.lines]);
  const missingVessel = !(data.vesselType && data.vesselType[0]);

  const toggleOpen = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  const sections = SECTION_META.filter((s) => s.id !== 'contingency');

  return (
    <div className="flex flex-col gap-3">
      {missingVessel ? (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-950">
          <p className="font-semibold">No vessel selected — all line costs show as £0.00</p>
          <p className="mt-0.5 text-amber-900/80">
            Pick a vessel on Event Core so Cost Mother can resolve unit rates for the period / day / group key.
          </p>
        </div>
      ) : null}
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
              <div className="flex flex-col gap-2 border-t border-[#f0f0f0] p-3 relative z-[2]">
                {bespokeLines.map((b, idx) => (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2 rounded-[8px] p-1`}
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
                      type="text"
                      value={b.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        const next = [...bespokeLines];
                        next[idx] = { ...b, label, enabled: Boolean(label.trim() || b.amount) };
                        onBespokeChange(next);
                      }}
                      placeholder="Type a description"
                      className="relative z-[2] flex-1 rounded-[8px] border border-[#e3e6e4] bg-white px-3 py-2 text-[12.5px] text-slate-900 caret-slate-900"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={b.amount ? String(b.amount) : ''}
                      onChange={(e) => {
                        const amount = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                        const next = [...bespokeLines];
                        next[idx] = {
                          ...b,
                          amount,
                          enabled: amount > 0 || Boolean(String(b.label || '').trim()),
                        };
                        onBespokeChange(next);
                      }}
                      placeholder="£"
                      className="relative z-[2] w-24 rounded-[8px] border border-[#e3e6e4] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#00e676]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    onBespokeChange([
                      ...bespokeLines,
                      { id: `bespoke_${Date.now()}`, label: '', amount: 0, enabled: false },
                    ])
                  }
                  className="mt-1 rounded-[8px] border border-dashed border-[#d0d0d0] px-3 py-2 text-left text-[12px] font-semibold text-gray-500 hover:border-[#FF5A45]/40 hover:text-gray-700"
                >
                  + Add a bespoke line
                </button>
              </div>
            </div>
          );
        }

        const lines = linesForSection(sec.id as QuoteSectionId);
        const secTotal = money(breakdown.sectionTotals[sec.id] || 0);
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
                  const note = noteById.get(line.id) || '';
                  const noRate =
                    on &&
                    amt <= 0 &&
                    (/no rate|missing vessel|rate is 0|no cost mother/i.test(note) || missingVessel);
                  return (
                    <button
                      key={line.id}
                      type="button"
                      onClick={() => onToggleLine(line.id)}
                      title={note || undefined}
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
                      <span
                        className={`text-[12px] font-semibold ${
                          on ? (noRate ? 'text-amber-600' : 'text-[#00e676]') : 'text-gray-300'
                        }`}
                      >
                        {on ? (noRate ? 'No rate' : `£${amt.toFixed(2)}`) : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between rounded-[10px] border border-[#e3e6e4] bg-[#fafafa] px-4 py-3">
          <span className="text-[12px] font-semibold text-gray-700">Cost lines (Sections 1–6, 8–13)</span>
          <span className="text-[13px] font-bold text-[#00e676]">
            £{money(breakdown.subtotalBeforeContingency - (breakdown.sectionTotals.bespoke || 0)).toFixed(2)}
          </span>
        </div>
        {(breakdown.sectionTotals.bespoke || 0) > 0 && (
          <div className="flex items-center justify-between rounded-[10px] border border-[#e3e6e4] bg-[#fafafa] px-4 py-3">
            <span className="text-[12px] font-semibold text-gray-700">Section 7 — Bespoke</span>
            <span className="text-[13px] font-bold text-[#00e676]">
              £{(breakdown.sectionTotals.bespoke || 0).toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between rounded-[10px] border border-[#e3e6e4] px-4 py-3">
          <span className="text-[12px] font-semibold text-gray-700">Subtotal before contingency</span>
          <span className="text-[13px] font-bold text-gray-800">
            £{breakdown.subtotalBeforeContingency.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-[10px] border border-[#e3e6e4] px-4 py-3">
          <span className="text-[12px] font-semibold text-gray-700">
            Contingency ({(CONTINGENCY_RATE * 100).toFixed(2)}%)
          </span>
          <span className="text-[13px] font-bold text-gray-800">£{breakdown.contingency.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between rounded-[10px] border border-[#FF5A45] bg-[#FFF1F0] px-4 py-3">
          <span className="text-[12px] font-semibold text-[#E22A12]">Total to WEOTT (Sections 1–14)</span>
          <span className="text-[14px] font-black text-[#00e676]">£{breakdown.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
