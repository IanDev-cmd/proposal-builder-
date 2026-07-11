import { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Check, ChevronDown, ArrowLeft, ArrowRight, Upload, Plus, X, FileText } from 'lucide-react';

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

function SkipLabel({ onClick }: { onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className="text-[11px] text-[#3b3be8] font-semibold tracking-widest cursor-pointer select-none hover:text-[#2e2ed8]"
    >
      SKIP
    </span>
  );
}

/* ─────────── reusable field rows ─────────── */

function Dropdown({ label, options }: { label: string; options: string[] }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  return (
    <div className="flex items-center py-[10px] border-b border-gray-50 last:border-0">
      <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0">{label}</span>
      <div className="relative w-[210px]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="flex items-center justify-between border border-[#dcdcec] rounded-[3px] px-3 py-[7px] w-full cursor-pointer hover:border-[#3b3be8] transition-colors bg-white"
        >
          <span className={`text-[12px] truncate ${value ? 'text-gray-700' : 'text-gray-300'}`}>
            {value || 'Select…'}
          </span>
          <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 z-30 bg-white shadow-xl border border-gray-100 rounded-[4px] mt-1 max-h-[180px] overflow-auto">
            {options.map((opt) => (
              <button
                type="button"
                key={opt}
                onMouseDown={() => {
                  setValue(opt);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-[7px] text-[12px] hover:bg-[#f0f0f8] transition-colors ${
                  value === opt ? 'text-[#3b3be8] font-medium bg-[#f0f0f8]' : 'text-gray-700'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InputRow({
  label,
  skip = false,
  wide = false,
  placeholder,
}: {
  label: string;
  skip?: boolean;
  wide?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const [skipped, setSkipped] = useState(false);
  return (
    <div className="flex items-center py-[10px] border-b border-gray-50 last:border-0">
      <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0">{label}</span>
      <div className="flex items-center gap-3">
        <input
          value={skipped ? '' : value}
          disabled={skipped}
          onChange={(e) => setValue(e.target.value)}
          placeholder={skipped ? 'Skipped' : placeholder}
          className={`border border-[#dcdcec] rounded-[3px] px-3 py-[7px] text-[13px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 transition-colors disabled:bg-gray-50 disabled:text-gray-300 ${
            wide ? 'w-[240px]' : 'w-[210px]'
          }`}
        />
        {skip && (
          <span
            onClick={() => setSkipped((s) => !s)}
            className={`text-[11px] font-semibold tracking-widest cursor-pointer select-none ${
              skipped ? 'text-gray-400' : 'text-[#3b3be8] hover:text-[#2e2ed8]'
            }`}
          >
            {skipped ? 'UNDO' : 'SKIP'}
          </span>
        )}
      </div>
    </div>
  );
}

function YesNoRow({
  text,
  help = false,
  skip = false,
  action,
}: {
  text: string;
  help?: boolean;
  skip?: boolean;
  action?: { label: string; onDone?: () => void };
}) {
  const [value, setValue] = useState<'yes' | 'no' | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const name = text.replace(/\s+/g, '_');

  return (
    <div className="flex items-center py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2 flex-1 pr-6 justify-end">
        <span className="text-[13px] text-gray-700 text-right">{text}</span>
        {help && <HelpBadge />}
      </div>
      <div className="flex items-center gap-4 shrink-0 w-[160px]">
        {action ? (
          <button
            type="button"
            onClick={() => {
              setUploaded(true);
              action.onDone?.();
            }}
            className={`flex items-center gap-1.5 text-white text-[12px] font-medium px-3 py-1.5 rounded-[3px] transition-colors ${
              uploaded ? 'bg-[#3ecf8e] hover:bg-[#33b87c]' : 'bg-[#3b3be8] hover:bg-[#2e2ed8]'
            }`}
          >
            {uploaded ? <Check className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
            {uploaded ? 'Uploaded' : action.label}
          </button>
        ) : (
          <>
            <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
              <input
                type="radio"
                name={name}
                checked={value === 'yes'}
                onChange={() => setValue('yes')}
                className="accent-[#3b3be8]"
              />
              Yes
            </label>
            <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
              <input
                type="radio"
                name={name}
                checked={value === 'no'}
                onChange={() => setValue('no')}
                className="accent-[#3b3be8]"
              />
              No
            </label>
          </>
        )}
        {skip && <SkipLabel onClick={() => setSkipped((s) => !s)} />}
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  help = false,
  defaultChecked = false,
  onChange,
}: {
  label: string;
  help?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-gray-700">{label}</span>
        {help && <HelpBadge />}
      </div>
      <button
        type="button"
        onClick={() => {
          const next = !checked;
          setChecked(next);
          onChange?.(next);
        }}
        className={`relative h-[22px] w-[40px] rounded-full transition-colors shrink-0 ${
          checked ? 'bg-[#3b3be8]' : 'bg-gray-200'
        }`}
      >
        <motion.span
          className="absolute top-[3px] h-[16px] w-[16px] rounded-full bg-white shadow"
          animate={{ left: checked ? 21 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </button>
    </div>
  );
}

/* ─────────── step-1 tab panels ─────────── */

function GeneralTab() {
  return (
    <div className="pt-1">
      <Dropdown label="Country" options={['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'India']} />
      <Dropdown
        label="Time Zone"
        options={[
          '(GMT-08:00) Pacific Time',
          '(GMT-05:00) Eastern Time',
          '(GMT+00:00) UTC',
          '(GMT+01:00) Central European Time',
          '(GMT+05:30) India Standard Time',
        ]}
      />
      <Dropdown label="State or Province" options={['California', 'Texas', 'New York', 'Florida', 'Ontario', 'Quebec']} />
      <Dropdown
        label="Currency"
        options={['USD - US Dollar', 'EUR - Euro', 'GBP - British Pound', 'CAD - Canadian Dollar', 'INR - Indian Rupee']}
      />
      <Dropdown label="City" options={['Los Angeles', 'San Diego', 'Miami', 'New York', 'Toronto']} />
    </div>
  );
}

function AddressTab() {
  return (
    <div className="pt-1">
      <InputRow label="Business Name" placeholder="DiveShop360" />
      <InputRow label="Website" skip placeholder="www.example.com" />
      <InputRow label="Phone" placeholder="(555) 555-0100" />
      <InputRow label="Fax" skip placeholder="(555) 555-0101" />
      <InputRow label="Postal Code" placeholder="90210" />
    </div>
  );
}

function ContactTab() {
  const [address, setAddress] = useState('');
  const [same, setSame] = useState<'yes' | 'no' | null>(null);
  const [skipped, setSkipped] = useState(false);
  return (
    <div className="pt-1">
      <div className="flex items-start py-3 border-b border-gray-50">
        <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0 pt-[3px]">
          Business Address
        </span>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Ocean Ave, Suite 4"
          className="border border-[#dcdcec] rounded-[3px] px-3 py-2 text-[13px] w-[240px] h-[96px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 resize-none transition-colors"
        />
      </div>
      <div className="flex items-center py-3">
        <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0 leading-tight">
          Is Your Shipping Address<br />Same?
        </span>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
            <input
              type="radio"
              name="shipping_same"
              checked={same === 'yes'}
              onChange={() => setSame('yes')}
              disabled={skipped}
              className="accent-[#3b3be8]"
            />
            Yes
          </label>
          <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
            <input
              type="radio"
              name="shipping_same"
              checked={same === 'no'}
              onChange={() => setSame('no')}
              disabled={skipped}
              className="accent-[#3b3be8]"
            />
            No
          </label>
          <SkipLabel onClick={() => setSkipped((s) => !s)} />
        </div>
      </div>
    </div>
  );
}

function DisplayTab() {
  const [uploaded, setUploaded] = useState(false);
  return (
    <div className="pt-1">
      <YesNoRow text="Do you want your Logo to appear on Screen?" help skip />
      <YesNoRow text="Do you want your Invoice to appear on Screen" help />
      <YesNoRow text="Do you want to hide Store Name on Invoice Documents?" help />
      <div className="flex items-center py-3">
        <div className="flex items-center gap-2 flex-1 pr-6 justify-end">
          <span className="text-[13px] text-gray-700 text-right">
            Upload Image for Store Location Here
          </span>
          <HelpBadge />
        </div>
        <div className="flex items-center gap-3 shrink-0 w-[160px]">
          <button
            type="button"
            onClick={() => setUploaded(true)}
            className={`flex items-center gap-1.5 text-white text-[12px] font-medium px-3 py-1.5 rounded-[3px] transition-colors ${
              uploaded ? 'bg-[#3ecf8e] hover:bg-[#33b87c]' : 'bg-[#3b3be8] hover:bg-[#2e2ed8]'
            }`}
          >
            {uploaded ? <Check className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
            {uploaded ? 'Uploaded' : 'Upload'}
          </button>
          <SkipLabel />
        </div>
      </div>
    </div>
  );
}

function OthersTab() {
  const fields = ['SMTP Info', 'PO Prefix', 'Tax Permit ID', 'Barcode Prefix', 'Scale for Tax'];
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <div className="pt-1">
      {fields.map((label) => (
        <div key={label} className="flex items-center py-[10px] border-b border-gray-50 last:border-0">
          <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0">{label}</span>
          <div className="flex items-center gap-2">
            <input
              value={values[label] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [label]: e.target.value }))}
              className="border border-[#dcdcec] rounded-[3px] px-3 py-[7px] text-[13px] w-[190px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 transition-colors"
            />
            <HelpBadge />
          </div>
        </div>
      ))}
    </div>
  );
}

let taxRowId = 0;
function newTaxRow() {
  taxRowId += 1;
  return { id: taxRowId, country: '', title: '', pct: '', types: [] as string[] };
}

function TaxInfoTab() {
  const [open, setOpen] = useState<number | null>(null);
  const [rows, setRows] = useState(() => [newTaxRow(), newTaxRow(), newTaxRow(), newTaxRow()]);
  const opts = ['All', 'Products', 'Rental', 'Travels', 'Course', 'Services'];

  const updateRow = (id: number, patch: Partial<ReturnType<typeof newTaxRow>>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const toggleType = (id: number, opt: string) => {
    setRows((rs) =>
      rs.map((r) =>
        r.id === id
          ? { ...r, types: r.types.includes(opt) ? r.types.filter((t) => t !== opt) : [...r.types, opt] }
          : r
      )
    );
  };

  return (
    <div className="pt-1 overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-[#3b3be8] text-white">
            {['Country', 'Tax Title', 'Tax %'].map((h) => (
              <th key={h} className="text-left px-3 py-[9px] font-medium">{h}</th>
            ))}
            <th className="text-left px-3 py-[9px] font-medium min-w-[170px]">Tax by Inventory Type</th>
            <th className="text-left px-3 py-[9px] font-medium w-[60px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0f0f8]'}>
              <td className="px-3 py-2 border-b border-gray-50">
                <input
                  value={row.country}
                  onChange={(e) => updateRow(row.id, { country: e.target.value })}
                  placeholder="e.g. USA"
                  className="w-full border border-[#dcdcec] rounded-[3px] px-2 py-1 text-[12px] outline-none focus:border-[#3b3be8] bg-white"
                />
              </td>
              <td className="px-3 py-2 border-b border-gray-50">
                <input
                  value={row.title}
                  onChange={(e) => updateRow(row.id, { title: e.target.value })}
                  placeholder="e.g. VAT"
                  className="w-full border border-[#dcdcec] rounded-[3px] px-2 py-1 text-[12px] outline-none focus:border-[#3b3be8] bg-white"
                />
              </td>
              <td className="px-3 py-2 border-b border-gray-50">
                <input
                  value={row.pct}
                  onChange={(e) => updateRow(row.id, { pct: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="0.0"
                  className="w-[70px] border border-[#dcdcec] rounded-[3px] px-2 py-1 text-[12px] outline-none focus:border-[#3b3be8] bg-white"
                />
              </td>
              <td className="px-3 py-2 border-b border-gray-50 relative">
                <button
                  type="button"
                  className="flex items-center gap-1 cursor-pointer whitespace-nowrap text-gray-700"
                  onClick={() => setOpen(open === row.id ? null : row.id)}
                >
                  {row.types.length ? `${row.types.length} selected` : 'Choose types'}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {open === row.id && (
                  <div className="absolute top-full left-3 z-30 bg-white shadow-xl border border-gray-100 rounded-[4px] min-w-[160px] p-2 mt-0.5">
                    {opts.map((opt) => (
                      <label
                        key={opt}
                        className="flex items-center gap-2 py-1.5 px-2 text-gray-700 cursor-pointer hover:bg-gray-50 rounded-[2px]"
                      >
                        <input
                          type="checkbox"
                          checked={row.types.includes(opt)}
                          onChange={() => toggleType(row.id, opt)}
                          className="accent-[#3b3be8]"
                        />
                        {opt}
                      </label>
                    ))}
                    <button
                      onClick={() => setOpen(null)}
                      className="mt-1.5 w-full bg-[#3b3be8] hover:bg-[#2e2ed8] text-white text-[11px] py-1.5 rounded-[3px] font-medium transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                )}
              </td>
              <td className="px-3 py-2 border-b border-gray-50">
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Remove row"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, newTaxRow()])}
        className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-[#3b3be8] hover:text-[#2e2ed8]"
      >
        <Plus className="h-3.5 w-3.5" /> Add Tax Rate
      </button>
    </div>
  );
}

/* ─────────── step-2 tab panels ─────────── */

function ModuleTab() {
  const modules = ['Travel', 'Charter', 'Courses', 'Rental', 'Repairs'];
  const [values, setValues] = useState<Record<string, 'yes' | 'no' | null>>({});
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
                <input
                  type="radio"
                  name={`mod_${mod}`}
                  checked={values[mod] === 'yes'}
                  onChange={() => setValues((v) => ({ ...v, [mod]: 'yes' }))}
                  className="accent-[#3b3be8]"
                />
                Yes
              </label>
              <label className="flex items-center gap-[5px] text-[13px] text-gray-600 cursor-pointer">
                <input
                  type="radio"
                  name={`mod_${mod}`}
                  checked={values[mod] === 'no'}
                  onChange={() => setValues((v) => ({ ...v, [mod]: 'no' }))}
                  className="accent-[#3b3be8]"
                />
                No
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetUpTab() {
  return (
    <div className="pt-1">
      <ToggleSwitch label="Enable Multi-Location Management" help defaultChecked />
      <ToggleSwitch label="Enable Barcode Scanning" help />
      <ToggleSwitch label="Enable Online Booking" help defaultChecked />
      <ToggleSwitch label="Enable Inventory Tracking" help defaultChecked />
      <ToggleSwitch label="Enable Equipment Rental Tracking" help />
    </div>
  );
}

function AutoLogoutTab() {
  const [enabled, setEnabled] = useState(true);
  const [minutes, setMinutes] = useState('15');
  return (
    <div className="pt-1">
      <ToggleSwitch label="Enable Auto-Logout for Inactive Sessions" help defaultChecked={enabled} onChange={setEnabled} />
      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center py-[10px] border-b border-gray-50">
              <span className="w-[185px] text-right text-[13px] text-gray-600 pr-8 shrink-0">
                Timeout (minutes)
              </span>
              <input
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="border border-[#dcdcec] rounded-[3px] px-3 py-[7px] text-[13px] w-[100px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 transition-colors"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ToggleSwitch label="Warn Users Before Logging Out" help defaultChecked />
    </div>
  );
}

let commissionRowId = 3;
function newCommissionRow(role: string, pct: string) {
  commissionRowId += 1;
  return { id: commissionRowId, role, pct };
}

function CommissionTab() {
  const [rows, setRows] = useState([
    { id: 1, role: 'Instructor', pct: '12' },
    { id: 2, role: 'Sales Staff', pct: '5' },
    { id: 3, role: 'Rental Desk', pct: '3' },
  ]);

  return (
    <div className="pt-1">
      <div className="flex items-center py-2 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        <span className="w-[185px] text-right pr-8 shrink-0">Role</span>
        <span>Commission %</span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="flex items-center py-[10px] border-b border-gray-50 last:border-0">
          <input
            value={row.role}
            onChange={(e) =>
              setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, role: e.target.value } : r)))
            }
            className="w-[185px] text-right text-[13px] text-gray-700 pr-8 shrink-0 outline-none bg-transparent border-b border-transparent focus:border-[#3b3be8] transition-colors"
          />
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-[#dcdcec] rounded-[3px] focus-within:border-[#3b3be8] transition-colors">
              <input
                value={row.pct}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r) => (r.id === row.id ? { ...r, pct: e.target.value.replace(/[^0-9.]/g, '') } : r))
                  )
                }
                className="px-3 py-[7px] text-[13px] w-[80px] outline-none rounded-[3px]"
              />
              <span className="pr-3 text-[12px] text-gray-400">%</span>
            </div>
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
              className="text-gray-400 hover:text-red-500 transition-colors"
              aria-label="Remove role"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, newCommissionRow('New Role', '0')])}
        className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-[#3b3be8] hover:text-[#2e2ed8]"
      >
        <Plus className="h-3.5 w-3.5" /> Add Role
      </button>
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="pt-1">
      <ToggleSwitch label="Email Notifications" defaultChecked />
      <ToggleSwitch label="SMS Alerts" />
      <ToggleSwitch label="Weekly Summary Reports" defaultChecked />
      <ToggleSwitch label="Dark Mode for Staff Portal" />
      <ToggleSwitch label="Require 2FA for Admins" help defaultChecked />
    </div>
  );
}

/* ─────────── step-3 tab panels ─────────── */

function OverviewTab() {
  const sections = ['Business Details', 'Operations & Modules', 'Auto-Logout & Commission', 'Notification Settings'];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  return (
    <div className="pt-2">
      <p className="text-[13px] text-gray-600 mb-4">
        Confirm you've reviewed each section before finishing setup.
      </p>
      {sections.map((s) => (
        <label
          key={s}
          className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer"
        >
          <input
            type="checkbox"
            checked={!!checked[s]}
            onChange={(e) => setChecked((c) => ({ ...c, [s]: e.target.checked }))}
            className="h-4 w-4 accent-[#3b3be8]"
          />
          <span className={`text-[13px] transition-colors ${checked[s] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
            {s} reviewed
          </span>
        </label>
      ))}
      <div className="mt-4">
        <span className="text-[13px] text-gray-600 block mb-1.5">Notes for your team</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth flagging before go-live…"
          className="border border-[#dcdcec] rounded-[3px] px-3 py-2 text-[13px] w-full max-w-[420px] h-[80px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 resize-none transition-colors"
        />
      </div>
    </div>
  );
}

const ROLES = ['Owner', 'Manager', 'Staff', 'Instructor'];
const PERMISSIONS = ['View Bookings', 'Edit Bookings', 'Manage Payments', 'Manage Staff', 'View Reports'];

function PermissionsTab() {
  const [grid, setGrid] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    ROLES.forEach((role, ri) => {
      PERMISSIONS.forEach((perm) => {
        init[`${role}|${perm}`] = ri === 0; // Owner starts fully checked
      });
    });
    return init;
  });

  const toggle = (key: string) => setGrid((g) => ({ ...g, [key]: !g[key] }));

  return (
    <div className="pt-1 overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-[#3b3be8] text-white">
            <th className="text-left px-3 py-[9px] font-medium">Permission</th>
            {ROLES.map((role) => (
              <th key={role} className="text-center px-3 py-[9px] font-medium">{role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map((perm, i) => (
            <tr key={perm} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0f0f8]'}>
              <td className="px-3 py-2.5 border-b border-gray-50 text-gray-700">{perm}</td>
              {ROLES.map((role) => {
                const key = `${role}|${perm}`;
                return (
                  <td key={role} className="px-3 py-2.5 border-b border-gray-50 text-center">
                    <input
                      type="checkbox"
                      checked={!!grid[key]}
                      onChange={() => toggle(key)}
                      className="h-4 w-4 accent-[#3b3be8] cursor-pointer"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────── step-4 tab panels ─────────── */

function ImportTab() {
  const [files, setFiles] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<'idle' | 'importing' | 'done'>('idle');

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles((f) => [...f, ...Array.from(fileList).map((file) => file.name)]);
    setStatus('idle');
  };

  return (
    <div className="pt-2">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-[8px] py-10 cursor-pointer transition-colors ${
          dragOver ? 'border-[#3b3be8] bg-[#f0f0f8]' : 'border-gray-200 hover:border-[#3b3be8]'
        }`}
      >
        <Upload className="h-5 w-5 text-[#3b3be8]" />
        <span className="text-[13px] text-gray-600">Drag files here, or click to browse</span>
        <span className="text-[11px] text-gray-400">CSV or Excel — customers, inventory, bookings</span>
        <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
      </label>

      {files.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {files.map((name, i) => (
            <div key={`${name}-${i}`} className="flex items-center justify-between border border-gray-100 rounded-[4px] px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-[12px] text-gray-700 truncate">{name}</span>
              </div>
              <button
                type="button"
                onClick={() => setFiles((f) => f.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={status === 'importing'}
            onClick={() => {
              setStatus('importing');
              setTimeout(() => setStatus('done'), 900);
            }}
            className="mt-1 self-start flex items-center gap-1.5 bg-[#3b3be8] hover:bg-[#2e2ed8] disabled:opacity-60 text-white text-[12px] font-medium px-4 py-2 rounded-[3px] transition-colors"
          >
            {status === 'importing' ? 'Importing…' : status === 'done' ? 'Imported ✓' : `Import ${files.length} File${files.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}

function ExportTab() {
  const dataTypes = ['Customers', 'Bookings', 'Inventory', 'Financials'];
  const [checked, setChecked] = useState<Record<string, boolean>>({ Customers: true, Bookings: true });
  const [format, setFormat] = useState<'CSV' | 'Excel' | 'PDF'>('CSV');
  const [status, setStatus] = useState<'idle' | 'preparing' | 'ready'>('idle');

  const anyChecked = Object.values(checked).some(Boolean);

  return (
    <div className="pt-2">
      <p className="text-[13px] text-gray-600 mb-3">Choose what to export</p>
      <div className="flex flex-col gap-2.5 mb-5">
        {dataTypes.map((dt) => (
          <label key={dt} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!checked[dt]}
              onChange={(e) => {
                setChecked((c) => ({ ...c, [dt]: e.target.checked }));
                setStatus('idle');
              }}
              className="h-4 w-4 accent-[#3b3be8]"
            />
            <span className="text-[13px] text-gray-700">{dt}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-[13px] text-gray-600">Format</span>
        {(['CSV', 'Excel', 'PDF'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFormat(f);
              setStatus('idle');
            }}
            className={`px-3 py-1.5 rounded-[3px] text-[12px] font-medium border transition-colors ${
              format === f
                ? 'bg-[#3b3be8] border-[#3b3be8] text-white'
                : 'border-[#dcdcec] text-gray-600 hover:border-[#3b3be8]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!anyChecked || status === 'preparing'}
        onClick={() => {
          setStatus('preparing');
          setTimeout(() => setStatus('ready'), 900);
        }}
        className="flex items-center gap-1.5 bg-[#3b3be8] hover:bg-[#2e2ed8] disabled:opacity-40 text-white text-[12px] font-medium px-4 py-2 rounded-[3px] transition-colors"
      >
        {status === 'preparing' ? 'Preparing…' : status === 'ready' ? `${format} Ready ✓` : `Export as ${format}`}
      </button>
    </div>
  );
}

/* ─────────── step-5 tab panels ─────────── */

let categoryId = 0;
function newCategory(name: string) {
  categoryId += 1;
  return { id: categoryId, name };
}

function CategoriesTab() {
  const [categories, setCategories] = useState(() =>
    ['Scuba Gear', 'Snorkeling Gear', 'Apparel', 'Courses', 'Charters'].map(newCategory)
  );
  const [input, setInput] = useState('');

  const addCategory = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setCategories((c) => [...c, newCategory(trimmed)]);
    setInput('');
  };

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 mb-4 max-w-[400px]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCategory()}
          placeholder="New category name"
          className="flex-1 border border-[#dcdcec] rounded-[3px] px-3 py-[7px] text-[13px] outline-none focus:border-[#3b3be8] focus:ring-1 focus:ring-[#3b3be8]/20 transition-colors"
        />
        <button
          type="button"
          onClick={addCategory}
          className="flex items-center gap-1 bg-[#3b3be8] hover:bg-[#2e2ed8] text-white text-[12px] font-medium px-3 py-[7px] rounded-[3px] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center justify-between border border-gray-100 rounded-[4px] px-3 py-2 max-w-[400px]"
          >
            <span className="text-[13px] text-gray-700">{cat.name}</span>
            <button
              type="button"
              onClick={() => setCategories((c) => c.filter((x) => x.id !== cat.id))}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-[12px] text-gray-400">No categories yet — add one above.</p>
        )}
      </div>
    </div>
  );
}

/* ─────────── animation variants ─────────── */
const EASE_OUT: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const slideVariants: Variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 36 : -36,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.24, ease: EASE_OUT },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -36 : 36,
    opacity: 0,
    transition: { duration: 0.18, ease: EASE_OUT },
  }),
};

const circleVariants: Variants = {
  initial: { scale: 0.6, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 420, damping: 24 } },
  exit: { scale: 0.6, opacity: 0, transition: { duration: 0.12 } },
};

/* ─────────── main page ─────────── */

export function SetupWizard() {
  const [activeStep, setActiveStep] = useState(1);
  const [activeTab, setActiveTab] = useState(0);
  const [direction, setDirection] = useState(1);
  const [furthestStep, setFurthestStep] = useState(1);

  const tabs = STEP_TABS[activeStep] ?? ['General'];

  const goToStep = (step: number, tabIndex = 0) => {
    setDirection(step >= activeStep ? 1 : -1);
    setActiveStep(step);
    setActiveTab(tabIndex);
    setFurthestStep((f) => Math.max(f, step));
  };

  const handleNext = () => {
    setDirection(1);
    if (activeTab < tabs.length - 1) {
      setActiveTab(activeTab + 1);
    } else if (activeStep < 5) {
      goToStep(activeStep + 1, 0);
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

  // Steps are unlocked once you've reached them at least once, plus the very next one.
  const stepStatus = (id: number) =>
    id < activeStep ? 'done' : id === activeStep ? 'active' : 'pending';
  const isReachable = (id: number) => id <= furthestStep + 1;

  /* progress: step contributes 20%, each tab contributes 20/tabCount */
  const tabCount = tabs.length;
  const pct = Math.round(((activeStep - 1) * 20) + (activeTab / tabCount) * 20);
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
      if (tab === 'Set Up') return <SetUpTab />;
      if (tab === 'Auto-Logout') return <AutoLogoutTab />;
      if (tab === 'Commission') return <CommissionTab />;
      if (tab === 'Settings') return <SettingsTab />;
    }
    if (activeStep === 3) {
      if (tab === 'Overview') return <OverviewTab />;
      if (tab === 'Permissions') return <PermissionsTab />;
    }
    if (activeStep === 4) {
      if (tab === 'Import') return <ImportTab />;
      if (tab === 'Export') return <ExportTab />;
    }
    if (activeStep === 5) {
      if (tab === 'Categories') return <CategoriesTab />;
    }
    return null;
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#ecebf7]">

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
        className="relative flex w-full h-full z-10"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      >

        {/* ── left sidebar ── */}
        <div className="w-[230px] shrink-0 bg-[#2626cc] flex flex-col py-9 rounded-l-[18px]">
          <div className="flex-1 flex flex-col gap-7">
            {STEPS.map((step) => {
              const status = stepStatus(step.id);
              const reachable = isReachable(step.id);
              return (
                <div
                  key={step.id}
                  className={`flex items-start pl-7 pr-10 ${reachable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  onClick={() => {
                    if (reachable) goToStep(step.id, 0);
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
                            : reachable
                            ? 'text-white/55'
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
                const reachable = isReachable(step.id);
                return (
                  <div
                    key={step.id}
                    className={`pointer-events-auto h-[38px] flex items-start pt-0.5 ${
                      reachable ? 'cursor-pointer' : 'cursor-not-allowed'
                    }`}
                    onClick={() => {
                      if (reachable) goToStep(step.id, 0);
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
                          className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            reachable ? 'bg-white/35' : 'bg-white/20'
                          }`}
                        >
                          <span className={`text-[13px] font-medium ${reachable ? 'text-white/85' : 'text-white/60'}`}>
                            {step.id}
                          </span>
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
