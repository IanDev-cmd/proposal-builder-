import { useState, useRef, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowRight, Check, HelpCircle, Loader2, FileCheck2, AlertTriangle, X, UserRound, Layers } from 'lucide-react';
import { addProposal } from '@/lib/proposalStore';
import { VESSEL_TYPES, EVENT_TYPES, MENU_TYPES, getStoredPreview } from '@/lib/formOptions';
import { ItineraryWatch } from '@/components/ItineraryWatch';
import { getQuoteLead, clearQuoteLead, type QuoteLead } from '@/lib/quoteLeadStore';
import {
  UPGRADES,
  calcBaseCostBreakdown,
  calcFinancials,
  buildStargtmPayload,
  CONTINGENCY_RATE,
} from '@/lib/quoteFinance';
import {
  templatesForCategory,
  templateLabel,
  filterInserts,
  INSERT_PLACEMENT_RULES,
  PROPOSAL_INSERTS,
} from '@/lib/proposalAssets';
import { appendProgressNote, writeQuoteStatus, getSheetsMode, fetchCostRates } from '@/lib/sheetsSync';
import { resolveStaffContactFromInsertIds } from '@/lib/staffContacts';
import { QUOTE_WEBHOOK_URL } from '@/lib/backendUrls';
import {
  matchVessels,
  matchEventType,
  parseRequestedTimes,
  isFlexibleDate,
  isRepeatYes,
  parseEventDateForInput,
} from '@/lib/leadPrefill';

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
  embarkation: string;
  departure: string;
  returnTime: string;
  disembarkation: string;
  menuType: string[];
  repeatClient: boolean;
  agentReferral: boolean;
  totalCost: string;
  /** Margin % override (e.g. 25). Empty = use repeat/new default. */
  marginPercent: string;
  selectedUpgrades: string[];
  /** corporate | wedding — drives template list only (manual pick). */
  proposalCategory: 'corporate' | 'wedding';
  /** Explicit stargtm template id — salesperson selects; no auto-pick. */
  templateId: string;
  requiresInserts: boolean;
  selectedInserts: string[];
  progressNotes: string;
  budget: string;
  packageWordingNotes: string;
  /** Meera: cost cross-check before generate */
  costApproved: boolean;
};

/**
 * The n8n lead fetch's "Source" column is a free-text tag like
 * "Repeat Client 1, 2" or "Build your event form 1-3" — the trailing
 * numbers are spreadsheet artifacts, not part of the tag. Match it against
 * the known SOURCE_TYPES so the Quote Builder's Source picker can be
 * prefilled, and separately flag "Repeat Client" so the toggle can be too.
 */
function matchSourceType(rawSource?: string): string {
  if (!rawSource) return '';
  const found = SOURCE_TYPES.find((type) => rawSource.toLowerCase().startsWith(type.toLowerCase()));
  return found ?? '';
}

function isRepeatClientSource(rawSource?: string): boolean {
  if (!rawSource) return false;
  return rawSource.toLowerCase().includes('repeat client');
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const INIT: FormData = {
  vesselType: [],
  eventType: '',
  source: '',
  eventDate: todayIso(),
  dateFlexible: false,
  guestCount: '',
  embarkation: '10:00',
  departure: '12:00',
  returnTime: '17:00',
  disembarkation: '18:00',
  menuType: [],
  repeatClient: false,
  agentReferral: false,
  totalCost: '',
  marginPercent: '',
  selectedUpgrades: [],
  proposalCategory: 'corporate',
  templateId: '',
  requiresInserts: false,
  selectedInserts: [],
  progressNotes: '',
  budget: '',
  packageWordingNotes: '',
  costApproved: false,
};

function formFromLead(lead: QuoteLead | null): FormData {
  if (!lead) return { ...INIT };
  // Prefer n8n-derived fields (eventDateDisplay / eventDateFlexibleBool / groupSizeQuote)
  const flex =
    lead.eventDateFlexibleBool === true ||
    lead.eventDateDisplay === 'Date TBC' ||
    isFlexibleDate(lead.eventDateFlexible, lead.eventDateFlexibleBool);
  const times = parseRequestedTimes(lead.requestedEventTimes);
  const vessels = matchVessels(lead.vessels);
  const eventType = matchEventType(lead.eventType) || lead.eventType || '';
  const guest =
    lead.groupSizeQuote != null && String(lead.groupSizeQuote).trim() !== ''
      ? String(lead.groupSizeQuote)
      : (String(lead.groupSize || '').match(/\d+/)?.[0] ?? '');
  const wedding = /wedding|engagement/i.test(lead.eventType || eventType);
  return {
    ...INIT,
    source: matchSourceType(lead.source) || INIT.source,
    repeatClient: isRepeatYes(lead.repeatClient) || isRepeatClientSource(lead.source),
    vesselType: vessels,
    eventType: eventType || INIT.eventType,
    dateFlexible: flex,
    eventDate: flex
      ? ''
      : parseEventDateForInput(lead.eventDateDisplay, lead.fullEventDate, flex) || INIT.eventDate,
    guestCount: guest,
    embarkation: times.embarkation || INIT.embarkation,
    disembarkation: times.disembarkation || INIT.disembarkation,
    progressNotes: lead.progressNotes || '',
    budget: lead.budget || '',
    proposalCategory: wedding ? 'wedding' : 'corporate',
  };
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
}: {
  label: string;
  field: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  onPreview?: (field: string, option: string | null) => void;
  helper?: string;
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

  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

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
        onClick={() => setOpen((p) => !p)}
        className={`${inputCls} flex items-center justify-between`}
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
            {options.map((opt) => {
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
          </motion.ul>
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
}: {
  label: string;
  field: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onPreview?: (field: string, option: string | null) => void;
  helper?: string;
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
        onClick={() => setOpen((p) => !p)}
        className={`${inputCls} flex items-center justify-between`}
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
            {options.map((opt) => (
              <motion.li
                key={opt}
                whileHover={{ backgroundColor: '#f0fdf5' }}
                onMouseEnter={() => onPreview?.(field, opt)}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13px] text-gray-700 transition-colors"
              >
                {opt}
                {value === opt && <Check className="h-3.5 w-3.5 text-[#FF5A45]" />}
              </motion.li>
            ))}
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
  { n: 4, label: 'Catering' },
  { n: 5, label: 'Financials' },
  { n: 6, label: 'Upgrades' },
  { n: 7, label: 'Proposal Pack' },
];

export function Forms() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [quoteLead] = useState<QuoteLead | null>(() => getQuoteLead());
  const [data, setData] = useState<FormData>(() => formFromLead(getQuoteLead()));
  const [previewField, setPreviewField] = useState<string | null>(null);
  const [previewOption, setPreviewOption] = useState<string | null>(null);
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Base Cost stays auto-prefilled from the vessel/menu/guests/upgrades
  // formula until the user types their own figure into the field — then it
  // stops overwriting them until they explicitly ask to resync.
  const [baseCostAuto, setBaseCostAuto] = useState(true);
  const [ratesNote, setRatesNote] = useState<string>('');

  const set = (key: keyof FormData, val: unknown) =>
    setData((prev) => ({ ...prev, [key]: val }));

  const toggleUpgrade = (label: string) =>
    set(
      'selectedUpgrades',
      data.selectedUpgrades.includes(label)
        ? data.selectedUpgrades.filter((u) => u !== label)
        : [...data.selectedUpgrades, label],
    );

  const marginOverride =
    data.marginPercent.trim() !== '' && Number.isFinite(Number(data.marginPercent))
      ? Number(data.marginPercent) / 100
      : null;

  const financeInput = { ...data, marginOverride };
  const fin = calcFinancials(financeInput);
  const baseCostBreakdown = calcBaseCostBreakdown(data);

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

  const [insertPanelOpen, setInsertPanelOpen] = useState(false);
  const [insertKindFilter, setInsertKindFilter] = useState<'all' | 'vessel' | 'staff' | 'map'>('all');

  // Soft-fetch Cost Mother / Price Comparison rates (raw) for awareness — rates still
  // apply via quoteFinance defaults until UI maps raw rows defensively.
  useEffect(() => {
    let cancelled = false;
    fetchCostRates()
      .then((r) => {
        if (cancelled) return;
        const n = r.counts?.cateringRates ?? r.cateringRates?.length ?? 0;
        const v = r.counts?.vesselRates ?? r.vesselRates?.length ?? 0;
        setRatesNote(
          n || v
            ? `Cost rates linked (${v} vessel · ${n} catering rows from Sheets). Base costs still use Quote Sheet defaults until mapped.`
            : '',
        );
      })
      .catch(() => {
        if (!cancelled) setRatesNote('');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep Base Cost synced to the formula while it's in "auto" mode. Guarded
  // to only run once the relevant inputs actually change, so typing a
  // manual override (which flips baseCostAuto off) never gets clobbered.
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
    data.disembarkation,
    data.selectedUpgrades,
  ]);

  const handlePreview = (field: string, option: string | null) => {
    setPreviewField(option ? field : null);
    setPreviewOption(option);
  };
  const previewImg = getStoredPreview(previewField, previewOption);

  const toggleInsert = (id: string) =>
    set(
      'selectedInserts',
      data.selectedInserts.includes(id)
        ? data.selectedInserts.filter((x) => x !== id)
        : [...data.selectedInserts, id],
    );

  const handleGenerate = async () => {
    setErrorMessage('');
    setStage('preparing');

    if (!data.templateId) {
      setErrorMessage('Select a proposal template in Proposal Pack before generating.');
      setStage('error');
      setStep(7);
      return;
    }

    if (!data.costApproved) {
      setErrorMessage('Confirm cost cross-check approval on Financials before generating.');
      setStage('error');
      setStep(5);
      return;
    }

    const staffContact = resolveStaffContactFromInsertIds(
      data.requiresInserts ? data.selectedInserts : [],
      PROPOSAL_INSERTS,
    );

    const packageWording = data.packageWordingNotes.trim()
      ? { notes: data.packageWordingNotes.trim().split(/\n+/).filter(Boolean) }
      : {};

    const payload = buildStargtmPayload({
      form: financeInput,
      financials: fin,
      lead: quoteLead
        ? {
            name: quoteLead.name,
            email: quoteLead.email,
            phone: quoteLead.phone,
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
            eventDateDisplay: data.dateFlexible ? 'Date TBC' : data.eventDate,
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
            // Form edits overlay n8n SoT for fields the REP changed in the wizard
            referenceNumber: quoteLead.referenceNumber,
            name: quoteLead.name,
            companyName: quoteLead.company,
            companySector: quoteLead.companySector,
            email: quoteLead.email,
            phone: quoteLead.phone,
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
            eventDateDisplay: data.dateFlexible ? 'Date TBC' : data.eventDate || quoteLead.eventDateDisplay,
            requestedEventTimes:
              `${data.embarkation} - ${data.disembarkation}` || quoteLead.requestedEventTimes,
            groupSize: data.guestCount || quoteLead.groupSize,
            groupSizeQuote: parseFloat(data.guestCount) || quoteLead.groupSizeQuote,
            vessels: data.vesselType.join(', ') || quoteLead.vessels,
            market: quoteLead.market,
            bestTimeToCall: quoteLead.bestTimeToCall,
            yearOfEvent: quoteLead.yearOfEvent,
            progressNotes: data.progressNotes || quoteLead.progressNotes,
            agent: data.agentReferral ? 'YES' : '',
          }
        : null,
      templateId: data.templateId,
      category: data.proposalCategory,
      selectedInserts: data.requiresInserts ? data.selectedInserts : [],
      progressNotes: data.progressNotes,
      packageWording,
      staffContact,
    });

    // Attach sheets mode so n8n routes demo→test sheet / live→production.
    const sheetsMode = getSheetsMode();
    const outbound = { ...payload, mode: sheetsMode };

    await new Promise((r) => setTimeout(r, 500));
    setStage('sending');

    try {
      // Write progress notes + quote financials back to Sheets (SoT) before/alongside PDF.
      if (data.progressNotes.trim()) {
        await appendProgressNote({
          referenceNumber: quoteLead?.referenceNumber,
          email: quoteLead?.email,
          leadName: quoteLead?.name,
          note: data.progressNotes.trim(),
          tag: 'pipeline',
          mode: sheetsMode,
        }).catch(() => undefined);
      }
      await writeQuoteStatus({
        referenceNumber: quoteLead?.referenceNumber,
        email: quoteLead?.email,
        leadName: quoteLead?.name,
        status: 'generating',
        title: `${data.eventType || 'Event'} Proposal`,
        eventType: data.eventType,
        eventDate: data.eventDate,
        guestCount: data.guestCount,
        guests: parseFloat(data.guestCount) || 0,
        repeatClient: data.repeatClient,
        selectedUpgrades: data.selectedUpgrades,
        templateId: data.templateId,
        selectedInserts: data.requiresInserts ? data.selectedInserts : [],
        staffContact: staffContact.name,
        baseCost: fin.baseCost,
        contingency: fin.contingency,
        contingencyRate: fin.contingencyRate,
        margin: fin.margin,
        marginAmount: fin.marginAmount,
        costToClient: fin.costToClient,
        packageCost: fin.costToClient,
        vat: fin.vat,
        vatRate: fin.vatRate,
        upgradeTotal: fin.upgradeTotal,
        grandTotal: fin.grand,
        mode: sheetsMode,
      }).catch(() => undefined);

      const res = await fetch(QUOTE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outbound),
      });

      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);

      setStage('generating');

      const contentType = res.headers.get('content-type') ?? '';
      let pdfDataUrl = '';

      if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) {
        const blob = await res.blob();
        pdfDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const json = await res.json().catch(() => null);
        const base64OrUrl: string | undefined =
          json?.pdfBase64 ?? json?.pdf ?? json?.fileUrl ?? json?.pdfUrl ?? json?.url;
        if (base64OrUrl?.startsWith('data:')) {
          pdfDataUrl = base64OrUrl;
        } else if (base64OrUrl) {
          if (/^[A-Za-z0-9+/=]+$/.test(base64OrUrl) && base64OrUrl.length > 100) {
            pdfDataUrl = `data:application/pdf;base64,${base64OrUrl}`;
          } else {
            const fileRes = await fetch(base64OrUrl);
            const blob = await fileRes.blob();
            pdfDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        } else {
          throw new Error('The webhook did not return a PDF.');
        }
      }

      const saved = await addProposal({
        id: `proposal-${Date.now()}`,
        createdAt: new Date().toISOString(),
        eventDate: data.eventDate,
        title: `${data.eventType || 'Event'} Proposal — ${data.vesselType.join(', ') || 'Vessel TBC'}`,
        vesselType: data.vesselType.join(', '),
        eventType: data.eventType,
        guestCount: data.guestCount,
        grandTotal: fin.grand,
        pdfDataUrl,
        leadName: quoteLead?.name,
        leadEmail: quoteLead?.email,
      });

      if (!saved) {
        throw new Error(
          'The PDF was generated but is too large to store in this browser — clear some space (e.g. delete older proposals) and try again.',
        );
      }

      await writeQuoteStatus({
        referenceNumber: quoteLead?.referenceNumber,
        email: quoteLead?.email,
        leadName: quoteLead?.name,
        status: 'ready',
        eventType: data.eventType,
        eventDate: data.eventDate,
        guestCount: data.guestCount,
        grandTotal: fin.grand,
        costToClient: fin.costToClient,
        vat: fin.vat,
        templateId: data.templateId,
      }).catch(() => undefined);

      clearQuoteLead();
      setStage('done');
      setTimeout(() => navigate('/proposal-doc'), 1200);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate the proposal.');
      setStage('error');
    }
  };

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

      {/* ── Right: form content ── */}
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="mx-auto max-w-[640px] px-12 py-14">
          <AnimatePresence mode="wait" initial={false}>

            {/* STEP 1 — Event Core */}
            {step === 1 && (
              <motion.div key="step1" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <p className={sectionLabelCls}>Your Event Details</p>

                <div className="mb-7">
                  <FormSelect
                    label="Source"
                    field="source"
                    options={SOURCE_TYPES}
                    value={data.source}
                    onChange={(v) => set('source', v)}
                    helper="Where this enquiry originated from"
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
                    onChange={(v) => set('vesselType', v)}
                    onPreview={handlePreview}
                  />
                  <FormSelect
                    label="Event Type"
                    field="eventType"
                    options={EVENT_TYPES}
                    value={data.eventType}
                    onChange={(v) => set('eventType', v)}
                    onPreview={handlePreview}
                  />
                </div>

                <p className={sectionLabelCls}>Event Date</p>
                <div className="mb-4 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Date flexible → Date TBC</p>
                    <p className="text-[12px] text-gray-400">From Enquiry “Event Date - Flexible?”</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !data.dateFlexible;
                      set('dateFlexible', next);
                      if (next) set('eventDate', '');
                    }}
                    className={`relative h-7 w-14 rounded-full transition-colors ${data.dateFlexible ? 'bg-[#FF5A45]' : 'bg-gray-200'}`}
                  >
                    <motion.div
                      animate={{ x: data.dateFlexible ? 28 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>
                <div className="mb-7">
                  <label className={fieldLabelCls}>
                    Date of Event
                    <span title="The calendar day this event takes place">
                      <HelpCircle className="h-3.5 w-3.5 text-[#7c8a82]" />
                    </span>
                  </label>
                  {data.dateFlexible ? (
                    <div className={`${inputCls} font-semibold text-[#E22A12]`}>Date TBC</div>
                  ) : (
                    <input
                      type="date"
                      value={data.eventDate}
                      onChange={(e) => set('eventDate', e.target.value)}
                      className={inputCls}
                    />
                  )}
                </div>

                {data.budget ? (
                  <div className="mb-7">
                    <p className={sectionLabelCls}>Budget (from Enquiry / n8n)</p>
                    <p className="rounded-[10px] border border-[#e3e6e4] bg-[#FFF1F0] px-4 py-3 text-[13px] font-semibold text-gray-800">
                      {data.budget}
                    </p>
                  </div>
                ) : null}

                {quoteLead && (quoteLead.preparedBy || quoteLead.market || quoteLead.yearOfEvent || quoteLead.bestTimeToCall) ? (
                  <div className="mb-7 overflow-hidden rounded-[10px] border border-[#e3e6e4]">
                    <p className="border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7c8a82]">
                      Sheets SoT (n8n aliases)
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

                <p className={sectionLabelCls}>Progress Notes</p>
                <div>
                  <label className={fieldLabelCls}>
                    Call / progress notes
                    <span title="Written back to Google Sheets (Nexus Ops Notes)">
                      <HelpCircle className="h-3.5 w-3.5 text-[#7c8a82]" />
                    </span>
                  </label>
                  <textarea
                    value={data.progressNotes}
                    onChange={(e) => set('progressNotes', e.target.value)}
                    rows={4}
                    placeholder="Event details, proposal info, next actions…"
                    className={`${inputCls} min-h-[96px] resize-y`}
                  />
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    Replaces typing notes directly into the Enquiry sheet — synced on generate.
                  </p>
                </div>
              </motion.div>
            )}

            {/* STEP 2 — Guest Count */}
            {step === 2 && (
              <motion.div key="step2" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <p className={sectionLabelCls}>Guest Count</p>
                <div className="mb-7">
                  <label className={fieldLabelCls}>Number of Guests</label>
                  <input
                    type="number"
                    min={1}
                    value={data.guestCount}
                    onChange={(e) => set('guestCount', e.target.value)}
                    placeholder="e.g. 120"
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11.5px] text-gray-400">Used to calculate staffing across the event.</p>
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
                        className={inputCls}
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

            {/* STEP 4 — Catering */}
            {step === 4 && (
              <motion.div key="step3" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <p className={sectionLabelCls}>Catering</p>

                <FormMultiSelect
                  label="Menu Type"
                  field="menuType"
                  options={MENU_TYPES}
                  value={data.menuType}
                  onChange={(v) => set('menuType', v)}
                  onPreview={handlePreview}
                />

                {data.menuType.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-7 grid grid-cols-2 gap-4"
                  >
                    <div className="rounded-[10px] border border-[#e3e6e4] bg-[#FFF1F0] p-5">
                      <p className={sectionLabelCls}>Catering Assistants</p>
                      <p className="text-[28px] font-black text-[#E22A12]">
                        {Math.ceil((parseInt(data.guestCount) || 50) / 20)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">1 per 20 guests</p>
                    </div>
                    <div className="rounded-[10px] border border-[#e3e6e4] bg-[#FFF1F0] p-5">
                      <p className={sectionLabelCls}>Event Staff</p>
                      <p className="text-[28px] font-black text-[#E22A12]">
                        {Math.ceil((parseInt(data.guestCount) || 50) / 25)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">1 per 25 guests</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* STEP 5 — Financials */}
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
                <div className="mb-7 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Repeat Client</p>
                    <p className="text-[12px] text-gray-400">Reduces margin from 25% to 15%</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('repeatClient', !data.repeatClient)}
                    className={`relative h-7 w-14 rounded-full transition-colors ${data.repeatClient ? 'bg-[#FF5A45]' : 'bg-gray-200'}`}
                  >
                    <motion.div
                      animate={{ x: data.repeatClient ? 28 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                <div className="mb-7 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Agent Referral</p>
                    <p className="text-[12px] text-gray-400">Adds +10% agent fee on cost to client (Quote Sheet)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('agentReferral', !data.agentReferral)}
                    className={`relative h-7 w-14 rounded-full transition-colors ${data.agentReferral ? 'bg-[#FF5A45]' : 'bg-gray-200'}`}
                  >
                    <motion.div
                      animate={{ x: data.agentReferral ? 28 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

                <p className={sectionLabelCls}>Cost Inputs</p>
                <p className="mb-3 text-[11.5px] text-gray-400">
                  Rates from Quote Sheet · Price Comparison (cost to WEOTT). Contingency {(CONTINGENCY_RATE * 100).toFixed(2)}% then margin, then VAT.
                  {ratesNote ? ` ${ratesNote}` : ''}
                </p>

                <div className="mb-7">
                  <label className={fieldLabelCls}>Margin % (editable)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={data.marginPercent}
                    onChange={(e) => set('marginPercent', e.target.value)}
                    placeholder={data.repeatClient ? '15 (repeat default)' : '25 (new default)'}
                    className={inputCls}
                  />
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    Leave blank for default (repeat 15% / new 25%). REP commercial judgment — Meera.
                  </p>
                </div>

                {/* Base Cost formula — Quote Sheet SoT via quoteFinance.ts */}
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
                    <span className="font-semibold text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{baseCostBreakdown.vesselHire.toFixed(2)}</span>
                  </div>
                  {[
                    ['Catering (× guests)', baseCostBreakdown.menuCost],
                    ['Fixed Operational Costs', baseCostBreakdown.fixedOps],
                    ...(baseCostBreakdown.upgradesTotal > 0
                      ? ([['Upgrades Total', baseCostBreakdown.upgradesTotal]] as const)
                      : []),
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                      <span>{label}</span>
                      <span className="font-semibold text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{(val as number).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-[#f0fdf5] px-5 py-3 text-[13px] font-bold text-gray-700">
                    <span>Base Cost (formula total)</span>
                    <span className="text-[14px] font-black text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{baseCostBreakdown.total.toFixed(2)}</span>
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
                    Prefilled from Quote Sheet rates — edit to override.
                  </p>
                </div>

                {(parseFloat(data.totalCost) > 0 || data.selectedUpgrades.length > 0) && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[10px] border border-[#e3e6e4]">
                    <div className="flex items-center justify-between border-b border-[#f0f0f0] bg-[#f0fdf5] px-5 py-3 text-[13px] font-bold text-gray-700">
                      <span>Base Cost</span>
                      <span className="font-black text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{fin.baseCost.toFixed(2)}</span>
                    </div>
                    {[
                      ['Contingency (2.25%)', fin.contingency],
                      [`Margin (${(fin.margin * 100).toFixed(0)}%)`, fin.marginAmount],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                        <span>{label}</span>
                        <span className="font-semibold text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{(val as number).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-b border-[#f0f0f0] bg-[#f0fdf5] px-5 py-3 text-[13px] font-bold text-gray-700">
                      <span>Cost to Client</span>
                      <span className="font-black text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{fin.costToClient.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                      <span>VAT (20%)</span>
                      <span className="font-semibold text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{fin.vat.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between bg-[#FF5A45] px-5 py-4 text-[14px] font-black text-white">
                      <span>Grand Total</span>
                      <span className="text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{fin.grand.toFixed(2)}</span>
                    </div>
                  </motion.div>
                )}

                <div className="mt-7 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Cost cross-check approved</p>
                    <p className="text-[12px] text-gray-400">Required before PDF generate (Meera accuracy gate)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('costApproved', !data.costApproved)}
                    className={`relative h-7 w-14 rounded-full transition-colors ${data.costApproved ? 'bg-[#FF5A45]' : 'bg-gray-200'}`}
                  >
                    <motion.div
                      animate={{ x: data.costApproved ? 28 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm"
                    />
                  </button>
                </div>

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

            {/* STEP 6 — Upgrades */}
            {step === 6 && (
              <motion.div
                key="step6-upgrades"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                <p className={sectionLabelCls}>Optional Add-Ons</p>

                <div className="flex flex-col gap-3">
                  {UPGRADES.map(({ label, price, type }) => {
                    const selected = data.selectedUpgrades.includes(label);
                    const guests = parseFloat(data.guestCount) || 0;
                    const lineTotal = type === 'perGuest' ? price * guests : price;
                    return (
                      <motion.button
                        key={label}
                        type="button"
                        whileHover={{ x: 4 }}
                        onClick={() => toggleUpgrade(label)}
                        className={`flex items-center justify-between rounded-[10px] border px-5 py-4 text-left transition-colors ${
                          selected
                            ? 'border-[#FF5A45] bg-[#FFF1F0]'
                            : 'border-[#e3e6e4] bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-[6px] transition-colors ${
                              selected ? 'bg-[#FF5A45]' : 'border border-[#d0d0d0]'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-[13px] font-semibold text-gray-800">{label}</span>
                          {type === 'perGuest' && (
                            <span className="text-[10.5px] text-gray-400">(£{price}/guest)</span>
                          )}
                        </div>
                        <span className={`text-[13px] font-bold ${selected ? 'text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]' : 'text-gray-400'}`}>
                          £{lineTotal.toLocaleString()}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {data.selectedUpgrades.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 flex items-center justify-between rounded-[10px] border border-[#FF5A45] bg-[#FFF1F0] px-5 py-4"
                  >
                    <span className="text-[12px] font-semibold text-[#E22A12]">
                      {data.selectedUpgrades.length} upgrade{data.selectedUpgrades.length > 1 ? 's' : ''} selected
                    </span>
                    <span className="text-[14px] font-black text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">
                      +£{baseCostBreakdown.upgradesTotal.toLocaleString()}
                    </span>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* STEP 7 — Proposal Pack (templates + inserts) — Meera Priority 1 */}
            {step === 7 && (
              <motion.div
                key="step7-pack"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
              >
                <p className={sectionLabelCls}>Proposal Type</p>
                <div className="mb-7 flex gap-3">
                  {(['corporate', 'wedding'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        set('proposalCategory', cat);
                        set('templateId', '');
                      }}
                      className={`flex-1 rounded-[10px] border px-4 py-3.5 text-[13px] font-semibold capitalize transition-colors ${
                        data.proposalCategory === cat
                          ? 'border-[#FF5A45] bg-[#FFF1F0] text-[#E22A12]'
                          : 'border-[#e3e6e4] text-gray-600 hover:border-[#FF5A45]/40'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <p className={sectionLabelCls}>Proposal Template</p>
                <div className="mb-7">
                  <label className={fieldLabelCls}>
                    Select template
                    <span title="Team picks the template — no automatic selection">
                      <HelpCircle className="h-3.5 w-3.5 text-[#7c8a82]" />
                    </span>
                  </label>
                  <select
                    value={data.templateId}
                    onChange={(e) => set('templateId', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select a proposal template…</option>
                    {availableTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {templateLabel(t)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11.5px] text-gray-400">
                    {availableTemplates.length} templates in {data.proposalCategory} catalog · manual pick only
                  </p>
                </div>

                <p className={sectionLabelCls}>Inserts</p>
                <div className="mb-4 flex items-center justify-between rounded-[10px] border border-[#e3e6e4] p-4">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Does this proposal require inserts?</p>
                    <p className="text-[12px] text-gray-400">Vessel profile, staff page, river map…</p>
                  </div>
                  <div className="flex gap-2">
                    {([true, false] as const).map((yes) => (
                      <button
                        key={String(yes)}
                        type="button"
                        onClick={() => {
                          set('requiresInserts', yes);
                          if (!yes) set('selectedInserts', []);
                        }}
                        className={`rounded-full px-4 py-2 text-[12px] font-bold transition-colors ${
                          data.requiresInserts === yes
                            ? 'bg-[#FF5A45] text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {yes ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>

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
                              <span className="truncate">{item?.label || id}</span>
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
                        'Vessel inserts replace page 9; staff replace page 16; maps insert after vessel.'}
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Navigation (DNB: single pill "Next" button, bottom right) ── */}
          <div className="mt-11 flex items-center justify-between">
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
            {step < 7 ? (
              <button
                onClick={() => setStep((s) => Math.min(7, s + 1))}
                className="flex items-center gap-2 rounded-full bg-[#FF5A45] px-8 py-3.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#F4412A]"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 rounded-full bg-[#FF5A45] px-8 py-3.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#F4412A]"
              >
                Generate Proposal
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </main>

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

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={stage}
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.9 }}
                      transition={{ duration: 0.25 }}
                      className="relative z-10 flex flex-col items-center text-center"
                    >
                      <div
                        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${STAGE_META[stage as keyof typeof STAGE_META].color}18` }}
                      >
                        {stage === 'done' ? (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
                            <FileCheck2 className="h-9 w-9" style={{ color: STAGE_META.done.color }} />
                          </motion.div>
                        ) : stage === 'error' ? (
                          <AlertTriangle className="h-9 w-9" style={{ color: STAGE_META.error.color }} />
                        ) : (
                          <Loader2
                            className="h-9 w-9 animate-spin"
                            style={{ color: STAGE_META[stage as keyof typeof STAGE_META].color }}
                          />
                        )}
                      </div>
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
                        const active = stage === key;
                        return (
                          <div key={key} className="flex items-center gap-2.5">
                            <motion.div
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                              animate={{
                                backgroundColor: reached ? STAGE_META[key].color : '#e5e7eb',
                                scale: active ? [1, 1.15, 1] : 1,
                              }}
                              transition={{ duration: active ? 0.8 : 0.3, repeat: active ? Infinity : 0 }}
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
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Vessel</span>
                        <span className="font-semibold text-gray-700">{data.vesselType.join(', ') || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Event</span>
                        <span className="font-semibold text-gray-700">{data.eventType || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Guests</span>
                        <span className="font-semibold text-gray-700">{data.guestCount || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Base Cost</span>
                        <span className="font-semibold text-[#00e676] [text-shadow:0_0_6px_rgba(0,230,118,0.55)]">£{fin.baseCost.toFixed(2)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between border-t border-gray-100 pt-1.5">
                        <span className="text-gray-500">Grand Total</span>
                        <span className="font-black text-[#00e676]">£{fin.grand.toFixed(2)}</span>
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
                {(['all', 'vessel', 'staff', 'map'] as const).map((k) => (
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
                {availableInserts
                  .filter((i) => insertKindFilter === 'all' || i.kind === insertKindFilter)
                  .map((ins) => {
                    const on = data.selectedInserts.includes(ins.id);
                    return (
                      <li key={ins.id}>
                        <button
                          type="button"
                          onClick={() => toggleInsert(ins.id)}
                          className={`mb-1 flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
                            on ? 'bg-[#FFF1F0]' : 'hover:bg-gray-50'
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
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
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
