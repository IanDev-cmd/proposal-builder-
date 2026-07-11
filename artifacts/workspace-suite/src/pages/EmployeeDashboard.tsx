import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Bell, ChevronDown, MoreVertical, Plus,
} from 'lucide-react';
import { LeadPanel, type Lead } from '@/components/LeadPanel';
import { getApiUrl } from '@/lib/api';

/* ─────────── data ─────────── */

const EMPLOYEES: Lead[] = [
  {
    id: 1,
    name: 'Jimmy Henderson',
    email: 'henderson399@gmail.com',
    code: 'CU009',
    designation: 'Angular Developer',
    phone: '788-998-1643',
    joined: 'Mar 27, 2016',
    color: '#4e9af1',
    initials: 'JH',
    linkedin: 'https://linkedin.com/in/jhenderson',
    sector: 'Hospitality',
    referenceNumber: 'WE.18795',
    source: 'Website Enquiry',
    company: 'Blue Apple Contract Catering',
  },
  {
    id: 2,
    name: 'Eva W Ramirez',
    email: 'eva_ramirez@gmail.com',
    code: 'CU012',
    designation: 'Front-end Developer',
    phone: '603-801-5810',
    joined: 'Jul 02, 2016',
    color: '#f97316',
    initials: 'EW',
    sector: 'Hospitality',
    referenceNumber: 'WE.18796',
    source: 'Referral',
    company: 'B Bagel',
  },
  {
    id: 3,
    name: 'Bernita D Stubbs',
    email: 'Subbsbernita@gmail.com',
    code: 'CU081',
    designation: 'Graphic Designer',
    phone: '434-709-1874',
    joined: 'Dec 12, 2017',
    color: '#8b5cf6',
    initials: 'BS',
    linkedin: 'https://linkedin.com/in/bstubbs',
    sector: 'Technology & Software',
    referenceNumber: 'WE.18797',
    source: 'LinkedIn Outreach',
    company: 'Firebird',
  },
  {
    id: 4,
    name: 'Terrell Elliott',
    email: 'elliotterrell@gmail.com',
    code: 'CU034',
    designation: 'Mean Developer',
    phone: '318-225-1064',
    joined: 'Apr 12, 2017',
    color: '#14b8a6',
    initials: 'TE',
    sector: 'Recruitment & HR',
    referenceNumber: 'WE.18798',
    source: 'Google Search',
    company: 'Green Sheep Group Ltd',
  },
];

const TABS = ['All Enquiries', 'Sectors', 'Sources'];

/* ─────────── component ─────────── */

export function EmployeeDashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [leads, setLeads] = useState<Lead[]>(EMPLOYEES);
  const [panelLead, setPanelLead] = useState<Lead | null>(null);

  // Pick up any leads that arrived through the webhook (see api-server /api/leads).
  useEffect(() => {
    let cancelled = false;
    const palette = ['#4e9af1', '#f97316', '#8b5cf6', '#14b8a6', '#ec4899', '#eab308'];

    async function loadLeads() {
      try {
        const res = await fetch(getApiUrl('/leads'));
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.leads) && data.leads.length > 0) {
          const webhookLeads: Lead[] = data.leads.map((raw: any, i: number) => ({
            id: 1000 + raw.id, // offset to avoid colliding with seeded IDs
            name: raw.name,
            email: raw.email ?? '—',
            code: `WH${String(raw.id).padStart(3, '0')}`,
            designation: raw.designation ?? 'Lead',
            phone: raw.phone ?? '—',
            joined: raw.createdAt ? new Date(raw.createdAt).toLocaleDateString() : '—',
            color: palette[i % palette.length],
            initials: (raw.name ?? '??').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase(),
            linkedin: raw.linkedin ?? undefined,
            sector: raw.sector ?? '—',
            referenceNumber: raw.referenceNumber ?? '—',
            source: raw.source ?? 'Webhook',
            company: raw.company ?? '—',
          }));
          setLeads([...EMPLOYEES, ...webhookLeads]);
        }
      } catch {
        // api-server may not be running in this environment; fall back to seed data silently.
      }
    }
    loadLeads();
    const interval = setInterval(loadLeads, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0a0a0a] relative">

      {/* ── green decorative accents ── */}
      <div
        className="absolute top-0 right-0 w-[180px] h-[180px] bg-[#2ecc71]/20 pointer-events-none z-0"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }}
      />
      <div
        className="absolute bottom-0 right-0 w-[140px] h-[140px] bg-[#2ecc71]/15 pointer-events-none z-0"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
      />

      {/* ── main area (sidebar removed, edge-to-edge) ── */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">

        {/* ── inner top bar ── */}
        <div className="flex h-[56px] items-center justify-between bg-black/60 backdrop-blur-sm border-b border-white/10 px-6 shrink-0">
          {/* search */}
          <button className="flex items-center gap-2 text-white/30 hover:text-white/60 transition-colors">
            <Search className="h-[18px] w-[18px]" />
          </button>

          {/* right: bell + user */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <Bell className="h-[18px] w-[18px] text-white/50" />
              <span className="absolute -top-0.5 -right-0.5 h-[6px] w-[6px] rounded-full bg-[#2ecc71]" />
            </div>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="h-8 w-8 rounded-full overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[11px] font-bold">
                AV
              </div>
              <span className="text-[13px] font-medium text-white/80">Alief Vinicius</span>
              <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            </div>
          </div>
        </div>

        {/* ── content: no outer padding, table runs edge to edge ── */}
        <div className="flex-1 overflow-auto">

          {/* heading row */}
          <div className="flex items-center justify-between px-6 pt-6 mb-6">
            <h1 className="text-[26px] font-bold text-white tracking-tight">Leads Database</h1>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-[#2ecc71] hover:bg-[#27af61] text-[#0a0a0a] text-[13px] font-semibold px-4 py-2 rounded-[5px] transition-colors shadow-sm shadow-[#2ecc71]/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Lead
            </motion.button>
          </div>

          {/* tabs */}
          <div className="flex gap-0 border-b border-white/10 mb-0 px-6">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`relative px-5 pb-3 pt-1 text-[13px] font-medium transition-colors ${
                  activeTab === i ? 'text-white' : 'text-white/35 hover:text-white/60'
                }`}
              >
                {tab}
                {activeTab === i && (
                  <motion.span
                    layoutId="emp-tab-line"
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#2ecc71] rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* table — flush to the edges for maximum width */}
          <div className="bg-[#101010] overflow-hidden">
            {/* table header */}
            <div className="grid grid-cols-[40px_1fr_140px_160px_150px_140px_40px] px-6 py-3 border-b border-white/10">
              <div />
              <span className="text-[11.5px] font-medium text-white/35">Basic Info</span>
              <span className="text-[11.5px] font-medium text-white/35">Employee Code</span>
              <span className="text-[11.5px] font-medium text-white/35">Designation</span>
              <span className="text-[11.5px] font-medium text-white/35">Phone Number</span>
              <span className="text-[11.5px] font-medium text-white/35">Joining Date</span>
              <div />
            </div>

            {/* rows */}
            {leads.map((emp, idx) => (
              <motion.div
                key={emp.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.22 }}
                onClick={() => setPanelLead(emp)}
                className={`grid grid-cols-[40px_1fr_140px_160px_150px_140px_40px] px-6 py-[14px] border-b border-white/5 last:border-0 cursor-pointer transition-colors ${
                  panelLead?.id === emp.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                }`}
              >
                {/* # */}
                <span className="text-[12px] text-white/30 self-center">{emp.id}</span>

                {/* basic info */}
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: emp.color }}
                  >
                    {emp.initials}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white leading-tight">{emp.name}</p>
                    <p className="text-[11.5px] text-white/35">{emp.email}</p>
                  </div>
                </div>

                {/* code */}
                <span className="text-[13px] text-white/60 self-center">{emp.code}</span>

                {/* designation */}
                <span className="text-[13px] font-medium text-white/80 self-center">{emp.designation}</span>

                {/* phone */}
                <span className="text-[13px] text-white/60 self-center">{emp.phone}</span>

                {/* joined */}
                <span className="text-[13px] text-white/60 self-center">{emp.joined}</span>

                {/* actions */}
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="self-center text-white/25 hover:text-white/60 transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <LeadPanel lead={panelLead} onClose={() => setPanelLead(null)} />
    </div>
  );
}

export default EmployeeDashboard;
