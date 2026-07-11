import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, ArrowLeft, ArrowRight, Upload } from 'lucide-react';

/* ─────────── constants ─────────── */

const STEPS = [
  { id: 1, lines: ['Tell us about your', 'Business'] },
  { id: 2, lines: ['Tell us about your', 'Business Operations'] },
  { id: 3, lines: ['Configure your', 'Account Here'] },
  { id: 4, lines: ['Add Relevant Data'] },
  { id: 5, lines: ['Map Categories'] },
];

const STEP_TABS: Record<number, string[]> = {
  1: ['General', 'Address', 'Contact', 'Display', 'Others', 'Tax Info'],
  2: ['Module', 'Set Up', 'Auto-Logout', 'Commission', 'Settings'],
  3: ['Overview', 'Permissions'],
  4: ['Import', 'Export'],
  5: ['Categories'],
};

/* ─────────── tiny shared atoms ─────────── */

function HelpBadge() {
  return (
    <div className="h-[18px] w-[18px] rounded-full border border-gray-300 flex items-center justify-center text-gray-400 text-[10px] shrink-0 cursor-default select-none">
      ?
    </div>
  );
}

function SkipLabel() {
  return (
    <span className="text-[11px] text-[#3b3be8] font-semibold tracking-widest cursor-pointer select-none">
      SKIP
    </span>
  );
}

/* ─────────── reusable field rows ─────────── */

function SelectRow({ label }: { label: string }) {
  return (
    <div className="flex items-center py-[10px] border-b border-gray-50 last:border-0">
      <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0">{label}</span>
      <div className="flex items-center justify-between border border-[#dcdcec] rounded-[3px] px-3 py-[7px] w-[210px] cursor-pointer hover:border-[#3b3be8] transition-colors">
        <span className="text-[12px] text-gray-300" />
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </div>
    </div>
  );
}

function InputRow({
  label,
  skip = false,
  wide = false,
}: {
  label: string;
  skip?: boolean;
  wide?: boolean;
}) {
  return (
    <div className="flex items-center py-[10px] border-b border-gray-50 last:border-0">
      <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0">{label}</span>
      <div className="flex items-center gap-3">
        <input
          className={`border border-[#dcdcec] rounded-[3px] px-3 py-[7px] text-[13px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 transition-colors ${wide ? 'w-[240px]' : 'w-[210px]'}`}
        />
        {skip && <SkipLabel />}
      </div>
    </div>
  );
}

/* ─────────── step-1 tab panels ─────────── */

function GeneralTab() {
  return (
    <div className="pt-1">
      <SelectRow label="Country" />
      <SelectRow label="Time Zone" />
      <SelectRow label="State or Province" />
      <SelectRow label="Currency" />
      <SelectRow label="City" />
    </div>
  );
}

function AddressTab() {
  return (
    <div className="pt-1">
      <InputRow label="Business Name" />
      <InputRow label="Website" skip />
      <InputRow label="Phone" />
      <InputRow label="Fax" skip />
      <InputRow label="Postal Code" />
    </div>
  );
}

function ContactTab() {
  return (
    <div className="pt-1">
      <div className="flex items-start py-3 border-b border-gray-50">
        <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0 pt-[3px]">
          Business Address
        </span>
        <textarea
          className="border border-[#dcdcec] rounded-[3px] px-3 py-2 text-[13px] w-[240px] h-[96px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 resize-none transition-colors"
        />
      </div>
      <div className="flex items-center py-3">
        <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0 leading-tight">
          Is Your Shipping Address<br />Same?
        </span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
            <input type="radio" name="shipping_same" className="accent-[#3b3be8]" />
            Yes
          </label>
          <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
            <input type="radio" name="shipping_same" className="accent-[#3b3be8]" />
            No
          </label>
          <SkipLabel />
        </div>
      </div>
    </div>
  );
}

function DisplayTab() {
  const rows = [
    { text: 'Do you want your Logo to appear on Screen?', skip: true },
    { text: 'Do you want your Invoice to appear on Screen', skip: false },
    { text: 'Do you want to hide Store Name on Invoice Documents?', skip: false },
  ];
  return (
    <div className="pt-1">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center py-3 border-b border-gray-50">
          <div className="flex items-center gap-2 flex-1 pr-6 justify-end">
            <span className="text-[13px] text-gray-700 text-right">{row.text}</span>
            <HelpBadge />
          </div>
          <div className="flex items-center gap-4 shrink-0 w-[140px]">
            <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
              <input type="radio" name={`display_${i}`} className="accent-[#3b3be8]" />
              Yes
            </label>
            <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
              <input type="radio" name={`display_${i}`} className="accent-[#3b3be8]" />
              No
            </label>
            {row.skip && <SkipLabel />}
          </div>
        </div>
      ))}
      <div className="flex items-center py-3">
        <div className="flex items-center gap-2 flex-1 pr-6 justify-end">
          <span className="text-[13px] text-gray-700 text-right">
            Upload Image for Store Location Here
          </span>
          <HelpBadge />
        </div>
        <div className="flex items-center gap-3 shrink-0 w-[140px]">
          <button className="flex items-center gap-1.5 bg-[#3b3be8] hover:bg-[#2e2ed8] text-white text-[12px] font-medium px-3 py-1.5 rounded-[3px] transition-colors">
            <Upload className="h-3 w-3" />
            Upload
          </button>
          <SkipLabel />
        </div>
      </div>
    </div>
  );
}

function OthersTab() {
  const fields = [
    'SMTP Info',
    'PO Prefix',
    'Tax Permit ID',
    'Barcode Prefix',
    'Scale for Tax',
  ];
  return (
    <div className="pt-1">
      {fields.map((label) => (
        <div key={label} className="flex items-center py-[10px] border-b border-gray-50 last:border-0">
          <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0">{label}</span>
          <div className="flex items-center gap-2">
            <input className="border border-[#dcdcec] rounded-[3px] px-3 py-[7px] text-[13px] w-[190px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 transition-colors" />
            <HelpBadge />
          </div>
        </div>
      ))}
    </div>
  );
}

function TaxInfoTab() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const opts = ['All', 'Products', 'Rental', 'Travels', 'Course', 'Services'];

  return (
    <div className="pt-1 overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-[#3b3be8] text-white">
            {['Country', 'Tax Title', 'Tax %'].map((h) => (
              <th key={h} className="text-left px-3 py-[9px] font-medium">{h}</th>
            ))}
            <th className="text-left px-3 py-[9px] font-medium relative">
              <button
                className="flex items-center gap-1 cursor-pointer whitespace-nowrap"
                onClick={() => setOpen((o) => !o)}
              >
                Tax by Inventory Type <ChevronDown className="h-3 w-3" />
              </button>
              {open && (
                <div className="absolute top-full left-0 z-30 bg-white shadow-xl border border-gray-100 rounded-[4px] min-w-[160px] p-2 mt-0.5">
                  {opts.map((opt) => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 py-1.5 px-2 text-gray-700 cursor-pointer hover:bg-gray-50 rounded-[2px]"
                    >
                      <input
                        type="checkbox"
                        checked={!!checked[opt]}
                        onChange={(e) => setChecked((c) => ({ ...c, [opt]: e.target.checked }))}
                        className="accent-[#3b3be8]"
                      />
                      {opt}
                    </label>
                  ))}
                  <button
                    onClick={() => setOpen(false)}
                    className="mt-1.5 w-full bg-[#3b3be8] hover:bg-[#2e2ed8] text-white text-[11px] py-1.5 rounded-[3px] font-medium transition-colors"
                  >
                    Appl
                  </button>
                </div>
              )}
            </th>
            <th className="text-left px-3 py-[9px] font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3].map((i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0f0f8]'}>
              {[0, 1, 2, 3, 4].map((j) => (
                <td key={j} className="px-3 py-3 border-b border-gray-50">&nbsp;</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────── step-2 tab panels ─────────── */

function ModuleTab() {
  const modules = ['Travel', 'Charter', 'Courses', 'Rental', 'Repairs'];
  return (
    <div className="py-4">
      <p className="text-[14px] font-semibold text-gray-800 text-center mb-6 px-4">
        What Modules would you Like to Be Activated on your Account?
      </p>
      <div className="flex flex-col gap-3 pl-[80px]">
        {modules.map((mod) => (
          <div key={mod} className="flex items-center gap-5">
            <HelpBadge />
            <span className="w-[72px] text-[13px] text-gray-700">{mod}</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
                <input type="radio" name={`mod_${mod}`} className="accent-[#3b3be8]" />
                Yes
              </label>
              <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
                <input type="radio" name={`mod_${mod}`} className="accent-[#3b3be8]" />
                No
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full py-16 text-[13px] text-gray-300">
      {name} — coming soon
    </div>
  );
}

/* ─────────── main page ─────────── */

/* ─────────── animation variants ─────────── */
const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 36 : -36,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -36 : 36,
    opacity: 0,
    transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const circleVariants = {
  initial: { scale: 0.6, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 420, damping: 24 } },
  exit: { scale: 0.6, opacity: 0, transition: { duration: 0.12 } },
};

export function SetupWizard() {
  const [activeStep, setActiveStep] = useState(1);
  const [activeTab, setActiveTab] = useState(0);
  const [direction, setDirection] = useState(1);

  const tabs = STEP_TABS[activeStep] ?? ['General'];

  const handleNext = () => {
    setDirection(1);
    if (activeTab < tabs.length - 1) {
      setActiveTab(activeTab + 1);
    } else if (activeStep < 5) {
      setActiveStep((s) => s + 1);
      setActiveTab(0);
    }
  };

  const handlePrev = () => {
    setDirection(-1);
    if (activeTab > 0) {
      setActiveTab(activeTab - 1);
    } else if (activeStep > 1) {
      const prevStep = activeStep - 1;
      setActiveStep(prevStep);
      setActiveTab((STEP_TABS[prevStep]?.length ?? 1) - 1);
    }
  };

  const stepStatus = (id: number) =>
    id < activeStep ? 'done' : id === activeStep ? 'active' : 'pending';

  /* progress: step contributes 20%, each tab contributes 20/tabCount */
  const tabCount = tabs.length;
  const pct = Math.round(
    (((activeStep - 1) * 20) + (activeTab / tabCount) * 20)
  );
  const leftPct = 100 - pct;

  const renderContent = () => {
    const tab = tabs[activeTab];
    if (activeStep === 1) {
      if (tab === 'General') return <GeneralTab />;
      if (tab === 'Address') return <AddressTab />;
      if (tab === 'Contact') return <ContactTab />;
      if (tab === 'Display') return <DisplayTab />;
      if (tab === 'Others') return <OthersTab />;
      if (tab === 'Tax Info') return <TaxInfoTab />;
    }
    if (activeStep === 2) {
      if (tab === 'Module') return <ModuleTab />;
      return <PlaceholderTab name={tab} />;
    }
    return <PlaceholderTab name={tab} />;
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-hidden bg-[#ecebf7] px-10 py-10">

      {/* ── decorative blobs ── */}
      <div
        className="absolute top-0 right-0 w-[240px] h-[240px] bg-[#3535e2] pointer-events-none"
        style={{ borderBottomLeftRadius: '100%' }}
      />
      <div
        className="absolute bottom-0 right-0 w-[110px] h-[170px] bg-[#3535e2] pointer-events-none"
        style={{ borderTopLeftRadius: '60px' }}
      />

      {/* ── DiveShop360 vertical label ── */}
      <div
        className="absolute text-[#3535e2] text-[11px] font-semibold tracking-[0.25em] opacity-80 pointer-events-none z-10"
        style={{
          right: '38px',
          top: '50%',
          transform: 'translateY(-50%) rotate(90deg)',
          transformOrigin: 'center center',
          whiteSpace: 'nowrap',
        }}
      >
        DiveShop360
      </div>

      {/* ── main card ── */}
      <motion.div
        className="relative flex w-full max-w-[840px] min-h-[470px] rounded-[18px] shadow-2xl z-10"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      >

        {/* ── left sidebar ── */}
        <div className="w-[230px] shrink-0 bg-[#2626cc] flex flex-col py-9 rounded-l-[18px]">
          <div className="flex-1 flex flex-col gap-7">
            {STEPS.map((step) => {
              const status = stepStatus(step.id);
              return (
                <div
                  key={step.id}
                  className="flex items-start cursor-pointer pl-7 pr-10"
                  onClick={() => {
                    if (status !== 'pending') {
                      setActiveStep(step.id);
                      setActiveTab(0);
                    }
                  }}
                >
                  <div className="flex flex-col">
                    {step.lines.map((line, li) => (
                      <p
                        key={li}
                        className={`text-[13px] leading-[1.45] font-medium transition-colors ${
                          status === 'active'
                            ? 'text-white'
                            : status === 'done'
                            ? 'text-white/70'
                            : 'text-white/40'
                        }`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* dots grid */}
          <div className="pl-7 mt-6">
            <div className="grid grid-cols-4 gap-[5px] opacity-25">
              {Array.from({ length: 20 }).map((_, i) => (
                <span key={i} className="h-[3px] w-[3px] rounded-full bg-white" />
              ))}
            </div>
          </div>
        </div>

        {/* ── step circles — absolutely positioned over the sidebar/content seam ── */}
        {(() => {
          // Match the sidebar's py-9 (36px) + gap-7 (28px) rhythm.
          // Each step row is roughly ~40px tall (two lines ≈ 38px with gap).
          // We use a flex column with the same gap to align circles to step rows.
          return (
            <div
              className="absolute top-0 flex flex-col py-9 gap-7 pointer-events-none"
              style={{ left: '214px', zIndex: 30 }}
            >
              {STEPS.map((step) => {
                const status = stepStatus(step.id);
                return (
                  <div
                    key={step.id}
                    className="pointer-events-auto cursor-pointer h-[38px] flex items-start pt-0.5"
                    onClick={() => {
                      if (status !== 'pending') {
                        setActiveStep(step.id);
                        setActiveTab(0);
                      }
                    }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {status === 'done' ? (
                        <motion.div
                          key="done"
                          variants={circleVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="h-8 w-8 rounded-full bg-[#3ecf8e] flex items-center justify-center shadow-md"
                        >
                          <Check className="h-4 w-4 text-white" strokeWidth={3} />
                        </motion.div>
                      ) : status === 'active' ? (
                        <motion.div
                          key="active"
                          variants={circleVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="h-8 w-8 rounded-full bg-white flex items-center justify-center"
                          style={{ boxShadow: '0 0 0 2.5px #2626cc, 0 0 0 5px #40d8b8, 0 2px 8px rgba(0,0,0,0.15)' }}
                        >
                          <span className="text-[13px] font-bold text-[#2626cc]">{step.id}</span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="pending"
                          variants={circleVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center"
                        >
                          <span className="text-[13px] font-medium text-white/60">{step.id}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── right content ── */}
        <div className="flex-1 bg-white flex flex-col min-w-0 rounded-r-[18px]">

          {/* tab bar — layoutId underline slides between tabs */}
          <div className="flex items-end px-7 pt-5 border-b border-gray-100 gap-0">
            <div className="flex flex-1 gap-0">
              {tabs.map((tab, i) => (
                <button
                  key={tab}
                  onClick={() => { setDirection(i > activeTab ? 1 : -1); setActiveTab(i); }}
                  className={`relative px-[14px] pb-2.5 pt-0.5 text-[13px] font-medium transition-colors duration-150 whitespace-nowrap ${
                    activeTab === i ? 'text-[#3b3be8]' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab}
                  {activeTab === i && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#3b3be8] rounded-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                    />
                  )}
                </button>
              ))}
            </div>
            <span className="text-[10.5px] text-gray-400 pb-2 shrink-0 ml-2">
              Approx Time: 2 Mins
            </span>
          </div>

          {/* form content — slides in/out based on navigation direction */}
          <div className="flex-1 overflow-hidden relative">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`${activeStep}-${activeTab}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0 overflow-auto px-7 py-3"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* progress + nav */}
          <div className="flex items-center px-7 py-4 gap-5 border-t border-gray-50">
            {/* progress bar */}
            <div className="flex flex-1 items-center gap-2.5 min-w-0">
              <div className="flex-1 bg-gray-100 rounded-full h-[3px] overflow-hidden">
                <motion.div
                  className="h-full bg-[#3b3be8] rounded-full"
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </div>
              <AnimatePresence mode="wait">
                <motion.span
                  key={leftPct}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                  className="text-[11px] text-gray-400 shrink-0"
                >
                  {leftPct}% Left
                </motion.span>
              </AnimatePresence>
            </div>

            {/* nav buttons */}
            <div className="flex items-center gap-2.5 shrink-0">
              <motion.button
                onClick={handlePrev}
                disabled={activeStep === 1 && activeTab === 0}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                className="flex items-center gap-1.5 px-4 py-[7px] text-[11px] font-semibold text-gray-500 border border-gray-300 rounded-[3px] hover:border-gray-400 disabled:opacity-30 transition-colors tracking-widest"
              >
                <ArrowLeft className="h-3 w-3" />
                PREVIOUS
              </motion.button>
              <motion.button
                onClick={handleNext}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="flex items-center gap-1.5 px-5 py-[7px] text-[11px] font-semibold text-white bg-[#3b3be8] hover:bg-[#2e2ed8] rounded-[3px] transition-colors tracking-widest"
              >
                NEXT
                <ArrowRight className="h-3 w-3" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default SetupWizard;
