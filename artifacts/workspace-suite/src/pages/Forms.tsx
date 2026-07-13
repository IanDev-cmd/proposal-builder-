import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowRight, Check, HelpCircle, Loader2, FileCheck2, AlertTriangle, X, UserRound } from 'lucide-react';
import { addProposal } from '@/lib/proposalStore';
import { VESSEL_TYPES, EVENT_TYPES, MENU_TYPES, getStoredPreview } from '@/lib/formOptions';
import { ItineraryWatch } from '@/components/ItineraryWatch';
import { getQuoteLead, clearQuoteLead, type QuoteLead } from '@/lib/quoteLeadStore';

const QUOTE_WEBHOOK_URL = 'https://ravenmark.app.n8n.cloud/webhook/QuoteBuilder';

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

const UPGRADES = [
  { label: 'Live DJ', price: 500 },
  { label: 'Saxophonist', price: 550 },
  { label: 'Photo Booth', price: 650 },
  { label: 'Close-up Magician', price: 700 },
  { label: 'Branded Vessel Flag', price: 150 },
];

type FormData = {
  vesselType: string;
  eventType: string;
  source: string;
  eventDate: string;
  guestCount: string;
  embarkation: string;
  departure: string;
  returnTime: string;
  disembarkation: string;
  menuType: string;
  repeatClient: boolean;
  totalCost: string;
  selectedUpgrades: string[];
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const INIT: FormData = {
  vesselType: '',
  eventType: '',
  source: '',
  eventDate: todayIso(),
  guestCount: '',
  embarkation: '10:00',
  departure: '12:00',
  returnTime: '17:00',
  disembarkation: '18:00',
  menuType: '',
  repeatClient: false,
  totalCost: '',
  selectedUpgrades: [],
};

type GenerationStage = 'idle' | 'preparing' | 'sending' | 'generating' | 'done' | 'error';

const STAGE_META: Record<Exclude<GenerationStage, 'idle'>, { label: string; color: string }> = {
  preparing: { label: 'Preparing your event details', color: '#7c8a82' },
  sending: { label: 'Sending to Ravenmark', color: '#3b82f6' },
  generating: { label: 'Generating your PDF proposal', color: '#e8b93f' },
  done: { label: 'Proposal ready — redirecting…', color: '#2ecc71' },
  error: { label: 'Something went wrong', color: '#ef4444' },
};

function calcFinancials(data: FormData) {
  const base = parseFloat(data.totalCost) || 0;
  const upgradeTotal = UPGRADES.filter((u) => data.selectedUpgrades.includes(u.label)).reduce(
    (s, u) => s + u.price,
    0,
  );
  const margin = data.repeatClient ? 0.15 : 0.25;
  const subtotal = (base + upgradeTotal) * (1 + margin);
  const contingency = subtotal * 0.0225;
  const vat = (subtotal + contingency) * 0.2;
  const grand = subtotal + contingency + vat;
  return { subtotal, contingency, vat, grand, upgradeTotal };
}

/* DNB-style pill input: rounded, soft border, teal focus ring */
const inputCls =
  'w-full rounded-[10px] border border-[#e3e6e4] bg-white px-4 py-3.5 text-[13.5px] text-gray-800 placeholder-gray-400 outline-none focus:border-[#FF5A45] focus:ring-4 focus:ring-[#FF5A45]/12 transition-all appearance-none';
const sectionLabelCls = 'mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7c8a82]';
const fieldLabelCls = 'mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-700';

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
];

export function Forms() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INIT);
  const [previewField, setPreviewField] = useState<string | null>(null);
  const [previewOption, setPreviewOption] = useState<string | null>(null);
  const [stage, setStage] = useState<GenerationStage>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // The lead this quote is being built for, if any — handed off from the
  // Lead panel's "Build a Quote" button via sessionStorage.
  const [quoteLead] = useState<QuoteLead | null>(() => getQuoteLead());

  const set = (key: keyof FormData, val: unknown) =>
    setData((prev) => ({ ...prev, [key]: val }));

  const toggleUpgrade = (label: string) =>
    set(
      'selectedUpgrades',
      data.selectedUpgrades.includes(label)
        ? data.selectedUpgrades.filter((u) => u !== label)
        : [...data.selectedUpgrades, label],
    );

  const fin = calcFinancials(data);
  const handlePreview = (field: string, option: string | null) => {
    setPreviewField(option ? field : null);
    setPreviewOption(option);
  };
  const previewImg = getStoredPreview(previewField, previewOption);

  const handleGenerate = async () => {
    setErrorMessage('');
    setStage('preparing');

    const payload = {
      ...data,
      financials: {
        subtotal: fin.subtotal,
        contingency: fin.contingency,
        vat: fin.vat,
        grandTotal: fin.grand,
        upgradeTotal: fin.upgradeTotal,
      },
      // Tag the webhook payload with whichever lead this quote was built
      // for, so the automation can match it back to the CRM record.
      lead: quoteLead
        ? {
            id: quoteLead.id,
            name: quoteLead.name,
            email: quoteLead.email,
            phone: quoteLead.phone,
            designation: quoteLead.designation,
            company: quoteLead.company,
            referenceNumber: quoteLead.referenceNumber,
          }
        : null,
    };

    await new Promise((r) => setTimeout(r, 500));
    setStage('sending');

    try {
      const res = await fetch(QUOTE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
          // Assume a bare base64 string, or a fetchable URL.
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

      const saved = addProposal({
        id: `proposal-${Date.now()}`,
        createdAt: new Date().toISOString(),
        eventDate: data.eventDate,
        title: `${data.eventType || 'Event'} Proposal — ${data.vesselType || 'Vessel TBC'}`,
        vesselType: data.vesselType,
        eventType: data.eventType,
        guestCount: data.guestCount,
        grandTotal: fin.grand,
        pdfDataUrl,
      });

      if (!saved) {
        throw new Error(
          'The PDF was generated but is too large to store in this browser — clear some space (e.g. delete older proposals) and try again.',
        );
      }

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
                  <FormSelect
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
                <div>
                  <label className={fieldLabelCls}>
                    Date of Event
                    <span title="The calendar day this event takes place">
                      <HelpCircle className="h-3.5 w-3.5 text-[#7c8a82]" />
                    </span>
                  </label>
                  <input
                    type="date"
                    value={data.eventDate}
                    onChange={(e) => set('eventDate', e.target.value)}
                    className={inputCls}
                  />
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

                <FormSelect
                  label="Menu Type"
                  field="menuType"
                  options={MENU_TYPES}
                  value={data.menuType}
                  onChange={(v) => set('menuType', v)}
                  onPreview={handlePreview}
                />

                {data.menuType && (
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

                <p className={sectionLabelCls}>Cost Inputs</p>
                <div className="mb-7">
                  <label className={fieldLabelCls}>Base Cost (£)</label>
                  <input
                    type="number"
                    min={0}
                    value={data.totalCost}
                    onChange={(e) => set('totalCost', e.target.value)}
                    placeholder="Enter base event cost"
                    className={inputCls}
                  />
                </div>

                {(parseFloat(data.totalCost) > 0 || data.selectedUpgrades.length > 0) && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[10px] border border-[#e3e6e4]">
                    {[
                      ['Subtotal (incl. margin)', `£${fin.subtotal.toFixed(2)}`],
                      [`Contingency (2.25%)`, `£${fin.contingency.toFixed(2)}`],
                      [`VAT (20%)`, `£${fin.vat.toFixed(2)}`],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-3 text-[13px] text-gray-600">
                        <span>{label}</span>
                        <span className="font-semibold">{val}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-[#FF5A45] px-5 py-4 text-[14px] font-black text-white">
                      <span>Grand Total</span>
                      <span>£{fin.grand.toFixed(2)}</span>
                    </div>
                  </motion.div>
                )}
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
                  {UPGRADES.map(({ label, price }) => {
                    const selected = data.selectedUpgrades.includes(label);
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
                        </div>
                        <span className={`text-[13px] font-bold ${selected ? 'text-[#E22A12]' : 'text-gray-400'}`}>
                          £{price.toLocaleString()}
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
                    <span className="text-[14px] font-black text-[#E22A12]">
                      +£{UPGRADES.filter((u) => data.selectedUpgrades.includes(u.label))
                        .reduce((s, u) => s + u.price, 0)
                        .toLocaleString()}
                    </span>
                  </motion.div>
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
            {step < 6 ? (
              <button
                onClick={() => setStep((s) => Math.min(6, s + 1))}
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

      {/* ── Generation overlay: animated stage transitions while the proposal builds ── */}
      <AnimatePresence>
        {stage !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-[380px] rounded-[16px] bg-white p-8 shadow-2xl"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={stage}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center text-center"
                >
                  <div
                    className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${STAGE_META[stage as keyof typeof STAGE_META].color}18` }}
                  >
                    {stage === 'done' ? (
                      <FileCheck2 className="h-7 w-7" style={{ color: STAGE_META.done.color }} />
                    ) : stage === 'error' ? (
                      <AlertTriangle className="h-7 w-7" style={{ color: STAGE_META.error.color }} />
                    ) : (
                      <Loader2
                        className="h-7 w-7 animate-spin"
                        style={{ color: STAGE_META[stage as keyof typeof STAGE_META].color }}
                      />
                    )}
                  </div>
                  <p className="text-[15px] font-bold text-gray-800">
                    {stage === 'error' ? errorMessage || STAGE_META.error.label : STAGE_META[stage as keyof typeof STAGE_META].label}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Stage progress dots */}
              {stage !== 'error' && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  {(['preparing', 'sending', 'generating', 'done'] as const).map((s) => {
                    const order = ['preparing', 'sending', 'generating', 'done'];
                    const reached = order.indexOf(stage) >= order.indexOf(s);
                    return (
                      <span
                        key={s}
                        className="h-1.5 w-8 rounded-full transition-colors"
                        style={{ backgroundColor: reached ? STAGE_META[s].color : '#e5e7eb' }}
                      />
                    );
                  })}
                </div>
              )}

              {stage === 'error' && (
                <div className="mt-6 flex items-center justify-center gap-3">
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Forms;
