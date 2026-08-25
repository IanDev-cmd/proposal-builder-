import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SECTION_META, type QuoteSectionId } from '@/lib/quoteBuilderCatalog';
import type { LineCalc } from '@/lib/quoteFinance';

type Props = {
  lines: LineCalc[];
  sectionTotals?: Record<string, number>;
  defaultOpen?: QuoteSectionId[];
};

export function CostSectionAccordion({ lines, sectionTotals, defaultOpen }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, LineCalc[]>();
    for (const line of lines || []) {
      if (!line.amount && !line.label) continue;
      const list = map.get(line.section) || [];
      list.push(line);
      map.set(line.section, list);
    }
    return map;
  }, [lines]);

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const start = defaultOpen?.length
      ? defaultOpen
      : (['catering', 'entertainment'] as QuoteSectionId[]);
    return Object.fromEntries(start.map((id) => [id, true]));
  });

  const sections = SECTION_META.filter((s) => grouped.has(s.id) || (sectionTotals?.[s.id] || 0) > 0);

  if (!sections.length) {
    return <p className="px-4 py-3 text-[12px] text-gray-400">No cost lines selected.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {sections.map((sec) => {
        const secLines = grouped.get(sec.id) || [];
        const total = sectionTotals?.[sec.id] ?? secLines.reduce((s, l) => s + (l.amount || 0), 0);
        const isOpen = Boolean(open[sec.id]);
        return (
          <div key={sec.id} className="overflow-hidden rounded-[10px] border border-[#e3e6e4]">
            <button
              type="button"
              onClick={() => setOpen((p) => ({ ...p, [sec.id]: !p[sec.id] }))}
              className="flex w-full items-center justify-between bg-[#fafafa] px-4 py-3 text-left"
            >
              <div>
                <p className="text-[13px] font-semibold text-gray-800">{sec.title}</p>
                <p className="text-[11px] text-gray-400">{secLines.length} line{secLines.length === 1 ? '' : 's'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold text-[#00e676]">£{total.toFixed(2)}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isOpen ? (
              <div className="border-t border-[#f0f0f0]">
                {secLines.length ? (
                  secLines.map((line) => (
                    <div
                      key={line.id}
                      className="flex items-center justify-between gap-3 border-b border-[#f0f0f0] px-4 py-2.5 text-[12px] last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 text-gray-700">{line.label}</span>
                      <span className="shrink-0 font-semibold text-[#00e676]">£{line.amount.toFixed(2)}</span>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-2.5 text-[12px] text-gray-400">No lines in this section.</p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
