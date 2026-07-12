import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowRight, ArrowLeft, Check } from 'lucide-react';

const VESSEL_TYPES = [
  'WEOTT I (Rose)',
  'WEOTT II (Avontuur)',
  'WEOTT III (Golden Sal)',
  'WEOTT IV (Vaulla)',
  'WEOTT V (Dixie)',
  'WEOTT VI (Elizabethan)',
  'WEOTT VII (Edwardian)',
  'WEOTT Limo III (Bourne)',
];

const EVENT_TYPES = [
  'Summer Event',
  'Christmas Event',
  'Company Anniversary',
  'Networking Event',
  'Meeting',
  'Conference',
  'Social Gathering',
  'Team Building',
  'Corporate Other',
  'Transfer',
  'Award Ceremony',
  'Wedding Reception',
  'Wedding Anniversary',
  'Wedding Transfer',
  'Other',
  'Unknown - TBC',
  'Client Event',
  'Product Launch',
  'Pre-Wedding Celebration',
  'Client & Prospects Networking Cruise',
];

const MENU_TYPES = ['Summer Barbecue', 'Street Food', 'Canapés', '2-Course Seated Dinner'];

const UPGRADES = [
  { label: 'Live DJ', price: 500 },
  { label: 'Saxophonist', price: 550 },
  { label: 'Photo Booth', price: 650 },
  { label: 'Close-up Magician', price: 700 },
  { label: 'Branded Vessel Flag', price: 150 },
];

/* ─── Read hover preview photo from localStorage (set in /settings) ─── */
function getStoredPreview(field: string | null): string | null {
  if (!field) return null;
  try {
    const stored = localStorage.getItem('nexus_field_photos');
    if (!stored) return null;
    return JSON.parse(stored)[field] ?? null;
  } catch {
    return null;
  }
}

type FormData = {
  vesselType: string;
  eventType: string;
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

const INIT: FormData = {
  vesselType: '',
  eventType: '',
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

const inputCls =
  'w-full border border-[#e0e0e0] bg-white px-4 py-3 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:border-[#2ecc71] focus:ring-0 transition-colors appearance-none';
const labelCls = 'mb-1.5 block text-[10.5px] font-bold uppercase tracking-widest text-gray-400';

/* ─── Custom Select ─── */
function FormSelect({
  label,
  field,
  options,
  value,
  onChange,
  onHoverField,
}: {
  label: string;
  field: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onHoverField: (f: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => onHoverField(field)}
      onMouseLeave={() => { onHoverField(null); setOpen(false); }}
    >
      <label className={labelCls}>{label}</label>
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
            className="absolute left-0 right-0 top-full z-20 border border-[#e0e0e0] bg-white shadow-lg max-h-[260px] overflow-y-auto"
          >
            {options.map((opt) => (
              <motion.li
                key={opt}
                whileHover={{ backgroundColor: '#f0fdf5' }}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13px] text-gray-700 transition-colors"
              >
                {opt}
                {value === opt && <Check className="h-3.5 w-3.5 text-[#2ecc71]" />}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Steps ─── */
const STEP_LABELS = ['Event Core', 'Itinerary', 'Catering', 'Financials', 'Upgrades'];

export function Forms() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(INIT);
  const [hoverField, setHoverField] = useState<string | null>(null);

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
  const previewImg = getStoredPreview(hoverField);

  const pageVariants = {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -30 },
  };

  return (
    <div className="flex bg-white" style={{ minHeight: 'calc(100vh - 4rem)' }}>

      {/* ── Left: vertical step sidebar ── */}
      <aside className="sticky top-16 h-[calc(100vh-4rem)] w-[190px] shrink-0 border-r border-[#e8e8e8] flex flex-col bg-white overflow-y-auto">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <button
              key={label}
              onClick={() => setStep(n)}
              className={`flex items-center gap-3 px-5 py-4 text-left text-[11px] font-bold uppercase tracking-widest transition-colors border-b border-[#f0f0f0] last:border-0 ${
                active
                  ? 'bg-[#2ecc71] text-white'
                  : done
                  ? 'bg-[#f0fdf5] text-[#219251]'
                  : 'bg-white text-gray-400 hover:bg-gray-50'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-black ${
                  active ? 'bg-white text-[#2ecc71]' : done ? 'bg-[#2ecc71] text-white' : 'border border-current'
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : n}
              </span>
              {label}
            </button>
          );
        })}
      </aside>

      {/* ── Right: form content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[620px] px-10 py-12">
          <AnimatePresence mode="wait" initial={false}>

            {/* STEP 1 */}
            {step === 1 && (
              <motion.div key="step1" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <h2 className="mb-1 text-[22px] font-black tracking-tight text-gray-900">Event Core</h2>
                <p className="mb-8 text-[13px] text-gray-400">Select the vessel and event type for this proposal.</p>
                <div className="grid grid-cols-2 gap-6">
                  <FormSelect
                    label="Vessel Type"
                    field="vesselType"
                    options={VESSEL_TYPES}
                    value={data.vesselType}
                    onChange={(v) => set('vesselType', v)}
                    onHoverField={setHoverField}
                  />
                  <FormSelect
                    label="Event Type"
                    field="eventType"
                    options={EVENT_TYPES}
                    value={data.eventType}
                    onChange={(v) => set('eventType', v)}
                    onHoverField={setHoverField}
                  />
                </div>
              </motion.div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <motion.div key="step2" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <h2 className="mb-1 text-[22px] font-black tracking-tight text-gray-900">Itinerary</h2>
                <p className="mb-8 text-[13px] text-gray-400">Set guest count and schedule timings.</p>

                <div className="mb-6">
                  <label className={labelCls}>Guest Count</label>
                  <input
                    type="number"
                    min={1}
                    value={data.guestCount}
                    onChange={(e) => set('guestCount', e.target.value)}
                    placeholder="e.g. 120"
                    className={inputCls}
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {(
                    [
                      ['Embarkation', 'embarkation'],
                      ['Departure', 'departure'],
                      ['Return', 'returnTime'],
                      ['Disembarkation', 'disembarkation'],
                    ] as [string, keyof FormData][]
                  ).map(([label, key]) => (
                    <div key={key}>
                      <label className={labelCls}>{label}</label>
                      <input
                        type="time"
                        value={data[key] as string}
                        onChange={(e) => set(key, e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <motion.div key="step3" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.25 }}>
                <h2 className="mb-1 text-[22px] font-black tracking-tight text-gray-900">Catering</h2>
                <p className="mb-8 text-[13px] text-gray-400">Choose a menu type for this event.</p>

                <FormSelect
                  label="Menu Type"
                  field="menuType"
                  options={MENU_TYPES}
                  value={data.menuType}
                  onChange={(v) => set('menuType', v)}
                  onHoverField={setHoverField}
                />

                {data.menuType && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 grid grid-cols-2 gap-4"
                  >
                    <div className="border border-[#e0e0e0] bg-[#f0fdf5] p-5">
                      <p className={labelCls}>Catering Assistants</p>
                      <p className="text-[28px] font-black text-[#219251]">
                        {Math.ceil((parseInt(data.guestCount) || 50) / 20)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">1 per 20 guests</p>
                    </div>
                    <div className="border border-[#e0e0e0] bg-[#f0fdf5] p-5">
                      <p className={labelCls}>Event Staff</p>
                      <p className="text-[28px] font-black text-[#219251]">
                        {Math.ceil((parseInt(data.guestCount) || 50) / 25)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-400">1 per 25 guests</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <motion.div
                key="step4"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                onMouseEnter={() => setHoverField('financials')}
                onMouseLeave={() => setHoverField(null)}
              >
                <h2 className="mb-1 text-[22px] font-black tracking-tight text-gray-900">Financials</h2>
                <p className="mb-8 text-[13px] text-gray-400">Set cost inputs and view the full breakdown.</p>

                <div className="mb-6 flex items-center justify-between border border-[#e0e0e0] p-4">
                  <div>
                    <p className={labelCls}>Repeat Client</p>
                    <p className="text-[12px] text-gray-500">Reduces margin from 25% to 15%</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set('repeatClient', !data.repeatClient)}
                    className={`relative h-7 w-14 transition-colors ${data.repeatClient ? 'bg-[#2ecc71]' : 'bg-gray-200'}`}
                  >
                    <motion.div
                      animate={{ x: data.repeatClient ? 28 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      className="absolute top-1 h-5 w-5 bg-white shadow-sm"
                    />
                  </button>
                </div>

                <div className="mb-6">
                  <label className={labelCls}>Base Cost (£)</label>
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
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border border-[#e0e0e0]">
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
                    <div className="flex items-center justify-between bg-[#2ecc71] px-5 py-4 text-[14px] font-black text-white">
                      <span>Grand Total</span>
                      <span>£{fin.grand.toFixed(2)}</span>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* STEP 5 */}
            {step === 5 && (
              <motion.div
                key="step5"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                onMouseEnter={() => setHoverField('upgrades')}
                onMouseLeave={() => setHoverField(null)}
              >
                <h2 className="mb-1 text-[22px] font-black tracking-tight text-gray-900">Upgrades</h2>
                <p className="mb-8 text-[13px] text-gray-400">Select optional add-ons for this event.</p>

                <div className="flex flex-col gap-3">
                  {UPGRADES.map(({ label, price }) => {
                    const selected = data.selectedUpgrades.includes(label);
                    return (
                      <motion.button
                        key={label}
                        type="button"
                        whileHover={{ x: 4 }}
                        onClick={() => toggleUpgrade(label)}
                        className={`flex items-center justify-between border px-5 py-4 text-left transition-colors ${
                          selected
                            ? 'border-[#2ecc71] bg-[#f0fdf5]'
                            : 'border-[#e0e0e0] bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-5 w-5 items-center justify-center transition-colors ${
                              selected ? 'bg-[#2ecc71]' : 'border border-[#d0d0d0]'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-[13px] font-semibold text-gray-800">{label}</span>
                        </div>
                        <span className={`text-[13px] font-bold ${selected ? 'text-[#219251]' : 'text-gray-400'}`}>
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
                    className="mt-6 flex items-center justify-between border border-[#2ecc71] bg-[#f0fdf5] px-5 py-4"
                  >
                    <span className="text-[12px] font-semibold text-[#219251]">
                      {data.selectedUpgrades.length} upgrade{data.selectedUpgrades.length > 1 ? 's' : ''} selected
                    </span>
                    <span className="text-[14px] font-black text-[#219251]">
                      +£{UPGRADES.filter((u) => data.selectedUpgrades.includes(u.label))
                        .reduce((s, u) => s + u.price, 0)
                        .toLocaleString()}
                    </span>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Navigation ── */}
          <div className="mt-10 flex items-center justify-between border-t border-[#f0f0f0] pt-6">
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              className="flex items-center gap-2 px-5 py-3 text-[12px] font-bold uppercase tracking-widest text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-30"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            {step < 5 ? (
              <button
                onClick={() => setStep((s) => Math.min(5, s + 1))}
                className="flex items-center gap-2 bg-[#2ecc71] px-8 py-3 text-[12px] font-bold uppercase tracking-widest text-white hover:bg-[#27af61] transition-colors"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button className="flex items-center gap-2 bg-[#1a1a1a] px-8 py-3 text-[12px] font-bold uppercase tracking-widest text-white hover:bg-[#2ecc71] transition-colors">
                Generate Proposal
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </main>

      {/* ── Right-edge hover image preview (from settings) ── */}
      <AnimatePresence>
        {previewImg && hoverField && (
          <motion.div
            key={hoverField}
            initial={{ x: 200, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 200, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            className="pointer-events-none fixed right-0 top-1/2 z-40 h-[220px] w-[220px] -translate-y-1/2 overflow-hidden shadow-2xl"
          >
            <img src={previewImg} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                {hoverField === 'vesselType' ? 'Vessel Selection' :
                 hoverField === 'eventType' ? 'Event Type' :
                 hoverField === 'menuType' ? 'Catering' :
                 hoverField === 'financials' ? 'Financial Summary' : 'Upgrades'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Forms;
