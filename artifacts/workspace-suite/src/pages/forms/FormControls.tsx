import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, HelpCircle, Search, X } from 'lucide-react';
import type { MenuGroup } from '@/lib/formOptions';
import {
  PREFILL_BLUE_GLOW_CLS,
  PREFILL_CONFIRMED_CLS,
  PREFILL_CONFIRMED_SURFACE,
  PREFILL_INPUT_CLS,
  PREFILL_TOGGLE_CLS,
} from '@/lib/leadPrefill';

export function FluidFillCircle({
  percent,
  color,
  size = 88,
}: {
  percent: number;
  color: string;
  size?: number;
}) {
  const clipId = `fluid-${useId().replace(/:/g, '')}`;
  const p = Math.max(0, Math.min(100, percent));
  const r = size / 2;
  const innerR = r - 4;
  const fillTop = r + innerR - (p / 100) * innerR * 2;
  return (
    <div className="relative" style={{ width: size, height: size }} aria-label={`${Math.round(p)} percent`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
        <defs>
          <clipPath id={clipId}>
            <circle cx={r} cy={r} r={innerR} />
          </clipPath>
        </defs>
        <circle cx={r} cy={r} r={innerR + 1.6} fill={`${color}18`} stroke={color} strokeWidth={2.2} />
        <g clipPath={`url(#${clipId})`}>
          <motion.rect
            x={-4}
            width={size + 8}
            height={size * 2}
            fill={color}
            initial={false}
            animate={{ y: fillTop }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            opacity={0.9}
          />
          <motion.ellipse
            cx={r}
            rx={innerR * 0.92}
            ry={5}
            fill={color}
            initial={false}
            animate={{
              cy: fillTop,
              opacity: p > 3 && p < 97 ? 1 : 0,
              scaleX: [1, 1.08, 1],
            }}
            transition={{
              cy: { duration: 0.45, ease: 'easeOut' },
              opacity: { duration: 0.2 },
              scaleX: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
            }}
          />
        </g>
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[15px] font-bold tabular-nums"
        style={{ color: p > 52 ? '#fff' : color }}
      >
        {Math.round(p)}%
      </span>
    </div>
  );
}

/**
 * Base Cost (Quote Sheet SoT via quoteFinance.ts) then flows through:
 * + Contingency (2.25%), then Margin (repeat 15% / new 25% or event minimum),
 * then VAT (20%). See lib/quoteFinance.ts.
 */
/* financial helpers imported from @/lib/quoteFinance */

/* DNB-style pill input: rounded, soft border, teal focus ring */
export const inputCls =
  'w-full rounded-[10px] border border-[#e3e6e4] bg-white px-4 py-3.5 text-[13.5px] text-gray-800 placeholder-gray-400 outline-none focus:border-[#FF5A45] focus:ring-4 focus:ring-[#FF5A45]/12 transition-all appearance-none';
export const sectionLabelCls = 'mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7c8a82]';
export const fieldLabelCls = 'mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-700';

/* ─── Custom Multi-Select (checkbox pill dropdown) ─── */
export function FormMultiSelect({
  label,
  field,
  options,
  value,
  onChange,
  onPreview,
  helper,
  prefilled,
  confirmed,
  onConfirm,
  collapsedOptions,
  onExpandOptions,
}: {
  label: string;
  field: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  onPreview?: (field: string, option: string | null) => void;
  helper?: string;
  prefilled?: boolean;
  confirmed?: boolean;
  onConfirm?: () => void;
  collapsedOptions?: boolean;
  onExpandOptions?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const toggle = (opt: string) => {
    const next = value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt];
    onChange(next);
    if (prefilled && next.includes(opt)) onConfirm?.();
  };

  const visibleOptions =
    collapsedOptions && value.length ? options.filter((o) => value.includes(o)) : options;

  const triggerCls = [
    inputCls,
    'flex items-center justify-between',
    prefilled && !confirmed ? PREFILL_INPUT_CLS : '',
    confirmed ? PREFILL_CONFIRMED_CLS : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => onPreview?.(field, value[0] || null)}
      onMouseLeave={() => onPreview?.(field, null)}
    >
      <label className={fieldLabelCls}>
        {label}
        {helper && (
          <span title={helper} className="text-[#7c8a82]">
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </label>
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          if (prefilled && value.length) onConfirm?.();
        }}
        className={triggerCls}
      >
        <span className={value.length ? 'text-gray-800' : 'text-gray-400'}>
          {value.length ? value.join(', ') : `Select ${label}`}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[260px] overflow-y-auto rounded-[10px] border border-[#e3e6e4] bg-white shadow-lg"
          >
            {visibleOptions.map((opt) => {
              const checked = value.includes(opt);
              return (
                <motion.li
                  key={opt}
                  whileHover={{ backgroundColor: '#f0fdf5' }}
                  onMouseEnter={() => onPreview?.(field, opt)}
                  onClick={() => toggle(opt)}
                  className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13px] text-gray-700 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-[5px] border transition-colors ${
                        checked ? 'border-[#FF5A45] bg-[#FF5A45]' : 'border-[#d0d0d0]'
                      }`}
                    >
                      {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </span>
                    {opt}
                  </span>
                </motion.li>
              );
            })}
            {collapsedOptions && options.length > visibleOptions.length ? (
              <li>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpandOptions?.();
                  }}
                  className="w-full border-t border-[#f0f0f0] px-4 py-3 text-left text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Show all {options.length} options…
                </button>
              </li>
            ) : null}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Nested Menu Type picker — groups by service style (Quote Builder 2026 + Cheat Sheet),
 * with search across all levels so REPs avoid scrolling one long list.
 */
export function FormGroupedMenuSelect({
  label,
  field,
  groups,
  value,
  onChange,
  onPreview,
  helper,
  prefilled,
  confirmed,
  onConfirm,
  collapsedOptions,
  onExpandOptions,
}: {
  label: string;
  field: string;
  groups: MenuGroup[];
  value: string[];
  onChange: (v: string[]) => void;
  onPreview?: (field: string, option: string | null) => void;
  helper?: string;
  prefilled?: boolean;
  confirmed?: boolean;
  onConfirm?: () => void;
  collapsedOptions?: boolean;
  onExpandOptions?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(groups[0]?.id ?? null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const q = query.trim().toLowerCase();
  const baseGroups = useMemo(() => {
    if (!collapsedOptions || !value.length) return groups;
    return groups
      .map((g) => ({ ...g, options: g.options.filter((o) => value.includes(o.label)) }))
      .filter((g) => g.options.length > 0);
  }, [groups, collapsedOptions, value]);

  const filteredGroups = useMemo(() => {
    if (!q) return baseGroups;
    return baseGroups
      .map((g) => ({
        ...g,
        options: g.options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.style || '').toLowerCase().includes(q) ||
            g.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [baseGroups, q]);

  const toggle = (opt: string) => {
    const next = value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt];
    onChange(next);
    if (prefilled && next.includes(opt)) onConfirm?.();
  };

  const triggerCls = [
    inputCls,
    'flex items-center justify-between',
    prefilled && !confirmed ? PREFILL_INPUT_CLS : '',
    confirmed ? PREFILL_CONFIRMED_CLS : '',
  ]
    .filter(Boolean)
    .join(' ');

  const summary =
    value.length === 0
      ? `Select ${label}`
      : value.length <= 2
        ? value.join(', ')
        : `${value.slice(0, 2).join(', ')} +${value.length - 2}`;

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => onPreview?.(field, value[0] || null)}
      onMouseLeave={() => onPreview?.(field, null)}
    >
      <label className={fieldLabelCls}>
        {label}
        {helper && (
          <span title={helper} className="text-[#7c8a82]">
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </label>
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          if (prefilled && value.length) onConfirm?.();
        }}
        className={triggerCls}
      >
        <span className={value.length ? 'text-gray-800' : 'text-gray-400'}>{summary}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-[10px] border border-[#e3e6e4] bg-white shadow-lg"
          >
            {!collapsedOptions ? (
            <div className="flex items-center gap-2 border-b border-[#e3e6e4] px-3 py-2.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search menus, stations, seated…"
                className="w-full bg-transparent text-[13px] text-gray-800 placeholder-gray-400 outline-none"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            ) : (
              <p className="border-b border-[#e3e6e4] px-4 py-2 text-[11px] font-semibold text-blue-700">
                Auto-selected from Sheets — click to confirm or expand full menu catalog
              </p>
            )}

            <div className="max-h-[320px] overflow-y-auto">
              {filteredGroups.length === 0 && (
                <p className="px-4 py-6 text-center text-[12.5px] text-gray-400">No menus match “{query}”</p>
              )}
              {filteredGroups.map((group) => {
                const isOpen = q ? true : expanded === group.id;
                const selectedInGroup = group.options.filter((o) => value.includes(o.label)).length;
                return (
                  <div key={group.id} className="border-b border-[#f0f0f0] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => (prev === group.id ? null : group.id))}
                      className="flex w-full items-center justify-between bg-[#fafafa] px-4 py-2.5 text-left hover:bg-[#f5f5f5]"
                    >
                      <span>
                        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-gray-700">
                          {group.label}
                        </span>
                        {group.description && (
                          <span className="ml-2 text-[11px] font-normal normal-case tracking-normal text-gray-400">
                            {group.description}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        {selectedInGroup > 0 && (
                          <span className="rounded-full bg-[#FFF1F0] px-2 py-0.5 text-[10px] font-bold text-[#E22A12]">
                            {selectedInGroup}
                          </span>
                        )}
                        {!q && (
                          <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.15 }}>
                            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                          </motion.span>
                        )}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          {group.options.map((opt) => {
                            const checked = value.includes(opt.label);
                            return (
                              <li
                                key={opt.label}
                                onMouseEnter={() => onPreview?.(field, opt.label)}
                                onClick={() => toggle(opt.label)}
                                className="flex cursor-pointer items-start justify-between gap-3 px-4 py-2.5 text-[13px] text-gray-700 hover:bg-[#f0fdf5]"
                              >
                                <span className="flex items-start gap-2.5">
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                                      checked ? 'border-[#FF5A45] bg-[#FF5A45]' : 'border-[#d0d0d0]'
                                    }`}
                                  >
                                    {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                                  </span>
                                  <span>
                                    <span className="block leading-snug">{opt.label}</span>
                                    {opt.style && (
                                      <span className="mt-0.5 block text-[11px] text-gray-400">{opt.style}</span>
                                    )}
                                  </span>
                                </span>
                              </li>
                            );
                          })}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
            {collapsedOptions ? (
              <button
                type="button"
                onClick={() => onExpandOptions?.()}
                className="w-full border-t border-[#f0f0f0] px-4 py-3 text-left text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
              >
                Show full menu catalog…
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Custom Select (DNB pill dropdown) ─── */
export function FormSelect({
  label,
  field,
  options,
  value,
  onChange,
  onPreview,
  helper,
  prefilled,
  confirmed,
  onConfirm,
  collapsedOptions,
  onExpandOptions,
}: {
  label: string;
  field: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onPreview?: (field: string, option: string | null) => void;
  helper?: string;
  prefilled?: boolean;
  confirmed?: boolean;
  onConfirm?: () => void;
  collapsedOptions?: boolean;
  onExpandOptions?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const visibleOptions =
    collapsedOptions && value ? options.filter((o) => o === value) : options;

  const triggerCls = [
    inputCls,
    'flex items-center justify-between',
    prefilled && !confirmed ? PREFILL_INPUT_CLS : '',
    confirmed ? PREFILL_CONFIRMED_CLS : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => onPreview?.(field, value || null)}
      onMouseLeave={() => onPreview?.(field, null)}
    >
      <label className={fieldLabelCls}>
        {label}
        {helper && (
          <span title={helper} className="text-[#7c8a82]">
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </label>
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          if (prefilled && value) onConfirm?.();
        }}
        className={triggerCls}
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>
          {value || `Select ${label}`}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[260px] overflow-y-auto rounded-[10px] border border-[#e3e6e4] bg-white shadow-lg"
          >
            {visibleOptions.map((opt) => (
              <motion.li
                key={opt}
                whileHover={{ backgroundColor: '#f0fdf5' }}
                onMouseEnter={() => onPreview?.(field, opt)}
                onClick={() => {
                  onChange(opt);
                  if (prefilled && opt === value) onConfirm?.();
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13px] text-gray-700 transition-colors"
              >
                {opt}
                {value === opt && <Check className="h-3.5 w-3.5 text-[#FF5A45]" />}
              </motion.li>
            ))}
            {collapsedOptions && options.length > visibleOptions.length ? (
              <li>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpandOptions?.();
                  }}
                  className="w-full border-t border-[#f0f0f0] px-4 py-3 text-left text-[12px] font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Show all {options.length} options…
                </button>
              </li>
            ) : null}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
