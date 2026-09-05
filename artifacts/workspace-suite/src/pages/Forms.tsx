import { useState, useRef, useEffect, useMemo, useCallback, useId } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowRight, Check, HelpCircle, AlertTriangle, X, UserRound, Layers, Search, Eye, Download, Share2 } from 'lucide-react';
import { addProposal } from '@/lib/proposalStore';
import { VESSEL_TYPES, EVENT_TYPES, MENU_GROUPS, getStoredPreview, type MenuGroup } from '@/lib/formOptions';
import { ItineraryWatch } from '@/components/ItineraryWatch';
import { LeadReferenceCard } from '@/components/LeadReferenceCard';
import { ProposalTimingsCard } from '@/components/ProposalTimingsCard';
import { getQuoteLead, clearQuoteLead, setQuoteLead, consumeQuoteBuilderStartStep, type QuoteLead } from '@/lib/quoteLeadStore';
import { loadQuoteNotesDraft, saveQuoteNotesDraft } from '@/lib/leadNotes';
import { loadQuoteDraft, saveQuoteDraft } from '@/lib/quoteDraftStore';
import { consumeFreshQuoteBuilder } from '@/lib/quoteBuilderSession';
import {
  consumePendingGenerate,
  getSavedQuote,
  getSavedQuoteAsync,
  listSavedQuotes,
  peekPendingGenerate,
  persistSavedQuote,
  type SavedQuote,
} from '@/lib/savedQuotesStore';
import { QuoteShareButtons } from '@/components/QuoteShareButtons';
import { openQuoteShareWeb, type ShareChannel } from '@/lib/quoteShare';
import { NOTES_BLUE } from '@/components/LeadNotesTimeline';
import {
  filenameFromContentDisposition,
  proposalFileStem,
  proposalFileStemFromLead,
  proposalFilenameFromRecord,
} from '@/lib/proposalFilename';
import {
  calcBaseCostBreakdown,
  calcFinancials,
  buildStargtmPayload,
  CONTINGENCY_RATE,
  type BespokeLine,
} from '@/lib/quoteFinance';
import {
  WEEKLY_PERIODS,
  DAY_PERIODS,
  GROUP_BRACKETS,
  QUOTE_VERSIONS,
  defaultSelectedLineIds,
  tablesForVessel,
} from '@/lib/quoteBuilderCatalog';
import { QuoteCostLines } from '@/components/QuoteCostLines';
import { CostSectionAccordion } from '@/components/CostSectionAccordion';
import { downloadCostSheetCsv } from '@/lib/costSheet';
import {
  templatesForCategory,
  templateLabel,
  filterInserts,
  INSERT_PLACEMENT_RULES,
  PROPOSAL_INSERTS,
} from '@/lib/proposalAssets';
import { writeQuoteStatus } from '@/lib/sheetsSync';
import { getCatalogRatesNote, subscribeCatalog } from '@/lib/catalogSync';
import { pullWorkbookToUx } from '@/lib/workbookSync';
import { resolveStaffContactFromInsertIds } from '@/lib/staffContacts';
import { formatPhoneDisplay } from '@/lib/phoneFormat';
import {
  buildItineraryProposalText,
  parseItineraryProposalText,
  buildItineraryProposalBlock,
  embarkationFromDeparture,
  returnFromDisembarkation,
  formatEventTimingsPayload,
} from '@/lib/proposalTimings';
import { PROPOSAL_ENGINE_GENERATE_URL } from '@/lib/backendUrls';
import { blobToDataUrl, fetchWithTimeout } from '@/lib/http';
import { engineAuthHeaders, notifyTeamAuthExpired } from '@/lib/teamSession';
import {
  buildLeadPrefill,
  prefillForQuoteVersion,
  prefillHealerTasks,
  PREFILL_INPUT_CLS,
  PREFILL_TOGGLE_CLS,
  PREFILL_CONFIRMED_CLS,
  PREFILL_CONFIRMED_SURFACE,
  PREFILL_BLUE_GLOW_CLS,
} from '@/lib/leadPrefill';
import { applyPrefillHealerMatches, requestPrefillHealer } from '@/lib/prefillHealer';
import { indexProposalTemplates, indexProposalInserts, insertsForGenerate, resolveProposalTemplateFromForm } from '@/lib/proposalPrefill';
import { formatGbpPounds } from '@/lib/utils';
import { financialParityReport, costApprovalBlocked, clientTotalsFromWeott } from '@/lib/financialParity';
import {
  resolveSheetFinancialTargets,
  rateEventDateFromLead,
} from '@/lib/progressNotesFinance';
import { goldTargetsFromRef } from '@/lib/goldScenarioPlaybook';
import { itineraryOverlayWording } from '@/lib/goldPackageWording';
import { formatEventDateForProposal } from '@/lib/goldScenarioCover';
import { displayQuoteKeyItems } from '@/lib/quoteKeyItems';
import { autoConfirmPrefillKeys, collectPrefillConfirmKeys, hasPendingPrefillConfirms } from '@/lib/prefillConfirm';
import { toastError, toastSuccess } from '@/lib/notify';
import { quoteNeedsApprovalFirst } from '@/lib/quoteReview';
import { errorMessage as formatError } from '@/lib/errors';
import {
  humanizeEngineWarning,
  layoutOverflowMessages,
  parseEngineWarningHeader,
} from '@/lib/engineWarnings';

const SOURCE_TYPES = [
  'Build your event form',
  'Chatbot Form',
  'Form Submit (Sales)',
  'Emailed Us (Info)',
  'Emailed Us (Sales)',
  'Called Us',
  'Repeat Client',
  'Chat Service',
  'DMN',
  'Responded to Remarketing',
  'TagVenue',
  'TagVenue Outreach',
  'HireSpace',
  'HeadBox',
  'Booker Venue',
  'Event Agency',
  'Event Listing Platform',
  'Recommendation/referral',
  'Other',
  'Wedding Planner/Agent',
];

type FormData = {
  vesselType: string[];
  eventType: string;
  source: string;
  eventDate: string;
  dateFlexible: boolean;
  guestCount: string;
  guestCountHigh: string;
  embarkation: string;
  departure: string;
  returnTime: string;
  disembarkation: string;
  menuType: string[];
  repeatClient: boolean;
  agentReferral: boolean;
  totalCost: string;
  /** Margin % override (e.g. 25). Empty = matrix / repeat / new default. */
  marginPercent: string;
  discountPercent: string;
  commissionPercent: string;
  /** Legacy upgrade labels — still merged into Cost Mother lines. */
  selectedUpgrades: string[];
  selectedLineIds: string[];
  bespokeLines: BespokeLine[];
  /** Quote Sheet amount overrides (gold / sheet formula drift). */
  lineAmountOverrides: Record<string, number>;
  weeklyPeriod: string;
  dayPeriod: string;
  groupBracket: string;
  noOfTables: string;
  keyItems: string;
  /** Frozen original enquiry from the lead sheet — never overwritten by form edits. */
  initialEnquiry: string;
  quoteVersion: string;
  /** corporate | wedding — drives template list only (manual pick). */
  proposalCategory: 'corporate' | 'wedding';
  /** Explicit stargtm template id — salesperson selects; no auto-pick. */
  templateId: string;
  requiresInserts: boolean;
  selectedInserts: string[];
  progressNotes: string;
  budget: string;
  packageWordingNotes: string;
  /** Editable proposal itinerary wording (auto from schedule; REP can tweak). */
  proposalTimingsNotes: string;
  /** When true, regenerating schedule overwrites proposalTimingsNotes. */
  proposalTimingsAuto: boolean;
  /** Cost cross-check before generate */
  costApproved: boolean;
};

const EMPTY_BESPOKE: BespokeLine[] = [1, 2, 3, 4].map((n) => ({
  id: `bespoke_${n}`,
  label: '',
  amount: 0,
  enabled: false,
}));

/**
 * The enquiry "Source" column is a free-text tag like
 * "Repeat Client 1, 2" or "Build your event form 1-3" — the trailing
 * numbers are spreadsheet artifacts, not part of the tag.
 */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function moneySum(...vals: Array<number | undefined>): number {
  let total = 0;
  for (const v of vals) total += v ?? 0;
  return Math.round(total * 100) / 100;
}

function formatFinMoney(label: string, val: number): string {
  if (/WEOTT|Base Cost/i.test(label) || /guest/i.test(label)) return `£${val.toFixed(2)}`;
  return formatGbpPounds(val);
}

const INIT: FormData = {
  vesselType: [],
  eventType: '',
  source: '',
  eventDate: todayIso(),
  dateFlexible: false,
  guestCount: '',
  guestCountHigh: '',
  embarkation: '11:45',
  departure: '12:00',
  returnTime: '17:45',
  disembarkation: '18:00',
  menuType: [],
  repeatClient: false,
  agentReferral: false,
  totalCost: '',
  marginPercent: '',
  discountPercent: '',
  commissionPercent: '',
  selectedUpgrades: [],
  selectedLineIds: defaultSelectedLineIds([]),
  bespokeLines: EMPTY_BESPOKE,
  lineAmountOverrides: {},
  weeklyPeriod: '',
  dayPeriod: '',
  groupBracket: '',
  noOfTables: '',
  keyItems: '',
  initialEnquiry: '',
  quoteVersion: 'V1',
  proposalCategory: 'corporate',
  templateId: '',
  requiresInserts: false,
  selectedInserts: [],
  progressNotes: '',
  budget: '',
  packageWordingNotes: '',
  proposalTimingsNotes: '',
  proposalTimingsAuto: true,
  costApproved: false,
};

function formFromLead(lead: QuoteLead | null) {
  return buildLeadPrefill(lead, INIT, SOURCE_TYPES);
}

type GenerationStage = 'idle' | 'preparing' | 'sending' | 'generating' | 'done' | 'error';

const STAGE_META: Record<
  Exclude<GenerationStage, 'idle'>,
  { label: string; sub: string; color: string }
> = {
  preparing: {
    label: 'Validating event details',
    sub: 'Checking dates, guest count and schedule for consistency',
    color: '#8b5cf6',
  },
  sending: {
    label: 'Encrypting & transmitting',
    sub: 'Your quote is being sent over a secure connection',
    color: '#3b82f6',
  },
  generating: {
    label: 'Generating your PDF proposal',
    sub: 'Formatting pricing, upgrades and vessel details',
    color: '#e8b93f',
  },
  done: {
    label: 'Proposal ready',
    sub: 'Every figure has been verified — redirecting…',
    color: '#00e676',
  },
  error: {
    label: 'Something went wrong',
    sub: 'Your data is safe — nothing was lost',
    color: '#ef4444',
  },
};

/* Data-integrity checklist shown alongside the stage animation — each item
   lights up as its corresponding stage is reached, reassuring the user that
   nothing in their quote was dropped or corrupted along the way. */
const INTEGRITY_STEPS: { key: Exclude<GenerationStage, 'idle' | 'error'>; label: string }[] = [
  { key: 'preparing', label: 'Event details validated' },
  { key: 'sending', label: 'Data securely transmitted' },
  { key: 'generating', label: 'Pricing figures verified' },
  { key: 'done', label: 'Proposal saved & ready' },
];
const STAGE_ORDER: Exclude<GenerationStage, 'idle' | 'error'>[] = ['preparing', 'sending', 'generating', 'done'];
const STAGE_PERCENT: Record<GenerationStage, number> = {
  idle: 0,
  preparing: 22,
  sending: 48,
  generating: 78,
  done: 100,
  error: 0,
};

function FluidFillCircle({
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
const inputCls =
  'w-full rounded-[10px] border border-[#e3e6e4] bg-white px-4 py-3.5 text-[13.5px] text-gray-800 placeholder-gray-400 outline-none focus:border-[#FF5A45] focus:ring-4 focus:ring-[#FF5A45]/12 transition-all appearance-none';
const sectionLabelCls = 'mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7c8a82]';
const fieldLabelCls = 'mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-700';

/* ─── Custom Multi-Select (checkbox pill dropdown) ─── */
function FormMultiSelect({
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
function FormGroupedMenuSelect({
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
function FormSelect({
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

/* ─── Steps ─── */
const STEPS = [
  { n: 1, label: 'Event Core' },
  { n: 2, label: 'Guest Count' },
  { n: 3, label: 'Schedule Timings' },
  { n: 4, label: 'Cost Lines' },
  { n: 5, label: 'Financials' },
  { n: 6, label: 'Cost Approval' },
  { n: 7, label: 'Proposal Pack' },
];

const LAST_CONTENT_STEP = 7;

/** Run a Sheets write-back; toast on failure but do not throw (PDF may still succeed). */
async function sheetsWrite(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    toastError({
      key: `sheets:${label}`,
      title: 'Sheets sync failed',
      description: `${label} — ${formatError(err)}`,
      err,
    });
    return false;
  }
}

export function Forms() {
  const [, navigate] = useLocation();
  const freshStartRef = useRef(consumeFreshQuoteBuilder());
  const pendingQuote = (() => {
    if (freshStartRef.current) return null;
    const id = peekPendingGenerate();
    return id ? getSavedQuote(id) : null;
  })();
  const pendingGenerateIdRef = useRef<string | null>(peekPendingGenerate());
  const fromSavedGenerateRef = useRef(Boolean(pendingGenerateIdRef.current));
  const startStepRef = useRef(consumeQuoteBuilderStartStep());
  const openAtEventCoreRef = useRef(startStepRef.current === 1);
  const [step, setStep] = useState(() => {
    if (startStepRef.current) return startStepRef.current;
    if (openAtEventCoreRef.current) return 1;
    return pendingQuote?.step && pendingQuote.step >= 1 ? pendingQuote.step : 1;
  });
  const [quoteLead] = useState<QuoteLead | null>(() =>
    freshStartRef.current
      ? null
      : openAtEventCoreRef.current
        ? getQuoteLead()
        : pendingQuote?.lead || getQuoteLead(),
  );
  const [leadInit] = useState(() =>
    formFromLead(freshStartRef.current ? null : getQuoteLead() || pendingQuote?.lead || null),
  );
  const leadNotesKey =
    quoteLead?.referenceNumber ||
    quoteLead?.email ||
    (quoteLead?.id != null ? `lead-${quoteLead.id}` : pendingQuote?.leadKey || 'quote-draft');
  const [data, setData] = useState<FormData>(() => {
    if (freshStartRef.current) return { ...INIT };
    if (pendingQuote?.data) {
      return {
        ...INIT,
        ...(pendingQuote.data as FormData),
        ...(fromSavedGenerateRef.current ? { costApproved: true } : {}),
      };
    }
    const d = leadInit.data as FormData;
    const draft = loadQuoteNotesDraft(
      quoteLead?.referenceNumber ||
        quoteLead?.email ||
        (quoteLead?.id != null ? `lead-${quoteLead.id}` : 'quote-draft'),
    );
    return {
      ...d,
      keyItems: d.keyItems || draft?.keyItems || '',
      progressNotes: d.progressNotes || draft?.progressNotes || '',
      proposalTimingsNotes: d.proposalTimingsNotes || buildItineraryProposalText(d),
      proposalTimingsAuto: d.proposalTimingsAuto !== false,
    };
  });
  const [prefilledKeys, setPrefilledKeys] = useState<Set<string>>(
    () => new Set(leadInit.prefilledKeys),
  );
  const [prefilledLineIds, setPrefilledLineIds] = useState<Set<string>>(
    () => new Set(leadInit.prefilledLineIds),
  );
  const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(() => {
    if (!fromSavedGenerateRef.current) return new Set();
    const saved = { ...INIT, ...((pendingQuote?.data as FormData) || {}) };
    return autoConfirmPrefillKeys({
      prefilledKeys: leadInit.prefilledKeys,
      requiresInserts: saved.requiresInserts,
      selectedInserts: saved.selectedInserts,
    });
  });
  const [lowConfidenceKeys, setLowConfidenceKeys] = useState<Set<string>>(
    () => new Set(leadInit.lowConfidenceKeys || []),
  );
  const [ambiguousFields] = useState<Set<string>>(
    () => new Set(leadInit.ambiguousFields || []),
  );
  const [expandedDropdowns, setExpandedDropdowns] = useState<Set<string>>(() => new Set());
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [showAllInsertsPanel, setShowAllInsertsPanel] = useState(false);
  const templateManualRef = useRef(
    Boolean(pendingGenerateIdRef.current) ||
      Boolean((pendingQuote?.data as FormData | undefined)?.templateId),
  );
  const [previewField, setPreviewField] = useState<string | null>(null);
  const [previewOption, setPreviewOption] = useState<string | null>(null);
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [genPercent, setGenPercent] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  // Base Cost stays auto-prefilled from the vessel/menu/guests/upgrades
  // formula until the user types their own figure into the field — then it
  // stops overwriting them until they explicitly ask to resync.
  const [baseCostAuto, setBaseCostAuto] = useState(true);
  const [ratesNote, setRatesNote] = useState<string>('');
  const [catalogEpoch, setCatalogEpoch] = useState(0);
  const [quoteDetailsOpen, setQuoteDetailsOpen] = useState(false);
  const [step6ShareOpen, setStep6ShareOpen] = useState(false);
  const [step6ShareQuote, setStep6ShareQuote] = useState<SavedQuote | null>(null);
  const [step6ShareCopied, setStep6ShareCopied] = useState(false);
  const [step6Sharing, setStep6Sharing] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  useEffect(() => {
    if (step === 3) setIsNotesOpen(true);
  }, [step]);

  useEffect(() => {
    if (stage === 'idle') {
      setGenPercent(0);
      return;
    }
    if (stage === 'error') return;
    const id = window.setInterval(() => {
      setGenPercent((p) => {
        if (stage === 'done') return Math.min(100, p + 8);
        const cap = stage === 'generating' ? 92 : STAGE_PERCENT[stage];
        if (p >= cap) return p;
        return Math.min(cap, p + (stage === 'generating' ? 0.45 : 2.4));
      });
    }, 40);
    return () => window.clearInterval(id);
  }, [stage]);

  // Gemini catalogue overlay — guests and money stay local. Skip gold playbook leads.
  useEffect(() => {
    const lead = getQuoteLead();
    if (goldTargetsFromRef(lead?.referenceNumber)) return;
    const notes = String(lead?.progressNotes || data.progressNotes || '');
    if (!notes.trim()) return;
    const tasks = prefillHealerTasks(notes, String(data.quoteVersion || 'V1'), String(data.keyItems || ''));
    let cancelled = false;
    requestPrefillHealer({ notes, quoteVersion: String(data.quoteVersion || ''), tasks })
      .then((matches) => {
        if (cancelled || !matches?.length) return;
        const patch = applyPrefillHealerMatches({ matches, notes, data, tasks });
        if (
          !Object.keys(patch.data).length &&
          !patch.prefilledKeys.length &&
          !patch.prefilledLineIds.length &&
          !patch.removedLineIds.length
        ) {
          return;
        }
        setData((prev) => ({ ...prev, ...patch.data }));
        if (patch.prefilledKeys.length) {
          setPrefilledKeys((prev) => {
            const next = new Set(prev);
            for (const k of patch.prefilledKeys) next.add(k);
            return next;
          });
        }
        if (patch.prefilledLineIds.length) {
          setPrefilledLineIds((prev) => {
            const next = new Set(prev);
            for (const id of patch.prefilledLineIds) next.add(id);
            return next;
          });
        }
        if (patch.lowConfidenceKeys.length) {
          setLowConfidenceKeys((prev) => {
            const next = new Set(prev);
            for (const k of patch.lowConfidenceKeys) next.add(k);
            return next;
          });
        }
      })
      .catch(() => {
        /* healer is optional — local prefill already ran */
      });
    return () => {
      cancelled = true;
    };
    // Mount-only: local prefill is already applied; healer fills leftovers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveQuoteNotesDraft(leadNotesKey, {
      keyItems: data.keyItems,
      progressNotes: data.progressNotes,
    });
  }, [leadNotesKey, data.keyItems, data.progressNotes]);

  useEffect(() => {
    let cancelled = false;
    if (freshStartRef.current) {
      setDraftReady(true);
      return;
    }
    const pendingId = peekPendingGenerate();
    const hydrate = pendingId
      ? getSavedQuoteAsync(pendingId).then((row) => {
          if (cancelled || !row?.data || !Object.keys(row.data).length) return;
          setData({
            ...INIT,
            ...(row.data as FormData),
            ...(fromSavedGenerateRef.current ? { costApproved: true } : {}),
          });
        })
      : loadQuoteDraft<FormData>(leadNotesKey).then((draft) => {
          if (cancelled) return;
          if (draft?.data) {
            const leadForm = leadInit.data as FormData;
            setData({
              ...draft.data,
              initialEnquiry: draft.data.initialEnquiry || String(leadForm.initialEnquiry || ''),
              progressNotes: draft.data.progressNotes || String(leadForm.progressNotes || ''),
              keyItems: draft.data.keyItems || String(leadForm.keyItems || ''),
            });
            if (
              !openAtEventCoreRef.current &&
              Number(draft.step) >= 1 &&
              Number(draft.step) <= LAST_CONTENT_STEP
            ) {
              setStep(startStepRef.current || draft.step);
            }
          }
        });
    void hydrate
      .catch(() => {
        /* keep mount state */
      })
      .finally(() => {
        if (!cancelled) setDraftReady(true);
      });
    return () => {
      cancelled = true;
    };
    // Restore once per lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadNotesKey]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      void saveQuoteDraft({
        leadKey: leadNotesKey,
        step,
        data,
        leadName: quoteLead?.name,
        referenceNumber: quoteLead?.referenceNumber,
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draftReady, leadNotesKey, step, data, quoteLead?.name, quoteLead?.referenceNumber]);

  useEffect(() => {
    if (!quoteDetailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuoteDetailsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quoteDetailsOpen]);

  // Keep proposal itinerary text in sync with schedule while auto mode is on
  useEffect(() => {
    if (!data.proposalTimingsAuto) return;
    const next = buildItineraryProposalText({
      embarkation: data.embarkation,
      departure: data.departure,
      returnTime: data.returnTime,
      disembarkation: data.disembarkation,
    });
    setData((prev) =>
      prev.proposalTimingsAuto && prev.proposalTimingsNotes !== next
        ? { ...prev, proposalTimingsNotes: next }
        : prev,
    );
  }, [
    data.embarkation,
    data.departure,
    data.returnTime,
    data.disembarkation,
    data.proposalTimingsAuto,
  ]);

  const fieldCls = (key: keyof FormData | string) => {
    const k = String(key);
    if (confirmedKeys.has(k)) return `${inputCls} ${PREFILL_CONFIRMED_CLS}`;
    return prefilledKeys.has(k) ? `${inputCls} ${PREFILL_INPUT_CLS}` : inputCls;
  };

  const confirmKey = (key: string) =>
    setConfirmedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });

  const pendingPrefillConfirms = useMemo(
    () =>
      collectPrefillConfirmKeys({
        prefilledKeys,
        confirmedKeys,
        requiresInserts: data.requiresInserts,
        selectedInserts: data.selectedInserts,
        lowConfidenceKeys,
        ambiguousFields,
      }),
    [prefilledKeys, confirmedKeys, data.requiresInserts, data.selectedInserts, lowConfidenceKeys, ambiguousFields],
  );

  const confirmAllPrefilledSuggestions = useCallback(() => {
    setConfirmedKeys((prev) => {
      const next = new Set(prev);
      for (const key of pendingPrefillConfirms) next.add(key);
      return next;
    });
  }, [pendingPrefillConfirms]);

  const expandDropdown = (key: string) =>
    setExpandedDropdowns((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

  const dropdownProps = (key: string) => ({
    prefilled: prefilledKeys.has(key),
    confirmed: confirmedKeys.has(key),
    onConfirm: () => confirmKey(key),
    collapsedOptions: prefilledKeys.has(key) && !expandedDropdowns.has(key),
    onExpandOptions: () => expandDropdown(key),
  });

  const clearPrefill = (key: string) => {
    setPrefilledKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setConfirmedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const set = (key: keyof FormData, val: unknown) => {
    clearPrefill(String(key));
    setData((prev) => {
      const next = { ...prev, [key]: val } as FormData;
      if (
        next.proposalTimingsAuto &&
        (key === 'embarkation' ||
          key === 'departure' ||
          key === 'returnTime' ||
          key === 'disembarkation')
      ) {
        if (key === 'departure') {
          next.embarkation = embarkationFromDeparture(String(val || next.departure));
        }
        if (key === 'disembarkation') {
          next.returnTime = returnFromDisembarkation(String(val || next.disembarkation));
        }
        next.proposalTimingsNotes = buildItineraryProposalText(next);
      }
      if (key === 'eventType') {
        const wedding = /wedding|engagement/i.test(String(val || ''));
        next.proposalCategory = wedding ? 'wedding' : next.proposalCategory;
      }
      // Re-require Cost Approval when money-affecting fields change after approve
      if (
        prev.costApproved &&
        [
          'guestCount',
          'vesselType',
          'embarkation',
          'departure',
          'returnTime',
          'disembarkation',
          'menuType',
          'selectedLineIds',
          'bespokeLines',
          'marginPercent',
          'discountPercent',
          'commissionPercent',
          'repeatClient',
          'weeklyPeriod',
          'dayPeriod',
          'groupBracket',
          'noOfTables',
          'totalCost',
          'eventDate',
          'dateFlexible',
          'eventType',
          'agentReferral',
          'lineAmountOverrides',
        ].includes(key)
      ) {
        next.costApproved = false;
      }
      return next;
    });
  };

  const toggleLine = (id: string) => {
    setPrefilledLineIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setData((prev) => {
      const selectedLineIds = prev.selectedLineIds.includes(id)
        ? prev.selectedLineIds.filter((x) => x !== id)
        : [...prev.selectedLineIds, id];
      return { ...prev, selectedLineIds, costApproved: false };
    });
  };

  const hasSheetPrefill = prefilledKeys.size > 0 || prefilledLineIds.size > 0;

  const marginOverride =
    data.marginPercent.trim() !== '' && Number.isFinite(Number(data.marginPercent))
      ? Number(data.marginPercent) / 100
      : null;

  const financeInput = useMemo(
    () => ({
      ...data,
      marginOverride,
      // Auto mode: always roll up from cost lines + bespoke (ignore stale manual WEOTT).
      totalCost: baseCostAuto ? '' : data.totalCost,
    }),
    [data, marginOverride, baseCostAuto, catalogEpoch],
  );
  const fin = calcFinancials(financeInput);
  const baseCostBreakdown = calcBaseCostBreakdown(financeInput);

  const sheetTargets = useMemo(() => {
    if (!quoteLead) return null;
    const rateDate = rateEventDateFromLead(quoteLead, data.eventDate, Boolean(data.dateFlexible));
    const gold = goldTargetsFromRef(quoteLead.referenceNumber);
    return resolveSheetFinancialTargets(
      quoteLead,
      {
        quoteVersion: data.quoteVersion,
        vesselUi: data.vesselType[0],
        eventDate: rateDate,
        dateFlexible: data.dateFlexible,
        embarkation: data.embarkation,
        guests: parseFloat(data.guestCount) || 0,
      },
      gold
        ? {
            weottCost: gold.goldQuoteWeottCost,
            marginPercent: gold.marginPercent,
            packageCost: clientTotalsFromWeott(gold.goldQuoteWeottCost, gold.marginPercent).packageCost,
            weeklyPeriod: String(gold.form.weeklyPeriod || ''),
            dayPeriod: String(gold.form.dayPeriod || ''),
            groupBracket: String(gold.form.groupBracket || ''),
            source: 'gold_scenario',
          }
        : null,
    );
  }, [
    quoteLead,
    data.eventDate,
    data.dateFlexible,
    data.quoteVersion,
    data.vesselType,
    data.embarkation,
    data.guestCount,
  ]);

  const parity = useMemo(() => financialParityReport(fin, sheetTargets), [fin, sheetTargets]);

  const availableTemplates = useMemo(
    () => templatesForCategory(data.proposalCategory),
    [data.proposalCategory],
  );

  const availableInserts = useMemo(
    () =>
      filterInserts({
        category: data.proposalCategory,
        vesselHint: data.vesselType[0],
      }),
    [data.proposalCategory, data.vesselType],
  );

  const templateResolution = useMemo(
    () => resolveProposalTemplateFromForm(data, quoteLead),
    [
      data.proposalCategory,
      data.eventType,
      data.guestCount,
      data.embarkation,
      data.disembarkation,
      data.dayPeriod,
      data.eventDate,
      data.quoteVersion,
      data.progressNotes,
      quoteLead,
    ],
  );

  const syncAutoTemplate = useCallback(() => {
    if (templateManualRef.current) return;
    const { templateId } = templateResolution;
    if (!templateId) return;
    setData((prev) => {
      if (prev.templateId === templateId) return prev;
      setConfirmedKeys((c) => {
        const next = new Set(c);
        next.delete('templateId');
        return next;
      });
      return { ...prev, templateId };
    });
    setPrefilledKeys((prev) => {
      if (prev.has('templateId')) return prev;
      const next = new Set(prev);
      next.add('templateId');
      return next;
    });
  }, [templateResolution]);

  useEffect(() => {
    if (step === 7) syncAutoTemplate();
  }, [step, syncAutoTemplate, templateResolution.templateId]);

  useEffect(() => {
    if (prefilledKeys.has('templateId') && !templateManualRef.current) {
      syncAutoTemplate();
    }
  }, [
    data.eventType,
    data.proposalCategory,
    data.guestCount,
    data.embarkation,
    data.disembarkation,
    data.dayPeriod,
    data.quoteVersion,
    syncAutoTemplate,
    prefilledKeys,
  ]);
  const templateCatalog = useMemo(
    () => indexProposalTemplates(data.proposalCategory),
    [data.proposalCategory],
  );
  const insertCatalog = useMemo(
    () => indexProposalInserts({ category: data.proposalCategory }),
    [data.proposalCategory],
  );

  const suggestedTemplate = availableTemplates.find((t) => t.id === data.templateId);
  const templatesVisible =
    showAllTemplates || !prefilledKeys.has('templateId')
      ? availableTemplates
      : suggestedTemplate
        ? [suggestedTemplate]
        : availableTemplates;

  const [insertPanelOpen, setInsertPanelOpen] = useState(false);
  const [insertKindFilter, setInsertKindFilter] = useState<'all' | 'vessel' | 'staff'>('all');

  useEffect(() => {
    setRatesNote(getCatalogRatesNote());
    const unsub = subscribeCatalog((note) => {
      setRatesNote(note);
      setCatalogEpoch((n) => n + 1);
    });
    void pullWorkbookToUx();
    return unsub;
  }, []);

  // Keep Base Cost synced to the formula while it's in "auto" mode.
  useEffect(() => {
    if (!baseCostAuto) return;
    setData((prev) => ({ ...prev, totalCost: calcBaseCostBreakdown(prev).total.toFixed(2) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    baseCostAuto,
    data.vesselType,
    data.eventType,
    data.menuType,
    data.guestCount,
    data.eventDate,
    data.dateFlexible,
    data.embarkation,
    data.departure,
    data.returnTime,
    data.disembarkation,
    data.selectedUpgrades,
    data.selectedLineIds,
    data.bespokeLines,
    data.lineAmountOverrides,
    data.weeklyPeriod,
    data.dayPeriod,
    data.groupBracket,
    data.noOfTables,
  ]);

  const handlePreview = (field: string, option: string | null) => {
    setPreviewField(option ? field : null);
    setPreviewOption(option);
  };
  const previewImg = getStoredPreview(previewField, previewOption);

  const toggleInsert = (id: string) => {
    setConfirmedKeys((prev) => {
      const next = new Set(prev);
      next.delete(`insert:${id}`);
      return next;
    });
    set(
      'selectedInserts',
      data.selectedInserts.includes(id)
        ? data.selectedInserts.filter((x) => x !== id)
        : [...data.selectedInserts, id],
    );
  };

  const confirmInsert = (id: string) => confirmKey(`insert:${id}`);

  const handleGenerate = async () => {
    setErrorMessage('');
    setStage('preparing');

    const fromSavedQuote = Boolean(fromSavedGenerateRef.current || pendingGenerateIdRef.current);
    const savedForReview =
      (pendingGenerateIdRef.current && getSavedQuote(pendingGenerateIdRef.current)) ||
      listSavedQuotes().find((q) => q.leadKey === leadNotesKey) ||
      null;
    if (quoteNeedsApprovalFirst(savedForReview) && !data.costApproved) {
      toastError({
        key: 'approve-quote-first',
        title: 'Approve Quote First',
        description: 'You can still generate this proposal.',
        duration: 8000,
      });
    }

    if (!data.costApproved && !fromSavedQuote) {
      setErrorMessage('Confirm cost cross-check approval before Proposal Pack / generate.');
      setStage('error');
      setStep(6);
      return;
    }

    if (!fromSavedQuote && costApprovalBlocked(parity, sheetTargets)) {
      setErrorMessage(
        parity.hints[0] ||
          'Financial cross-check failed — align WEOTT cost with Quote Sheet before generating.',
      );
      setStage('error');
      setStep(6);
      return;
    }

    const templateId = data.templateId || templateResolution.templateId;
    if (!templateId) {
      setErrorMessage('Select a proposal template in Proposal Pack before generating.');
      setStage('error');
      setStep(7);
      return;
    }

    if (
      !fromSavedQuote &&
      hasPendingPrefillConfirms({
        prefilledKeys,
        confirmedKeys,
        requiresInserts: data.requiresInserts,
        selectedInserts: data.selectedInserts,
      })
    ) {
      setErrorMessage('Confirm all blue suggestions (template + inserts) before generating.');
      setStage('error');
      setStep(7);
      return;
    }

    const generateInserts = insertsForGenerate(data);

    const staffContact = resolveStaffContactFromInsertIds(
      generateInserts,
      PROPOSAL_INSERTS,
    );

    const timingBlock =
      parseItineraryProposalText(data.proposalTimingsNotes) ||
      buildItineraryProposalBlock({
        embarkation: data.embarkation,
        departure: data.departure,
        returnTime: data.returnTime,
        disembarkation: data.disembarkation,
      });
    const packageWording = itineraryOverlayWording(timingBlock);

    const payload = buildStargtmPayload({
      form: financeInput,
      financials: fin,
      lead: quoteLead
        ? {
            name: quoteLead.name,
            email: quoteLead.email,
            phone: formatPhoneDisplay(quoteLead.phone),
            company: quoteLead.company,
            referenceNumber: quoteLead.referenceNumber,
            designation: quoteLead.designation,
            preparedBy: quoteLead.preparedBy,
            assignedRep: quoteLead.assignedRep,
            budget: quoteLead.budget || data.budget,
            vessels: quoteLead.vessels,
            market: quoteLead.market,
            source: quoteLead.source || data.source,
            yearOfEvent: quoteLead.yearOfEvent,
            repeatClient: data.repeatClient,
            eventDateDisplay: formatEventDateForProposal({
              eventDate: data.eventDate,
              dateFlexible: data.dateFlexible,
              fullEventDate: quoteLead.fullEventDate,
              eventDateDisplay: quoteLead.eventDateDisplay,
            }),
            eventDateFlexibleBool: data.dateFlexible,
            requestedEventTimes: quoteLead.requestedEventTimes,
            groupSize: quoteLead.groupSize,
            groupSizeQuote: quoteLead.groupSizeQuote,
            progressNotes: data.progressNotes,
          }
        : null,
      nexusLead: quoteLead
        ? {
            ...(quoteLead.sapphire || {}),
            // Form edits overlay Sheets SoT for fields the REP changed in the wizard
            referenceNumber: quoteLead.referenceNumber,
            name: quoteLead.name,
            companyName: quoteLead.company,
            companySector: quoteLead.companySector,
            email: quoteLead.email,
            phone: formatPhoneDisplay(quoteLead.phone),
            jobRole: quoteLead.designation,
            budget: data.budget || quoteLead.budget,
            repeatClient: data.repeatClient ? 'YES' : 'NO',
            preparedBy: quoteLead.preparedBy,
            assignedRep: quoteLead.assignedRep || quoteLead.preparedBy,
            status: quoteLead.status,
            liveDead: quoteLead.liveDead,
            source: data.source || quoteLead.source,
            enquiryDate: quoteLead.enquiryDate,
            eventType: data.eventType || quoteLead.eventType,
            fullEventDate: quoteLead.fullEventDate,
            eventDateFlexible: data.dateFlexible ? 'YES' : quoteLead.eventDateFlexible || 'NO',
            eventDateFlexibleBool: data.dateFlexible,
            eventDateDisplay: formatEventDateForProposal({
              eventDate: data.eventDate,
              dateFlexible: data.dateFlexible,
              fullEventDate: quoteLead.fullEventDate,
              eventDateDisplay: quoteLead.eventDateDisplay,
            }),
            requestedEventTimes: formatEventTimingsPayload(data),
            groupSize: data.guestCount || quoteLead.groupSize,
            groupSizeQuote: parseFloat(data.guestCount) || quoteLead.groupSizeQuote,
            vessels: data.vesselType.join(', ') || quoteLead.vessels,
            market: quoteLead.market,
            bestTimeToCall: quoteLead.bestTimeToCall,
            yearOfEvent: quoteLead.yearOfEvent,
            progressNotes: data.progressNotes || quoteLead.progressNotes,
            agent: data.agentReferral ? 'YES' : '',
            // Cover / page-16 contact — Flask /generate reads nexusLead + lead
            contact_name: staffContact.name,
            contact_title: staffContact.title,
            contact_phone: staffContact.phone,
            contact_mobile: staffContact.mobile,
            contact_email: staffContact.email,
          }
        : null,
      templateId,
      category: data.proposalCategory,
      selectedInserts: generateInserts,
      progressNotes: data.progressNotes,
      packageWording,
      staffContact,
      fullEventDate: quoteLead?.fullEventDate,
    });

    const outbound = { ...payload };

    setStage('sending');

    try {
      // Do not block PDF generate on Apps Script — that round-trip is the long wait.
      void sheetsWrite('Quote status (generating)', () =>
        writeQuoteStatus({
        referenceNumber: quoteLead?.referenceNumber,
        email: quoteLead?.email,
        leadName: quoteLead?.name,
        status: 'generating',
        version: data.quoteVersion,
        title: `${data.eventType || 'Event'} Proposal`,
        eventType: data.eventType,
        eventDate: data.eventDate,
        guestCount: data.guestCount,
        guestCountHigh: data.guestCountHigh,
        guests: parseFloat(data.guestCount) || 0,
        repeatClient: data.repeatClient,
        agentReferral: data.agentReferral,
        selectedUpgrades: data.selectedUpgrades,
        selectedLineLabels: (fin.lines || []).map((l) => l.label),
        selectedLineIds: data.selectedLineIds,
        keyItems: data.keyItems,
        weeklyPeriod: data.weeklyPeriod || fin.rateParts?.weeklyPeriod,
        dayPeriod: data.dayPeriod || fin.rateParts?.dayPeriod,
        groupBracket: data.groupBracket || fin.rateParts?.groupBracket,
        noOfTables: data.noOfTables,
        templateId: data.templateId,
        selectedInserts: generateInserts,
        staffContact: staffContact.name,
        baseCost: fin.baseCost,
        subtotalBeforeContingency: fin.subtotalBeforeContingency,
        contingency: fin.contingency,
        contingencyRate: fin.contingencyRate,
        margin: fin.margin,
        marginAmount: fin.marginAmount,
        discountPercent: fin.discountPercent,
        discountAmount: fin.discountAmount,
        commissionPercent: fin.commissionPercent,
        commissionAmount: fin.commissionAmount,
        updatedProfit: fin.updatedProfit,
        costPerGuestExc: fin.costPerGuestExc,
        costPerGuestInc: fin.costPerGuestInc,
        costToClient: fin.costToClient,
        packageCost: fin.costToClient,
        vat: fin.vat,
        vatRate: fin.vatRate,
        upgradeTotal: fin.upgradeTotal,
        grandTotal: fin.grand,
        sectionTotals: fin.sectionTotals,
        }),
      );

      setStage('generating');
      const res = await fetchWithTimeout(PROPOSAL_ENGINE_GENERATE_URL, {
        method: 'POST',
        headers: engineAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(outbound),
        timeoutMs: 120_000,
      });

      if (res.status === 401) {
        notifyTeamAuthExpired();
        throw new Error('Session expired. Sign in with the team PIN and try again.');
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let detail = errText.trim().slice(0, 240);
        try {
          const j = JSON.parse(errText) as { error?: string; validation_errors?: unknown };
          const overflow = layoutOverflowMessages(j?.validation_errors);
          if (overflow.length) {
            detail = overflow.join(' ');
          } else if (Array.isArray(j?.validation_errors) && j.validation_errors.length) {
            detail = j.validation_errors.map((item) => humanizeEngineWarning(String(item))).join('; ');
          } else if (j?.error) {
            detail = j.error;
          }
        } catch {
          /* keep raw text */
        }
        throw new Error(
          detail
            ? `Proposal engine responded ${res.status}: ${detail}`
            : `Proposal engine responded ${res.status} (empty body) from ${PROPOSAL_ENGINE_GENERATE_URL}`,
        );
      }

      const overflowNotices = layoutOverflowMessages(parseEngineWarningHeader(res.headers.get('X-Warnings')));
      if (overflowNotices.length) {
        toastError({
          key: 'layout-overflow',
          title: overflowNotices[0],
          description:
            overflowNotices.slice(1).join(' ') || 'The proposal PDF was still generated.',
        });
      }

      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      let pdfDataUrl = '';

      if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
        pdfDataUrl = await blobToDataUrl(await res.blob());
      } else {
        const peek = await res.clone().arrayBuffer();
        const bytes = new Uint8Array(peek.slice(0, 5));
        const isPdf =
          bytes.length >= 4 &&
          bytes[0] === 0x25 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x44 &&
          bytes[3] === 0x46;
        if (isPdf) {
          pdfDataUrl = await blobToDataUrl(new Blob([peek], { type: 'application/pdf' }));
        } else {
          throw new Error(
            `Proposal engine returned ${contentType || 'no Content-Type'}; expected application/pdf.`,
          );
        }
      }

      const proposalId = `proposal-${Date.now()}`;
      const fileStem = proposalFileStemFromLead(quoteLead);
      const filename = proposalFilenameFromRecord({
        filename:
          res.headers.get('X-Proposal-Filename') ||
          filenameFromContentDisposition(res.headers.get('Content-Disposition')) ||
          `${fileStem}.pdf`,
        title: fileStem,
        leadName: quoteLead?.name,
        leadCompany: quoteLead?.company,
        referenceNumber: quoteLead?.referenceNumber,
      });
      const saved = await addProposal({
        id: proposalId,
        createdAt: new Date().toISOString(),
        eventDate: data.eventDate,
        title: fileStem,
        filename,
        vesselType: data.vesselType.join(', '),
        eventType: data.eventType,
        guestCount: data.guestCount,
        grandTotal: fin.grand,
        pdfDataUrl,
        leadName: quoteLead?.name,
        leadEmail: quoteLead?.email,
        leadCompany: quoteLead?.company,
        referenceNumber: quoteLead?.referenceNumber,
      });

      if (!saved) {
        throw new Error(
          'The PDF was generated but is too large to store in this browser — clear some space (e.g. delete older proposals) and try again.',
        );
      }

      const savedQuoteId =
        pendingGenerateIdRef.current ||
        listSavedQuotes().find((q) => q.leadKey === leadNotesKey)?.id ||
        null;
      if (savedQuoteId) {
        const q = getSavedQuote(savedQuoteId);
        if (q) await persistSavedQuote({ ...q, proposalId });
        pendingGenerateIdRef.current = null;
      }

      void sheetsWrite('Quote status (ready)', () =>
        writeQuoteStatus({
          referenceNumber: quoteLead?.referenceNumber,
          email: quoteLead?.email,
          leadName: quoteLead?.name,
          status: 'ready',
          version: data.quoteVersion,
          eventType: data.eventType,
          eventDate: data.eventDate,
          guestCount: data.guestCount,
          guestCountHigh: data.guestCountHigh,
          grandTotal: fin.grand,
          costToClient: fin.costToClient,
          vat: fin.vat,
          updatedProfit: fin.updatedProfit,
          costPerGuestInc: fin.costPerGuestInc,
          templateId: data.templateId,
          selectedLineLabels: (fin.lines || []).map((l) => l.label),
        }),
      );

      clearQuoteLead();
      setStage('done');
      setTimeout(() => navigate('/proposal-doc'), 400);
    } catch (err) {
      const msg = formatError(err, 'Failed to generate the proposal.');
      setErrorMessage(msg);
      setStage('error');
      toastError({
        key: 'generate',
        title: 'Proposal generation failed',
        description: msg,
      });
      void writeQuoteStatus({
        referenceNumber: quoteLead?.referenceNumber,
        email: quoteLead?.email,
        leadName: quoteLead?.name,
        status: 'failed',
        version: data.quoteVersion,
      }).catch(() => {
        /* sheet write-back is best-effort */
      });
    }
  };

  const persistWizardQuote = async (next: FormData) => {
    const version = next.quoteVersion || 'V1';
    const existing = listSavedQuotes().find((q) => {
      if (q.leadKey !== leadNotesKey) return false;
      const savedVer = String((q.data as { quoteVersion?: string })?.quoteVersion || 'V1');
      return savedVer === version;
    });
    const stem = proposalFileStem({
      contactName: quoteLead?.name,
      companyName: quoteLead?.company,
      referenceCode: quoteLead?.referenceNumber,
    });
    const approved = Boolean(next.costApproved);
    const quoteId = existing?.id || `quote-${leadNotesKey}-${version}`;
    try {
      return await persistSavedQuote({
      id: quoteId,
      leadKey: leadNotesKey,
      leadName: quoteLead?.name,
      referenceNumber: quoteLead?.referenceNumber,
      title: `${stem} (${version})`,
      vesselType: next.vesselType.join(', '),
      eventType: next.eventType,
      guestCount: next.guestCount,
      eventDate: next.eventDate,
      grandTotal: next === data ? fin.grand : calcFinancials({
        ...next,
        marginOverride:
          next.marginPercent.trim() !== '' && Number.isFinite(Number(next.marginPercent))
            ? Number(next.marginPercent) / 100
            : null,
        totalCost: baseCostAuto ? '' : next.totalCost,
      }).grand,
      step,
      data: next,
      lead: quoteLead,
      proposalId: existing?.proposalId,
      reviewStatus: approved ? 'approved' : existing?.reviewStatus === 'disapproved' ? 'disapproved' : 'pending',
      reviewedAt: new Date().toISOString(),
    });
    } catch (err) {
      if ((err as { localSaved?: boolean }).localSaved) {
        const msg = String((err as Error)?.message || '');
        const authFail = /401|authentication|sign in|session expired/i.test(msg);
        toastError({
          key: 'quote-cloud',
          title: 'Quote saved on this device',
          description: authFail
            ? 'Team session expired. Sign in again so this quote can sync and PDFs can generate.'
            : 'Could not reach the shared workspace. Sync will retry automatically.',
          err,
        });
        return getSavedQuote(quoteId) || existing || undefined;
      }
      throw err;
    }
  };

  const amendQuoteFromStep6 = () => {
    set('costApproved', false);
    void persistWizardQuote({ ...data, costApproved: false });
    setErrorMessage('');
    setStep6ShareOpen(false);
    setStep(4);
  };

  const approveAndContinueFromStep6 = () => {
    if (!data.costApproved) {
      if (costApprovalBlocked(parity, sheetTargets)) {
        setErrorMessage(
          parity.hints[0] ||
            'Financial cross-check failed — align WEOTT with Quote Sheet before continuing.',
        );
        return;
      }
      set('costApproved', true);
      void persistWizardQuote({ ...data, costApproved: true }).then(() => {
        setQuoteDetailsOpen(false);
        setErrorMessage('');
        setStep((s) => Math.min(LAST_CONTENT_STEP, s + 1));
      });
      return;
    }
    setErrorMessage('');
    setStep((s) => Math.min(LAST_CONTENT_STEP, s + 1));
  };

  const openStep6ShareForApproval = async () => {
    if (step6Sharing) return;
    setStep6Sharing(true);
    try {
      const saved = await persistWizardQuote(data);
      const quote = saved || getSavedQuote(`quote-${leadNotesKey}-${data.quoteVersion || 'V1'}`);
      if (!quote) {
        toastError({
          key: 'share-quote',
          title: 'Could not prepare a review link',
          description: 'Save the quote, then try Share for Approval again.',
        });
        return;
      }
      setStep6ShareQuote(quote);
      setStep6ShareOpen(true);
    } catch (err) {
      toastError({
        key: 'share-quote',
        title: 'Could not prepare a review link',
        description: formatError(err, 'Could not write the quote for sharing. Try again.'),
      });
    } finally {
      setStep6Sharing(false);
    }
  };

  const shareStep6Quote = async (channel: ShareChannel, quote: SavedQuote) => {
    try {
      const result = await openQuoteShareWeb(channel, quote);
      if (channel === 'link' || result === 'copied') {
        setStep6ShareCopied(true);
        window.setTimeout(() => setStep6ShareCopied(false), 1600);
        toastSuccess({
          key: 'share-quote',
          title: 'Quote page link copied',
          description: 'Send it to a peer or manager without leaving Cost Approval.',
        });
      } else if (result === 'opened-copied') {
        toastSuccess({
          key: 'share-quote',
          title: channel === 'dropbox' ? 'Opened Dropbox on the web' : 'Opened Google Drive on the web',
        });
      } else if (channel === 'email') {
        toastSuccess({
          key: 'share-quote',
          title: 'Opened Gmail — To is blank',
        });
      } else {
        toastSuccess({
          key: 'share-quote',
          title: 'Opened WhatsApp Web',
        });
      }
    } catch {
      toastError({
        key: 'share-quote',
        title: 'Could not share this quote',
        description: 'Try again, or copy the quote page URL from Saved Quotes.',
      });
    }
  };

  const handleSaveQuote = async () => {
    try {
      await persistWizardQuote(data);
      await saveQuoteDraft({
        leadKey: leadNotesKey,
        step,
        data,
        leadName: quoteLead?.name,
        referenceNumber: quoteLead?.referenceNumber,
      });
      if (quoteLead) setQuoteLead(quoteLead);
      toastSuccess({
        key: 'save-quote',
        title: 'Quote saved',
        description: 'Opening Saved Quotes.',
      });
      navigate('/saved-quotes');
    } catch (err) {
      toastError({
        key: 'save-quote',
        title: 'Could not save quote',
        description: formatError(err, 'Could not write the quote to the database. Try again.'),
      });
    }
  };

  useEffect(() => {
    if (!draftReady) return;
    if (!peekPendingGenerate()) return;
    consumePendingGenerate();
    const t = window.setTimeout(() => {
      void handleGenerate();
    }, 80);
    return () => window.clearTimeout(t);
    // Mount-once after pending saved quote is in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftReady]);

  const pageVariants = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
  };

  return (
    <div className="flex bg-white" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      {/* ── Left: mint sidebar — logo, heading, numbered steps (DNB layout) ── */}
      <aside className="sticky top-16 flex h-[calc(100vh-4rem)] w-[300px] shrink-0 flex-col bg-[#FFF1F0] px-9 py-10">
        <div className="mb-10 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[#FF5A45] text-[13px] font-bold text-white">
            N
          </span>
          <span className="text-[15px] font-bold tracking-tight text-[#101a15]">Nexus</span>
        </div>

        <h1 className="mb-4 text-[24px] font-bold tracking-tight text-[#101a15]">Quote Builder</h1>

        {/* Lead tag — shows who this quote is being built for, when the
            wizard was opened via a lead's "Build a Quote" button. */}
        {quoteLead && (
          <div className="mb-6 flex items-center gap-2.5 rounded-[10px] border border-[#FF5A45]/25 bg-white px-3 py-2.5 shadow-sm">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: quoteLead.color || '#FF5A45' }}
            >
              {quoteLead.initials || <UserRound className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[#FF5A45]">
                Quote for
              </p>
              <p className="truncate text-[12.5px] font-semibold text-[#101a15]" title={quoteLead.name}>
                {quoteLead.name}
              </p>
              <p className="truncate text-[10.5px] text-[#8fa89a]" title={quoteLead.company}>
                {quoteLead.company}
              </p>
              {(quoteLead.preparedBy || quoteLead.eventDateDisplay) && (
                <p className="truncate text-[10px] text-[#8fa89a]">
                  {[quoteLead.preparedBy && `REP ${quoteLead.preparedBy}`, quoteLead.eventDateDisplay]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-1">
          {STEPS.map(({ n, label }) => {
            const active = step === n;
            const done = step > n;
            return (
              <button
                key={n}
                onClick={() => setStep(n)}
                data-testid={`step-tab-${n}`}
                className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors hover:bg-white/60"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                    active
                      ? 'bg-[#FF5A45] text-white'
                      : done
                      ? 'bg-[#FF5A45] text-white'
                      : 'border-2 border-[#c3d9cb] text-[#8fa89a]'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
                </span>
                <span
                  className={`text-[14px] transition-colors ${
                    active ? 'font-bold text-[#101a15]' : done ? 'font-medium text-[#E22A12]' : 'text-[#8fa89a]'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto text-[11px] leading-relaxed text-[#8fa89a]">
          Step {step} of {STEPS.length} · Your details save automatically
        </div>
      </aside>

      {/* ── Center: form content ── */}
      <main ref={mainRef} data-page-scroll className="min-w-0 flex-1 overflow-y-auto bg-white">
        <div className="mx-auto max-w-[640px] px-12 py-14">
          <AnimatePresence mode="wait" initial={false}>

            {/* STEP 1 — Event Core */}
            {step === 1 && (
              <motion.div key="step1" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <p className={sectionLabelCls}>Your Event Details</p>
                {hasSheetPrefill ? (
                  <p className="mb-4 rounded-[10px] border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-[12px] text-blue-900">
                    <span className="font-semibold">Blue fields</span> were auto-filled from Enquiry / Sheets — click to confirm (green glow), or edit any time.
                  </p>
                ) : null}

                <div className="mb-7">
                  <FormSelect
                    label="Source"
                    field="source"
                    options={SOURCE_TYPES}
                    value={data.source}
                    onChange={(v) => set('source', v)}
                    helper="Where this enquiry originated from"
                    {...dropdownProps('source')}
                  />
                  <p className="mt-1.5 text-[11.5px] text-gray-400">This should match how the lead first reached us.</p>
                </div>

                <p className={sectionLabelCls}>Vessel &amp; Event Type</p>
                <div className="mb-7 grid grid-cols-2 gap-5">
                  <FormMultiSelect
                    label="Vessel Type"
                    field="vesselType"
                    options={VESSEL_TYPES}
                    value={data.vesselType}
                    {...dropdownProps('vesselType')}
                    onChange={(v) => {
                      clearPrefill('vesselType');
                      const tables = tablesForVessel(v[0] || '');
                      setData((prev) => ({
                        ...prev,
                        vesselType: v,
                        noOfTables: tables,
                        weeklyPeriod: '',
                        dayPeriod: '',
                        groupBracket: '',
                        costApproved: false,
                      }));
                    }}
                    onPreview={handlePreview}
                  />
                  <FormSelect
                    label="Event Type"
                    field="eventType"
                    options={EVENT_TYPES}
                    value={data.eventType}
                    onChange={(v) => set('eventType', v)}
                    onPreview={handlePreview}
                    {...dropdownProps('eventType')}
                  />
                </div>

                <p className={sectionLabelCls}>Quote Builder inputs</p>
                <div className="mb-7 grid grid-cols-2 gap-5">
                  <div>
                    <label className={fieldLabelCls}>Quote version</label>
                    <select
                      value={data.quoteVersion}
                      onChange={(e) => {
                        const quoteVersion = e.target.value;
                        const saved = listSavedQuotes().find((q) => {
                          if (q.leadKey !== leadNotesKey) return false;
                          const savedVer = String(
                            (q.data as { quoteVersion?: string })?.quoteVersion || 'V1',
                          );
                          return savedVer === quoteVersion;
                        });
                        if (saved?.data && Object.keys(saved.data).length) {
                          setData((prev) => ({
                            ...prev,
                            ...(saved.data as Partial<FormData>),
                            quoteVersion,
                            costApproved: false,
                          }));
                          return;
                        }
                        const patch = quoteLead
                          ? prefillForQuoteVersion(quoteLead, data, quoteVersion)
                          : { data: { quoteVersion }, prefilledKeys: ['quoteVersion'] as string[] };
                        setPrefilledKeys((prev) => {
                          const next = new Set(prev);
                          for (const k of patch.prefilledKeys || []) next.add(k);
                          return next;
                        });
                        if (patch.prefilledLineIds?.length) {
                          setPrefilledLineIds((prev) => {
                            const next = new Set(prev);
                            for (const id of patch.prefilledLineIds || []) next.add(id);
                            return next;
                          });
                        }
                        setData((prev) => ({
                          ...prev,
                          ...patch.data,
                          costApproved: false,
                        }));
                      }}
                      className={fieldCls('quoteVersion')}
                    >
                      {QUOTE_VERSIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Weekly period</label>
                    <select
                      value={data.weeklyPeriod}
                      onChange={(e) => set('weeklyPeriod', e.target.value)}
                      className={fieldCls('weeklyPeriod')}
                    >
                      <option value="">Auto from date</option>
                      {WEEKLY_PERIODS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Day period</label>
                    <select
                      value={data.dayPeriod}
                      onChange={(e) => set('dayPeriod', e.target.value)}
                      className={fieldCls('dayPeriod')}
                    >
                      <option value="">Auto from departure</option>
                      {DAY_PERIODS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Group bracket</label>
                    <select
                      value={data.groupBracket}
                      onChange={(e) => set('groupBracket', e.target.value)}
                      className={fieldCls('groupBracket')}
                    >
                      <option value="">Auto from guests / vessel</option>
                      {GROUP_BRACKETS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mb-7">
                  <label className={fieldLabelCls}>Key items</label>
                  <input
                    type="text"
                    value={data.keyItems}
                    onChange={(e) => set('keyItems', e.target.value)}
                    placeholder="e.g. Canapés, drink tokens, DJ — short headline for the pack"
                    className={`${fieldCls('keyItems')} text-gray-800`}
                  />
                </div>

                <p className={sectionLabelCls}>Event Date</p>
                <div className="mb-4">
                  <label className={fieldLabelCls}>
                    Date of Event
                    <span title="The calendar day this quote is built around">
                      <HelpCircle className="h-3.5 w-3.5 text-[#7c8a82]" />
                    </span>
                  </label>
                  <input
                    type="date"
                    value={data.eventDate}
                    onChange={(e) => set('eventDate', e.target.value)}
                    className={fieldCls('eventDate')}
                  />
                  {data.dateFlexible && data.eventDate ? (
                    <p className="mt-1.5 text-[12px] font-semibold text-emerald-700">
                      Proposal will show this date with (Date TBC) underneath
                    </p>
                  ) : null}
                </div>
                <div className="mb-7 rounded-[10px] border border-[#e3e6e4] p-4">
                  <p className="text-[13px] font-semibold text-gray-800">Date Flexibility</p>
                  <p className="mt-0.5 text-[12px] text-gray-400">
                    Pulled from the Lead Sheet. TBC selects Flexible; otherwise Fixed. Flexible still prints the date, with (Date TBC) on the line below.
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="Date Flexibility"
                    className="mt-3 grid grid-cols-2 gap-2"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!data.dateFlexible}
                      onClick={() => {
                        clearPrefill('dateFlexible');
                        set('dateFlexible', false);
                      }}
                      className={`rounded-[8px] border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                        !data.dateFlexible
                          ? `${PREFILL_CONFIRMED_SURFACE} ${PREFILL_CONFIRMED_CLS}`
                          : 'border-[#e3e6e4] bg-white text-gray-700 hover:border-[#cfd6d2]'
                      }`}
                    >
                      Fixed
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={data.dateFlexible}
                      onClick={() => {
                        clearPrefill('dateFlexible');
                        set('dateFlexible', true);
                      }}
                      className={`rounded-[8px] border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                        data.dateFlexible
                          ? `${PREFILL_CONFIRMED_SURFACE} ${PREFILL_CONFIRMED_CLS}`
                          : 'border-[#e3e6e4] bg-white text-gray-700 hover:border-[#cfd6d2]'
                      }`}
                    >
                      Flexible
                    </button>
                  </div>
                </div>

                {data.budget ? (
                  <div className="mb-7">
                    <p className={sectionLabelCls}>Budget (from Enquiry)</p>
                    <p className={`rounded-[10px] border border-[#e3e6e4] px-4 py-3 text-[13px] font-semibold text-gray-800 ${prefilledKeys.has('budget') ? PREFILL_INPUT_CLS : 'bg-[#FFF1F0]'}`}>
                      {data.budget}
                    </p>
                  </div>
                ) : null}

                {quoteLead && (quoteLead.preparedBy || quoteLead.market || quoteLead.yearOfEvent || quoteLead.bestTimeToCall) ? (
                  <div className="mb-7 overflow-hidden rounded-[10px] border border-[#e3e6e4]">
                    <p className="border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7c8a82]">
                      Sheets SoT (Sapphire aliases)
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-[12px] text-gray-700">
                      {quoteLead.preparedBy && (
                        <>
                          <dt className="text-gray-400">Prepared by (REP)</dt>
                          <dd className="font-semibold">{quoteLead.preparedBy}</dd>
                        </>
                      )}
                      {quoteLead.market && (
                        <>
                          <dt className="text-gray-400">Market</dt>
                          <dd className="font-semibold">{quoteLead.market}</dd>
                        </>
                      )}
                      {quoteLead.yearOfEvent && (
                        <>
                          <dt className="text-gray-400">Year of event</dt>
                          <dd className="font-semibold">{quoteLead.yearOfEvent}</dd>
                        </>
                      )}
                      {quoteLead.bestTimeToCall && (
                        <>
                          <dt className="text-gray-400">Best time to call</dt>
                          <dd className="font-semibold">{quoteLead.bestTimeToCall}</dd>
                        </>
                      )}
                      {quoteLead.groupSize && (
                        <>
                          <dt className="text-gray-400">Group size (sheet)</dt>
                          <dd className="font-semibold">
                            {quoteLead.groupSize}
                            {quoteLead.groupSizeQuote != null ? ` → quote ${quoteLead.groupSizeQuote}` : ''}
                          </dd>
                        </>
                      )}
                    </dl>
                  </div>
                ) : null}
              </motion.div>
            )}

            {/* STEP 2 — Guest Count */}
            {step === 2 && (
              <motion.div key="step2" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <p className={sectionLabelCls}>Guest Count</p>
                <div className="mb-5 grid grid-cols-2 gap-5">
                  <div>
                    <label className={fieldLabelCls}>Guests (quote / lower)</label>
                    <input
                      type="number"
                      min={0}
                      value={data.guestCount}
                      onChange={(e) => {
                        set('guestCount', e.target.value);
                        confirmKey('guestCount');
                      }}
                      placeholder="e.g. 80"
                      className={fieldCls('guestCount')}
                    />
                    {ambiguousFields.has('guestCount') && !data.guestCount ? (
                      <p className="mt-1.5 text-[11.5px] text-amber-700">
                        Group size on the sheet is ambiguous — enter the quote count before generating.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Guests high (proposal range)</label>
                    <input
                      type="number"
                      min={0}
                      value={data.guestCountHigh}
                      onChange={(e) => set('guestCountHigh', e.target.value)}
                      placeholder="Optional upper bound"
                      className={fieldCls('guestCountHigh')}
                    />
                  </div>
                </div>
                <div className="mb-7">
                  <label className={fieldLabelCls}>No. of tables</label>
                  <input
                    type="number"
                    min={0}
                    value={data.noOfTables}
                    onChange={(e) => set('noOfTables', e.target.value)}
                    placeholder="For Section 9 decor × tables"
                    className={fieldCls('noOfTables')}
                  />
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    Fixed by vessel: Avontuur 15, London Rose 15, Golden Salamander 8. Other boats are entered manually.
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 3 — Schedule Timings */}
            {step === 3 && (
              <motion.div key="step3-schedule" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <p className={sectionLabelCls}>Schedule Timings</p>
                <div className="grid grid-cols-2 gap-5">
                  {(
                    [
                      ['Embarkation', 'embarkation'],
                      ['Departure', 'departure'],
                      ['Return', 'returnTime'],
                      ['Disembarkation', 'disembarkation'],
                    ] as [string, keyof FormData][]
                  ).map(([label, key]) => (
                    <div key={key}>
                      <label className={fieldLabelCls}>{label}</label>
                      <input
                        type="time"
                        value={data[key] as string}
                        onChange={(e) => set(key, e.target.value)}
                        className={fieldCls(key)}
                      />
                    </div>
                  ))}
                </div>

                <ItineraryWatch
                  embarkation={data.embarkation}
                  departure={data.departure}
                  returnTime={data.returnTime}
                  disembarkation={data.disembarkation}
                  onChangeField={(key, value) => set(key, value)}
                />
              </motion.div>
            )}

            {/* STEP 4 — Cost Lines (Quote Builder Sections 1–13) — catering is Section 2 */}
            {step === 4 && (
              <motion.div
                key="step4-cost-lines"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                <p className={sectionLabelCls}>Cost Lines (Quote Builder 2026)</p>
                <div className="mb-4 sticky top-0 z-[1] rounded-[10px] border border-[#FF5A45]/25 bg-[#FFF1F0] px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#E22A12]">
                    Key items
                  </p>
                  <p className="mt-1 text-[13px] font-semibold leading-snug text-gray-800" data-testid="cost-lines-key-items">
                    {displayQuoteKeyItems(data) || 'No key items yet — add notes on Event Core or keep referring to the lead sheet.'}
                  </p>
                  {!data.keyItems?.trim() ? (
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#FF5A45] hover:underline"
                    >
                      Edit on Event Details
                    </button>
                  ) : null}
                </div>
                <p className="mb-4 text-[12px] text-gray-500">
                  Tick YES lines for Sections 1–13. Catering menus start off except the delivery charge — select the menu manually. Background music and own-food surcharge start on; Section 11 staff starts off.
                </p>
                <QuoteCostLines
                  data={financeInput}
                  selectedLineIds={data.selectedLineIds}
                  bespokeLines={data.bespokeLines}
                  prefilledLineIds={prefilledLineIds}
                  prefilledBespoke={prefilledKeys.has('bespokeLines')}
                  onToggleLine={toggleLine}
                  onBespokeChange={(lines) => {
                    clearPrefill('bespokeLines');
                    set('bespokeLines', lines);
                  }}
                />
              </motion.div>
            )}

            {/* STEP 5 — Financials (margin + grand total after all cost lines) */}
            {step === 5 && (
              <motion.div
                key="step5-financials"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                <p className={sectionLabelCls}>Client Status</p>
                <p className="mb-3 text-[12px] text-gray-500">
                  Toggle on one or both of the below when you want to apply.
                </p>
                <div className={`mb-7 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4 ${prefilledKeys.has('repeatClient') ? PREFILL_INPUT_CLS : ''}`}>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Apply Client Discount</p>
                    <p className="text-[12px] text-gray-400">Reduces Margin by % set in box below</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('repeatClient', !data.repeatClient)}
                    className={`relative h-7 w-14 rounded-full transition-colors ${data.repeatClient ? 'bg-[#FF5A45]' : 'bg-gray-200'} ${prefilledKeys.has('repeatClient') ? PREFILL_TOGGLE_CLS : ''}`}
                  >
                    <motion.div
                      animate={{ x: data.repeatClient ? 28 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                <div className={`mb-7 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4 ${prefilledKeys.has('agentReferral') ? PREFILL_INPUT_CLS : ''}`}>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Agent Referral</p>
                    <p className="text-[12px] text-gray-400">Agent Referral Commission - Reduce Margin by % set in box below</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('agentReferral', !data.agentReferral)}
                    className={`relative h-7 w-14 rounded-full transition-colors ${data.agentReferral ? 'bg-[#FF5A45]' : 'bg-gray-200'} ${prefilledKeys.has('agentReferral') ? PREFILL_TOGGLE_CLS : ''}`}
                  >
                    <motion.div
                      animate={{ x: data.agentReferral ? 28 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                <p className={sectionLabelCls}>Totals &amp; margin</p>
                <p className="mb-3 text-[11.5px] text-gray-400">
                  After Sections 1–13 (previous step): Cost Mother rates → contingency {(CONTINGENCY_RATE * 100).toFixed(2)}% → margin → discount → VAT.
                  {ratesNote ? ` ${ratesNote}` : ''}
                </p>

                <div className="mb-5 grid grid-cols-3 gap-4">
                  <div>
                    <label className={fieldLabelCls}>Target Margin %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={data.marginPercent}
                      onChange={(e) => set('marginPercent', e.target.value)}
                      placeholder={data.repeatClient ? '15' : '25'}
                      className={fieldCls('marginPercent')}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Client Discount % (If applicable)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={data.discountPercent}
                      onChange={(e) => set('discountPercent', e.target.value)}
                      placeholder="0"
                      disabled={!data.repeatClient}
                      className={`${fieldCls('discountPercent')} ${!data.repeatClient ? 'opacity-50' : ''}`}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelCls}>Agent Referral Commission % (If applicable)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={data.commissionPercent}
                      onChange={(e) => set('commissionPercent', e.target.value)}
                      placeholder={data.agentReferral ? '10' : '0'}
                      disabled={!data.agentReferral}
                      className={`${fieldCls('commissionPercent')} ${!data.agentReferral ? 'opacity-50' : ''}`}
                    />
                  </div>
                </div>
                <p className="mb-7 text-[11.5px] text-gray-400">
                  Blank margin uses Minimum target margin matrix (event × month), then repeat 15% / new 25%.
                </p>

                <div className="mb-4 overflow-hidden rounded-[10px] border border-[#e3e6e4]">
                  <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                    <span className="flex items-center gap-2">
                      Vessel Hire ({baseCostBreakdown.hours}h)
                      {baseCostBreakdown.peak && (
                        <span className="rounded-full bg-[#FFF1F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#E22A12]">
                          Peak period
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-[#00e676]">£{baseCostBreakdown.vesselHire.toFixed(2)}</span>
                  </div>
                  {(
                    [
                      ['Catering', baseCostBreakdown.sectionTotals.catering || 0],
                      ['Catering equipment / surcharge', moneySum(baseCostBreakdown.sectionTotals.catering_equipment, baseCostBreakdown.sectionTotals.catering_surcharge)],
                      ['Beverages', baseCostBreakdown.sectionTotals.beverages || 0],
                      ['Entertainment', baseCostBreakdown.sectionTotals.entertainment || 0],
                      ['Decor (hours + tables)', moneySum(baseCostBreakdown.sectionTotals.decor, baseCostBreakdown.sectionTotals.decor_table)],
                      ['Staffing', baseCostBreakdown.sectionTotals.staff || 0],
                      ['In-house', baseCostBreakdown.sectionTotals.in_house || 0],
                      ['Other', baseCostBreakdown.sectionTotals.other || 0],
                      ['Financial admin', baseCostBreakdown.sectionTotals.financial || 0],
                      ['Bespoke', baseCostBreakdown.sectionTotals.bespoke || 0],
                      [`Contingency (${(CONTINGENCY_RATE * 100).toFixed(2)}%)`, baseCostBreakdown.contingency],
                    ] as [string, number][]
                  )
                    .filter(([, val]) => val > 0)
                    .map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                        <span>{label}</span>
                        <span className="font-semibold text-[#00e676]">£{val.toFixed(2)}</span>
                      </div>
                    ))}
                  <div className="flex items-center justify-between bg-[#f0fdf5] px-5 py-3 text-[13px] font-bold text-gray-700">
                    <span>Total Cost to WEOTT</span>
                    <span className="text-[14px] font-black text-slate-800">£{baseCostBreakdown.total.toFixed(2)}</span>
                  </div>
                </div>
                {baseCostBreakdown.notes.length > 0 && (
                  <ul className="mb-4 -mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-gray-400">
                    {baseCostBreakdown.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}

                <div className="mb-7">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className={fieldLabelCls}>Base Cost (£)</label>
                    {baseCostAuto ? (
                      <span className="rounded-full bg-[#f0fdf5] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">
                        Auto-filled
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBaseCostAuto(true)}
                        className="text-[11px] font-semibold text-gray-400 underline-offset-2 hover:text-[#FF5A45] hover:underline"
                      >
                        Reset to auto
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={data.totalCost}
                    onChange={(e) => {
                      setBaseCostAuto(false);
                      set('totalCost', e.target.value);
                    }}
                    placeholder="Enter base event cost"
                    className={`${inputCls} font-semibold text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]`}
                  />
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    Rolled up from cost lines (Sections 1–14) — edit to override.
                  </p>
                </div>

                {(parseFloat(data.totalCost) > 0 || (fin.lines || []).length > 0) && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[10px] border border-[#e3e6e4]">
                    <div className="flex items-center justify-between border-b border-[#f0f0f0] bg-[#f0fdf5] px-5 py-3 text-[13px] font-bold text-gray-700">
                      <span>Total Cost to WEOTT</span>
                      <span className="font-black text-slate-800">£{fin.baseCost.toFixed(2)}</span>
                    </div>
                    {(
                      [
                        [`Margin (${(fin.margin * 100).toFixed(1)}%)`, fin.marginAmount],
                        ...(fin.discountAmount > 0
                          ? ([[`Discount (${(fin.discountPercent * 100).toFixed(1)}%)`, -fin.discountAmount]] as [string, number][])
                          : []),
                        ...(fin.commissionAmount > 0
                          ? ([[`Commission (${(fin.commissionPercent * 100).toFixed(1)}%)`, fin.commissionAmount]] as [string, number][])
                          : []),
                        ['Updated profit', fin.updatedProfit],
                      ] as [string, number][]
                    ).map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                        <span>{label}</span>
                        <span className="font-semibold text-slate-800">{formatFinMoney(label, val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-b border-[#f0f0f0] bg-[#f0fdf5] px-5 py-3 text-[13px] font-bold text-gray-700">
                      <span>Cost to Client (exc VAT)</span>
                      <span className="font-black text-slate-800">{formatGbpPounds(fin.costToClient)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                      <span>VAT (20%)</span>
                      <span className="font-semibold text-slate-800">{formatGbpPounds(fin.vat)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                      <span>£ / guest (exc / inc VAT)</span>
                      <span className="font-semibold text-slate-800">
                        £{fin.costPerGuestExc.toFixed(2)} / £{fin.costPerGuestInc.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-[#FF5A45] px-5 py-4 text-[14px] font-black text-white">
                      <span>Grand Total</span>
                      <span className="text-white">{formatGbpPounds(fin.grand)}</span>
                    </div>
                  </motion.div>
                )}

                <div className="mt-7">
                  <p className={sectionLabelCls}>Package wording (optional)</p>
                  <textarea
                    value={data.packageWordingNotes}
                    onChange={(e) => set('packageWordingNotes', e.target.value)}
                    rows={3}
                    placeholder="One note per line — passed through to the proposal pack (REP wording)."
                    className={`${inputCls} min-h-[80px] resize-y`}
                  />
                </div>
              </motion.div>
            )}

            {/* STEP 6 — Cost Approval (after all quote inputs, before Proposal Pack) */}
            {step === 6 && (
              <motion.div
                key="step6-cost-approval"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                <p className={sectionLabelCls}>Cost Cross-Check</p>
                {displayQuoteKeyItems(data) ? (
                  <div className="mb-4 rounded-[10px] border border-[#FF5A45]/25 bg-[#FFF1F0] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#E22A12]">Key items</p>
                    <p className="mt-1 text-[13px] font-semibold leading-snug text-gray-800" data-testid="cost-check-key-items">
                      {displayQuoteKeyItems(data)}
                    </p>
                  </div>
                ) : null}
                <p className="mb-4 text-[13px] leading-relaxed text-gray-500">
                  Compare computed totals to Quote Sheet / progress-notes targets before Proposal Pack.
                  {sheetTargets?.source ? (
                    <span className="mt-1 block text-[12px] text-blue-800">
                      Sheet target source: <span className="font-semibold">{sheetTargets.source.replace(/_/g, ' ')}</span>
                    </span>
                  ) : null}
                </p>

                {sheetTargets?.weottCost != null ? (
                  <div className="mb-6 overflow-hidden rounded-[12px] border border-amber-200 bg-amber-50/50">
                    <div className="border-b border-amber-200/80 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.08em] text-amber-900/70">
                      Quote Sheet cross-check
                    </div>
                    {parity.rows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between border-b border-amber-100 px-5 py-2.5 text-[12.5px] last:border-b-0"
                      >
                        <span className="text-gray-700">{row.label}</span>
                        <span className="text-right">
                          <span className="block font-semibold text-gray-800">£{row.actual.toFixed(2)}</span>
                          {row.expected != null ? (
                            <span className="text-[11px] text-amber-800/75">
                              target £{row.expected.toFixed(2)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mb-6 overflow-hidden rounded-[12px] border border-[#e3e6e4]">
                  <div className="flex items-center justify-between border-b border-[#f0f0f0] bg-[#fafafa] px-5 py-3">
                    <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#7c8a82]">
                      Snapshot
                    </span>
                    <span className="text-[12px] text-gray-400">
                      {data.quoteVersion || 'V1'}
                      {fin.rateParts
                        ? ` · ${fin.rateParts.vessel} · ${fin.rateParts.weeklyPeriod} · ${fin.rateParts.dayPeriod}`
                        : ''}
                    </span>
                  </div>
                  {(
                    [
                      ['Total to WEOTT', fin.baseCost],
                      [`Margin (${(fin.margin * 100).toFixed(1)}%)`, fin.marginAmount],
                      ['Cost to client (exc VAT)', fin.costToClient],
                      ['VAT (20%)', fin.vat],
                      ['Grand total', fin.grand],
                    ] as [string, number][]
                  ).map(([label, val]) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] last:border-b-0 ${
                        label === 'Grand total'
                          ? 'bg-[#fafafa] font-bold text-slate-800'
                          : 'text-gray-600'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="font-semibold text-slate-800">{formatFinMoney(label, val)}</span>
                    </div>
                  ))}
                </div>

                <div className="mb-6">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#7c8a82]">
                      Cost lines
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        downloadCostSheetCsv({
                          form: financeInput,
                          title: `${data.eventType || 'Quote'} ${data.quoteVersion || 'V1'}`,
                          filename: `${quoteLead?.referenceNumber || 'quote'}-${data.quoteVersion || 'V1'}`,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#e3e6e4] bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:border-[#FF5A45]/40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download cost sheet
                    </button>
                  </div>
                  <CostSectionAccordion
                    lines={fin.lines || []}
                    sectionTotals={fin.sectionTotals}
                    defaultOpen={['catering', 'entertainment']}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setQuoteDetailsOpen(true)}
                  className="mb-6 flex w-full items-center justify-between rounded-[12px] border border-[#e3e6e4] bg-white px-5 py-4 text-left transition-colors hover:border-[#FF5A45]/50 hover:bg-[#FFF1F0]/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f0fdf5]">
                      <Eye className="h-4.5 w-4.5 text-[#00e676]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-gray-800">View quote details</p>
                      <p className="text-[12px] text-gray-400">
                        {(fin.lines || []).length} cost lines · section roll-up · £/guest
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300" />
                </button>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    data-testid="btn-amend-quote"
                    onClick={amendQuoteFromStep6}
                    className="flex w-full items-center justify-center rounded-[12px] bg-black px-4 py-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1a1a1a]"
                  >
                    Amend Quote
                  </button>
                  <button
                    type="button"
                    data-testid="btn-share-for-approval"
                    disabled={step6Sharing}
                    onClick={() => void openStep6ShareForApproval()}
                    className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-4 py-4 text-[13px] font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-70"
                  >
                    <Share2 className="h-4 w-4" strokeWidth={2.5} />
                    {step6Sharing ? 'Preparing…' : 'Share for Approval'}
                  </button>
                  <button
                    type="button"
                    data-testid="btn-approve-cost"
                    disabled={!data.costApproved && costApprovalBlocked(parity, sheetTargets)}
                    onClick={approveAndContinueFromStep6}
                    className={`flex w-full items-center justify-center gap-2 rounded-[12px] px-4 py-4 text-[13px] font-bold transition-colors ${
                      data.costApproved
                        ? 'bg-[#00e676] text-[#0b1f14] shadow-[0_0_18px_rgba(0,230,118,0.35)] hover:bg-[#00d66c]'
                        : costApprovalBlocked(parity, sheetTargets)
                          ? 'cursor-not-allowed border border-amber-200 bg-amber-50/80 text-amber-900/80'
                          : 'bg-amber-500 text-white hover:bg-amber-600'
                    }`}
                  >
                    {data.costApproved ? (
                      <>
                        <Check className="h-4 w-4" strokeWidth={3} />
                        Approve and continue
                      </>
                    ) : (
                      'Approve and continue'
                    )}
                  </button>
                </div>
                <p className="mt-2 text-center text-[11.5px] text-gray-400">
                  {data.costApproved
                    ? 'Approved — continue to Proposal Pack'
                    : 'Amend figures, share for a peer review, or self-approve to open Proposal Pack'}
                </p>
                {errorMessage && step === 6 && !data.costApproved ? (
                  <p className="mt-3 rounded-[10px] border border-[#FFE0DC] bg-[#FFF1F0] px-4 py-2.5 text-center text-[12px] font-semibold text-[#E22A12]">
                    {errorMessage}
                  </p>
                ) : null}
              </motion.div>
            )}

            {/* STEP 7 — Proposal Pack (templates + inserts) */}
            {step === 7 && (
              <motion.div
                key="step7-pack"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                {pendingPrefillConfirms.length > 0 ? (
                  <div className="mb-6 flex flex-col gap-3 rounded-[12px] border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[13px] font-semibold text-blue-900">
                        {pendingPrefillConfirms.length} auto-suggestion
                        {pendingPrefillConfirms.length === 1 ? '' : 's'} awaiting confirm
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-blue-700/90">
                        Click each blue item or confirm all to match the gold proposal pack.
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="btn-confirm-all-prefill"
                      onClick={confirmAllPrefilledSuggestions}
                      className="shrink-0 rounded-full bg-blue-600 px-5 py-2.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
                    >
                      Confirm all ({pendingPrefillConfirms.length})
                    </button>
                  </div>
                ) : null}
                <p className={sectionLabelCls}>Proposal Type</p>
                <div className="mb-7 flex gap-3">
                  {(['corporate', 'wedding'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        if (data.proposalCategory === cat) return;
                        templateManualRef.current = false;
                        setShowAllTemplates(false);
                        clearPrefill('proposalCategory');
                        setData((prev) => ({
                          ...prev,
                          proposalCategory: cat,
                        }));
                      }}
                      className={`flex-1 rounded-[10px] border px-4 py-3.5 text-[13px] font-semibold capitalize transition-colors ${
                        data.proposalCategory === cat
                          ? prefilledKeys.has('proposalCategory')
                            ? `border-blue-400 bg-blue-50 text-blue-900 ${PREFILL_INPUT_CLS}`
                            : 'border-[#FF5A45] bg-[#FFF1F0] text-[#E22A12]'
                          : 'border-[#e3e6e4] text-gray-600 hover:border-[#FF5A45]/40'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="mb-7">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className={fieldLabelCls}>
                      Itinerary
                      <span title="Auto-filled from Schedule Timings — edit freely; auto-updates pause until you reset">
                        <HelpCircle className="h-3.5 w-3.5 text-[#7c8a82]" />
                      </span>
                    </label>
                    {!data.proposalTimingsAuto ? (
                      <button
                        type="button"
                        onClick={() => {
                          setData((prev) => ({
                            ...prev,
                            proposalTimingsAuto: true,
                            proposalTimingsNotes: buildItineraryProposalText(prev),
                          }));
                        }}
                        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#FF5A45] hover:underline"
                      >
                        Reset from schedule
                      </button>
                    ) : (
                      <span className="text-[11px] text-gray-400">Auto from schedule</span>
                    )}
                  </div>
                  <textarea
                    value={data.proposalTimingsNotes}
                    onChange={(e) => {
                      setData((prev) => ({
                        ...prev,
                        proposalTimingsNotes: e.target.value,
                        proposalTimingsAuto: false,
                      }));
                    }}
                    rows={6}
                    className={`${inputCls} min-h-[140px] resize-y font-mono text-[12px] leading-relaxed`}
                  />
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    Flows into the proposal pack itinerary block. Editing here stops auto-updates until you reset.
                  </p>
                </div>

                <p className={sectionLabelCls}>Proposal Template</p>
                <div className="mb-7">
                  <p className="mb-3 text-[11.5px] text-gray-400">
                    {templateCatalog.count} templates indexed for {data.proposalCategory} — blue glow = auto-selected; click to confirm (green glow).
                  </p>
                  {prefilledKeys.has('templateId') && templateResolution.templateId && !confirmedKeys.has('templateId') ? (
                    <p className="mb-3 rounded-[8px] border border-blue-200 bg-blue-50/80 px-3 py-2 text-[11.5px] text-blue-800">
                      Suggested from event data:{' '}
                      <span className="font-semibold">{templateResolution.eventTypeUsed || data.eventType}</span>
                      {templateResolution.slotUsed ? (
                        <>
                          {' '}
                          · slot <span className="font-semibold">{templateResolution.slotUsed.replace(/_/g, ' ')}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {templatesVisible.map((t) => {
                      const selected = data.templateId === t.id;
                      const prefilled = prefilledKeys.has('templateId') && selected;
                      const confirmed = confirmedKeys.has('templateId') && selected;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (selected && prefilled && !confirmed) {
                              confirmKey('templateId');
                              return;
                            }
                            if (selected && confirmed) return;
                            if (selected && !prefilled) return;
                            templateManualRef.current = true;
                            clearPrefill('templateId');
                            setData((prev) => ({ ...prev, templateId: t.id }));
                          }}
                          className={`flex w-full items-center justify-between rounded-[10px] border px-4 py-3.5 text-left text-[13px] transition-all ${
                            selected
                              ? confirmed && prefilled
                                ? `${PREFILL_CONFIRMED_SURFACE} ${PREFILL_CONFIRMED_CLS}`
                                : prefilled
                                  ? `border-blue-400 bg-blue-50/80 font-semibold text-blue-900 ${PREFILL_BLUE_GLOW_CLS}`
                                  : 'border-[#FF5A45] bg-[#FFF1F0] font-semibold text-[#E22A12]'
                              : 'border-[#e3e6e4] text-gray-600 hover:border-[#FF5A45]/40'
                          }`}
                        >
                          <span>{templateLabel(t)}</span>
                          {selected && confirmed && prefilled ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                          ) : prefilled && selected && !confirmed ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Confirm</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {prefilledKeys.has('templateId') && !showAllTemplates && availableTemplates.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllTemplates(true)}
                      className="mt-2 text-[12px] font-semibold text-blue-700 hover:underline"
                    >
                      Show all {availableTemplates.length} templates…
                    </button>
                  ) : null}
                  {(() => {
                    const selected = availableTemplates.find((t) => t.id === data.templateId);
                    if (!selected || !data.eventType) return null;
                    const et = data.eventType.toLowerCase();
                    const tet = (selected.event_type || '').toLowerCase();
                    const mismatch = et && tet && !et.includes(tet) && !tet.includes(et);
                    if (!mismatch) return null;
                    return (
                      <p className="mt-2 rounded-[8px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                        Template “{selected.event_type}” does not match event type “{data.eventType}”.
                        Cover hero copy may look wrong (e.g. Engagement Celebration vs Social Gathering).
                      </p>
                    );
                  })()}
                </div>

                <p className={sectionLabelCls}>Inserts</p>
                <p className="mb-3 text-[11.5px] text-gray-400">
                  {insertCatalog.count} inserts indexed — vessel and staff ({insertCatalog.byKind.get('vessel')?.length || 0} vessel ·{' '}
                  {insertCatalog.byKind.get('staff')?.length || 0} staff).
                </p>
                <div
                  className={`mb-4 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4 ${
                    prefilledKeys.has('requiresInserts') && data.requiresInserts
                      ? confirmedKeys.has('requiresInserts')
                        ? `${PREFILL_CONFIRMED_SURFACE} ${PREFILL_CONFIRMED_CLS}`
                        : PREFILL_BLUE_GLOW_CLS
                      : ''
                  }`}
                >
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Does this proposal require inserts?</p>
                    <p className="text-[12px] text-gray-400">Vessel profile and staff page…</p>
                  </div>
                  <div className="flex gap-2">
                    {([true, false] as const).map((yes) => (
                      <button
                        key={String(yes)}
                        type="button"
                        onClick={() => {
                          if (data.requiresInserts === yes) {
                            if (yes && prefilledKeys.has('requiresInserts')) confirmKey('requiresInserts');
                            return;
                          }
                          set('requiresInserts', yes);
                          if (!yes) set('selectedInserts', []);
                        }}
                        className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
                          data.requiresInserts === yes
                            ? prefilledKeys.has('requiresInserts') && yes && !confirmedKeys.has('requiresInserts')
                              ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                              : prefilledKeys.has('requiresInserts') && yes && confirmedKeys.has('requiresInserts')
                                ? 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                                : 'bg-[#FF5A45] text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {yes ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>

                {data.requiresInserts && prefilledKeys.has('selectedInserts') && data.selectedInserts.length > 0 ? (
                  <div className="mb-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-blue-700">
                      Suggested inserts — click each to confirm
                    </p>
                    {data.selectedInserts.map((id) => {
                      const item = PROPOSAL_INSERTS.find((i) => i.id === id);
                      const confirmed = confirmedKeys.has(`insert:${id}`);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => confirmInsert(id)}
                          className={`flex w-full items-center justify-between rounded-[10px] border px-4 py-3 text-left text-[12.5px] transition-all ${
                            confirmed
                              ? `${PREFILL_CONFIRMED_SURFACE} ${PREFILL_CONFIRMED_CLS}`
                              : `border-blue-400 bg-blue-50/80 text-blue-900 ${PREFILL_BLUE_GLOW_CLS}`
                          }`}
                        >
                          <span className="min-w-0 break-words pr-2" title={item?.label || id}>{item?.label || id}</span>
                          {confirmed ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
                          ) : (
                            <span className="text-[10px] font-bold uppercase text-blue-600">Confirm</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {data.requiresInserts && (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setInsertPanelOpen(true)}
                      className="flex w-full items-center justify-between rounded-[10px] border border-[#FF5A45]/35 bg-[#FFF1F0] px-4 py-3.5 text-left transition-colors hover:bg-[#FFE4E0]"
                    >
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-[#E22A12]">
                        <Layers className="h-4 w-4" />
                        {data.selectedInserts.length
                          ? `${data.selectedInserts.length} insert${data.selectedInserts.length > 1 ? 's' : ''} selected`
                          : 'Choose inserts…'}
                      </span>
                      <ChevronDown className="h-4 w-4 text-[#E22A12]" />
                    </button>
                    {data.selectedInserts.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {data.selectedInserts.map((id) => {
                          const item = availableInserts.find((i) => i.id === id);
                          return (
                            <li
                              key={id}
                              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-700"
                            >
                              <span className="min-w-0 break-words pr-2" title={item?.label || id}>{item?.label || id}</span>
                              <button
                                type="button"
                                onClick={() => toggleInsert(id)}
                                className="text-gray-400 hover:text-[#E22A12]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="mt-2 text-[11px] text-gray-400">
                      {(INSERT_PLACEMENT_RULES as Record<string, string>).vessel ||
                        'Vessel inserts replace page 9; staff replace page 16. River map is in the core template.'}
                    </p>
                    {(() => {
                      const sc = resolveStaffContactFromInsertIds(data.selectedInserts, PROPOSAL_INSERTS);
                      const hasStaff = data.selectedInserts.some(
                        (id) => PROPOSAL_INSERTS.find((i) => i.id === id)?.kind === 'staff',
                      );
                      if (!hasStaff) return null;
                      return (
                        <div className="mt-3 rounded-[10px] border border-[#FF5A45]/25 bg-[#FFF1F0] px-4 py-3 text-[12px] text-[#E22A12]">
                          <span className="font-bold">Staff contact on proposal: </span>
                          {sc.name} · {sc.title}
                        </div>
                      );
                    })()}
                  </div>
                )}
                {errorMessage && step === 7 ? (
                  <p className="mt-3 rounded-[10px] border border-[#FFE0DC] bg-[#FFF1F0] px-4 py-2.5 text-center text-[12px] font-semibold text-[#E22A12]">
                    {errorMessage}
                  </p>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Navigation (Cost Approval actions live on the three Step 6 buttons) ── */}
          {step !== 6 ? (
          <div className="mt-11 flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="text-[13px] font-semibold text-gray-400 transition-colors hover:text-gray-700"
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {step < LAST_CONTENT_STEP ? (
              <button
                onClick={() => {
                  setErrorMessage('');
                  setStep((s) => Math.min(LAST_CONTENT_STEP, s + 1));
                }}
                className="flex items-center gap-2 rounded-full bg-[#FF5A45] px-8 py-3.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#F4412A]"
                data-testid="btn-next"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSaveQuote}
                data-testid="btn-save-quote"
                className="flex items-center gap-2 rounded-full px-8 py-3.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:brightness-95"
                style={{ backgroundColor: NOTES_BLUE }}
              >
                Save Quote
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          ) : null}
        </div>
      </main>

      {/* ── Right: docked Lead Notes (hidden while a PDF is generating).
          Schedule Timings swaps the cards for proposal timings — same UX. ── */}
      {stage === 'idle' ? (
      <aside
        className={`sticky top-16 z-[110] flex h-[calc(100vh-4rem)] shrink-0 flex-col overflow-hidden transition-[width] duration-300 ${
          isNotesOpen || step === 3 ? 'w-[min(380px,32vw)]' : 'w-14'
        }`}
      >
        {step === 3 ? (
          <ProposalTimingsCard
            timings={{
              embarkation: data.embarkation,
              departure: data.departure,
              returnTime: data.returnTime,
              disembarkation: data.disembarkation,
            }}
            proposalTimingsNotes={data.proposalTimingsNotes}
            isOpen={isNotesOpen || step === 3}
            onToggle={() => setIsNotesOpen((open) => !open)}
            onResetAuto={() => {
              setData((prev) => ({
                ...prev,
                proposalTimingsAuto: true,
                proposalTimingsNotes: buildItineraryProposalText(prev),
              }));
            }}
            onNotesChange={(text) => {
              setData((prev) => ({
                ...prev,
                proposalTimingsNotes: text,
                proposalTimingsAuto: false,
              }));
            }}
          />
        ) : (
          <LeadReferenceCard
            initialEnquiry={data.initialEnquiry}
            updatedEnquiry={data.keyItems}
            progressNotes={data.progressNotes}
            isOpen={isNotesOpen}
            onToggle={() => setIsNotesOpen((open) => !open)}
            onUpdatedEnquiryChange={(value) => set('keyItems', value)}
            onProgressNotesChange={(value) => set('progressNotes', value)}
            leadKey={leadNotesKey}
            leadName={quoteLead?.name}
            referenceNumber={quoteLead?.referenceNumber}
            email={quoteLead?.email}
          />
        )}
      </aside>
      ) : null}

      {/* ── Quote details overlay (Cost Approval step) ── */}
      <AnimatePresence>
        {quoteDetailsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f0d]/55 p-4 backdrop-blur-sm"
            onClick={() => setQuoteDetailsOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Quote details"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative max-h-[85vh] w-full max-w-[560px] overflow-hidden rounded-[20px] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-4">
                <div>
                  <p className="text-[15px] font-bold text-gray-800">Quote details</p>
                  <p className="text-[12px] text-gray-400">
                    {data.eventType || 'Event'} · {data.vesselType[0] || 'Vessel TBC'} ·{' '}
                    {data.guestCount || '—'} guests
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuoteDetailsOpen(false)}
                  className="rounded-full border border-[#e3e6e4] p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Close quote details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[calc(85vh-140px)] overflow-y-auto px-5 py-4">
                <div className="mb-4 grid grid-cols-2 gap-2 text-[12px] text-gray-600">
                  <div className="rounded-[10px] bg-[#fafafa] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7c8a82]">Version</p>
                    <p className="font-semibold text-gray-800">{data.quoteVersion || 'V1'}</p>
                  </div>
                  <div className="rounded-[10px] bg-[#fafafa] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7c8a82]">Period</p>
                    <p className="font-semibold text-gray-800">
                      {(data.weeklyPeriod || fin.rateParts?.weeklyPeriod || '—') +
                        ' · ' +
                        (data.dayPeriod || fin.rateParts?.dayPeriod || '—')}
                    </p>
                  </div>
                  {displayQuoteKeyItems(data) ? (
                    <div className="col-span-2 rounded-[10px] bg-[#fafafa] px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7c8a82]">Key items</p>
                      <p className="font-semibold text-gray-800" data-testid="quote-details-key-items">{displayQuoteKeyItems(data)}</p>
                    </div>
                  ) : null}
                </div>

                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7c8a82]">
                  Cost lines
                </p>
                <div className="mb-5" data-testid="quote-details-cost-lines">
                  <CostSectionAccordion
                    lines={fin.lines || []}
                    sectionTotals={fin.sectionTotals}
                    defaultOpen={['catering', 'entertainment', 'beverages']}
                  />
                </div>

                <div className="overflow-hidden rounded-[10px] border border-[#e3e6e4]">
                  {(
                    [
                      ['Total to WEOTT', fin.baseCost],
                      [`Margin (${(fin.margin * 100).toFixed(1)}%)`, fin.marginAmount],
                      ...(fin.discountAmount > 0
                        ? ([[`Discount`, -fin.discountAmount]] as [string, number][])
                        : []),
                      ...(fin.commissionAmount > 0
                        ? ([[`Commission`, fin.commissionAmount]] as [string, number][])
                        : []),
                      ['Updated profit', fin.updatedProfit],
                      ['Cost to client (exc VAT)', fin.costToClient],
                      ['VAT', fin.vat],
                      ['£ / guest (exc / inc)', null as unknown as number],
                    ] as [string, number | null][]
                  ).map(([label, val]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2.5 text-[12.5px] text-gray-600 last:border-b-0"
                    >
                      <span>{label}</span>
                      <span className="font-semibold text-slate-800">
                        {val == null
                          ? `£${fin.costPerGuestExc.toFixed(2)} / £${fin.costPerGuestInc.toFixed(2)}`
                          : formatFinMoney(label, val)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-[#FF5A45] px-4 py-3 text-[13px] font-black text-white">
                    <span>Grand total</span>
                    <span className="text-white">{formatGbpPounds(fin.grand)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#f0f0f0] px-5 py-4">
                <button
                  type="button"
                  data-testid="btn-approve-cost-overlay"
                  onClick={approveAndContinueFromStep6}
                  className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#FF5A45] px-5 py-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[#F4412A]"
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                  Approve &amp; continue to Proposal Pack
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {step6ShareQuote ? (
        <QuoteShareButtons
          quote={step6ShareQuote}
          copied={step6ShareCopied}
          onShare={(channel, quote) => void shareStep6Quote(channel, quote)}
          open={step6ShareOpen}
          onClose={() => setStep6ShareOpen(false)}
          hideTrigger
        />
      ) : null}

      {/* ── Right-edge hover image preview (from settings, per selected/hovered option) ── */}
      <AnimatePresence>
        {previewImg && previewOption && (
          <motion.div
            key={`${previewField}-${previewOption}`}
            initial={{ x: 200, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 200, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="pointer-events-none fixed right-0 top-1/2 z-40 h-[220px] w-[220px] -translate-y-1/2 overflow-hidden shadow-2xl"
          >
            <img src={previewImg} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <p className="text-[11px] font-bold text-white/90 leading-snug">{previewOption}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Generation overlay: large animated card with color-coded stages and a live data-integrity checklist ── */}
      <AnimatePresence>
        {stage !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0f0d]/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className="relative w-[560px] overflow-hidden rounded-[28px] bg-white shadow-2xl"
            >
              {/* Top progress bar — fills and shifts color as each stage completes */}
              <div className="h-1.5 w-full bg-gray-100">
                <motion.div
                  className="h-full"
                  animate={{
                    width:
                      stage === 'error'
                        ? '100%'
                        : `${((STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) + 1) / STAGE_ORDER.length) * 100}%`,
                    backgroundColor: STAGE_META[stage as keyof typeof STAGE_META].color,
                  }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>

              <div className="grid grid-cols-[1.1fr_1fr]">
                {/* ── Left: animated stage icon + label ── */}
                <div className="relative flex flex-col items-center justify-center overflow-hidden px-8 py-12">
                  {/* Ambient pulsing rings behind the icon, tinted to the current stage color */}
                  {stage !== 'error' && (
                    <>
                      <motion.div
                        key={`ring1-${stage}`}
                        className="absolute h-40 w-40 rounded-full"
                        style={{ backgroundColor: `${STAGE_META[stage as keyof typeof STAGE_META].color}12` }}
                        animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0.15, 0.6] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <motion.div
                        key={`ring2-${stage}`}
                        className="absolute h-28 w-28 rounded-full"
                        style={{ backgroundColor: `${STAGE_META[stage as keyof typeof STAGE_META].color}1f` }}
                        animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.25, 0.7] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                      />
                    </>
                  )}

                  <div className="relative z-10 mb-6 flex h-20 w-20 items-center justify-center">
                    {stage === 'error' ? (
                      <div
                        className="flex h-20 w-20 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${STAGE_META.error.color}18` }}
                      >
                        <AlertTriangle className="h-9 w-9" style={{ color: STAGE_META.error.color }} />
                      </div>
                    ) : (
                      <FluidFillCircle
                        percent={genPercent}
                        color={STAGE_META[stage as keyof typeof STAGE_META].color}
                        size={80}
                      />
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={stage}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25 }}
                      className="relative z-10 flex flex-col items-center text-center"
                    >
                      <p className="text-[17px] font-bold text-gray-800">
                        {stage === 'error' ? errorMessage || STAGE_META.error.label : STAGE_META[stage as keyof typeof STAGE_META].label}
                      </p>
                      <p className="mt-1.5 max-w-[240px] text-[12px] leading-relaxed text-gray-400">
                        {stage === 'error' ? STAGE_META.error.sub : STAGE_META[stage as keyof typeof STAGE_META].sub}
                      </p>
                    </motion.div>
                  </AnimatePresence>

                  {stage === 'error' && (
                    <div className="relative z-10 mt-7 flex items-center justify-center gap-3">
                      <button
                        onClick={() => setStage('idle')}
                        className="flex items-center gap-1.5 rounded-full border border-[#e3e6e4] px-4 py-2 text-[12.5px] font-semibold text-gray-500 transition-colors hover:bg-gray-50"
                      >
                        <X className="h-3.5 w-3.5" /> Close
                      </button>
                      <button
                        onClick={handleGenerate}
                        className="rounded-full bg-[#FF5A45] px-5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-[#F4412A]"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Right: data-integrity checklist + live order snapshot ── */}
                <div className="flex flex-col gap-6 border-l border-gray-100 bg-[#FAFBF9] px-7 py-9">
                  <div>
                    <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#7c8a82]">
                      Data Integrity
                    </p>
                    <div className="flex flex-col gap-3">
                      {INTEGRITY_STEPS.map(({ key, label }) => {
                        const reached =
                          stage !== 'error' && STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) >= STAGE_ORDER.indexOf(key);
                        return (
                          <div key={key} className="flex items-center gap-2.5">
                            <motion.div
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                              animate={{
                                backgroundColor: reached ? STAGE_META[key].color : '#e5e7eb',
                                scale: 1,
                              }}
                              transition={{ duration: 0.28, ease: 'easeOut' }}
                            >
                              {reached && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </motion.div>
                            <span
                              className={`text-[12.5px] transition-colors ${
                                reached ? 'font-semibold text-gray-700' : 'text-gray-400'
                              }`}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Live snapshot of the exact figures being sent, so nothing looks altered in transit */}
                  <div className="rounded-[14px] border border-gray-100 bg-white p-4">
                    <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#7c8a82]">
                      Quote Snapshot
                    </p>
                    <div className="flex flex-col gap-1.5 text-[12px]">
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-gray-400">Vessel</span>
                        <span className="min-w-0 text-right font-semibold leading-snug text-gray-700 break-words">
                          {data.vesselType.join(', ') || '—'}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="shrink-0 text-gray-400">Event</span>
                        <span className="min-w-0 text-right font-semibold leading-snug text-gray-700 break-words">
                          {data.eventType || '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="shrink-0 text-gray-400">Guests</span>
                        <span className="font-semibold text-gray-700">{data.guestCount || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Base Cost</span>
                        <span className="font-semibold text-slate-800">£{fin.baseCost.toFixed(2)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between border-t border-gray-100 pt-1.5">
                        <span className="text-gray-500">Grand Total</span>
                        <span className="font-black text-slate-800">{formatGbpPounds(fin.grand)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insert picker overlay card */}
      <AnimatePresence>
        {insertPanelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0b0f0d]/55 backdrop-blur-sm"
            onClick={() => setInsertPanelOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative flex max-h-[80vh] w-[520px] flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-4">
                <div>
                  <p className="text-[15px] font-bold text-[#101a15]">Available inserts</p>
                  <p className="text-[11.5px] text-gray-400">Select one or more — placement follows catalog rules</p>
                </div>
                <button
                  type="button"
                  onClick={() => setInsertPanelOpen(false)}
                  className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2 border-b border-[#f0f0f0] px-5 py-3">
                {(['all', 'vessel', 'staff'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setInsertKindFilter(k)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize ${
                      insertKindFilter === k ? 'bg-[#FF5A45] text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <ul className="flex-1 overflow-y-auto px-3 py-2">
                {(() => {
                  const filtered = availableInserts.filter(
                    (i) => insertKindFilter === 'all' || i.kind === insertKindFilter,
                  );
                  const suggestedSet = new Set(data.selectedInserts);
                  const visible =
                    showAllInsertsPanel || !prefilledKeys.has('selectedInserts')
                      ? filtered
                      : filtered.filter((i) => suggestedSet.has(i.id));
                  return (
                    <>
                      {!showAllInsertsPanel && prefilledKeys.has('selectedInserts') && filtered.length > visible.length ? (
                        <li className="mb-2 px-1">
                          <button
                            type="button"
                            onClick={() => setShowAllInsertsPanel(true)}
                            className="w-full rounded-[8px] border border-blue-200 bg-blue-50 px-3 py-2 text-left text-[12px] font-semibold text-blue-800"
                          >
                            Show all {filtered.length} inserts in catalog…
                          </button>
                        </li>
                      ) : null}
                      {visible.map((ins) => {
                        const on = data.selectedInserts.includes(ins.id);
                        const suggested = prefilledKeys.has('selectedInserts') && suggestedSet.has(ins.id);
                        const confirmed = confirmedKeys.has(`insert:${ins.id}`);
                        return (
                          <li key={ins.id}>
                            <button
                              type="button"
                              onClick={() => {
                                if (on && suggested && !confirmed) confirmInsert(ins.id);
                                else toggleInsert(ins.id);
                              }}
                              className={`mb-1 flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-all ${
                                on
                                  ? confirmed
                                    ? `bg-emerald-50/90 ${PREFILL_CONFIRMED_CLS}`
                                    : suggested
                                      ? `bg-blue-50/80 ${PREFILL_BLUE_GLOW_CLS}`
                                      : 'bg-[#FFF1F0]'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  on ? 'border-[#FF5A45] bg-[#FF5A45] text-white' : 'border-gray-300'
                                }`}
                              >
                                {on && <Check className="h-3 w-3" strokeWidth={3} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[12.5px] font-semibold text-gray-800">{ins.label}</span>
                                <span className="mt-0.5 block text-[10.5px] text-gray-400">
                                  {ins.kind}
                                  {ins.season ? ` · ${ins.season}` : ''}
                                  {ins.slot ? ` · ${ins.slot}` : ''}
                                  {ins.dancefloor ? ' · dancefloor' : ''}
                                  {suggested && !confirmed ? ' · click to confirm' : ''}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </>
                  );
                })()}
              </ul>
              <div className="border-t border-[#f0f0f0] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setInsertPanelOpen(false)}
                  className="w-full rounded-full bg-[#FF5A45] py-2.5 text-[13px] font-bold text-white"
                >
                  Done · {data.selectedInserts.length} selected
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Forms;
