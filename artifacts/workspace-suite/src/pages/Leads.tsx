import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { soundClick, soundOpen, soundClose, soundTab, soundRefresh } from '@/lib/sounds';
import { Search, Bell, ChevronDown, MoreVertical, Plus, X, RefreshCw, AlertCircle } from 'lucide-react';
import { LeadPanel, type Lead } from '@/components/LeadPanel';
import { useActiveLead } from '@/context/ActiveLeadContext';
import { Avatar } from '@/components/Avatar';
import { personAvatarUrl } from '@/lib/avatar';

// ── Webhook ──────────────────────────────────────────────────────────────────
const WEBHOOK_URL = 'https://ravenmark.app.n8n.cloud/webhook/LeadDataFetch';

interface RawLead {
  row_number: number;
  'Live/Dead/Blacklisted/Booked': string;
  'Enquiry Date': string;
  Name: string;
  'Main Contact - Job Role': string;
  'Company Name': string;
  'Company Sector (If Applicable)': string;
  'Main Contact - Email': string;
  'Main Contact - Number': string;
  'Client Reference Number': string;
  Source: string;
}

function toInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function mapRaw(raw: RawLead, index: number): Lead {
  return {
    id: raw.row_number ?? index + 1,
    name: raw['Name'] ?? '—',
    email: raw['Main Contact - Email'] ?? '—',
    code: raw['Client Reference Number'] ?? `#${index + 1}`,
    designation: raw['Main Contact - Job Role'] ?? '—',
    phone: raw['Main Contact - Number'] ?? '—',
    joined: raw['Enquiry Date'] ?? '—',
    color: '#2ecc71',
    initials: toInitials(raw['Name'] ?? '?'),
    sector: raw['Company Sector (If Applicable)'] ?? '—',
    referenceNumber: raw['Client Reference Number'] ?? '—',
    source: raw['Source'] ?? '—',
    company: raw['Company Name'] ?? '—',
    status: (raw['Live/Dead/Blacklisted/Booked'] ?? '').toLowerCase().trim(),
  };
}

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  const data = await res.json();
  const rows: RawLead[] = Array.isArray(data?.leads) ? data.leads : [];
  return rows.map(mapRaw);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ['Live', 'Booked', 'Dead', 'Blacklisted'] as const;

// ── Component ─────────────────────────────────────────────────────────────────
export function Leads() {
  const { setActiveLead } = useActiveLead();
  const [activeTab, setActiveTab] = useState(0);
  const [leads, setLeads]         = useState<Lead[]>([]);
  const [status, setStatus]       = useState<'loading' | 'ok' | 'error'>('loading');
  const [panelLead, setPanelLead] = useState<Lead | null>(null);
  const [query, setQuery]         = useState('');
  const searchRef                 = useRef<HTMLInputElement>(null);

  const load = async () => {
    setStatus('loading');
    try {
      const data = await fetchLeads();
      setLeads(data);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  // ── Tab filtering — filter by status ──
  const tabKey = TABS[activeTab].toLowerCase();
  const tabFiltered: Lead[] = leads.filter((l) => {
    const s = (l.status ?? '').toLowerCase();
    return s === tabKey;
  });

  // ── Search filtering ──
  const visible = query.trim()
    ? tabFiltered.filter((l) =>
        [l.name, l.email, l.code, l.designation, l.company, l.sector, l.source]
          .some((v) => v.toLowerCase().includes(query.toLowerCase())),
      )
    : tabFiltered;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-white">
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* ── Combined header bar ── */}
        <div className="flex items-center gap-3 border-b border-black/8 bg-white px-8 py-3 shrink-0">

          {/* Search */}
          <div className="flex items-center gap-2 border border-black/12 px-3 py-2 w-[200px] shrink-0 focus-within:border-[#2ecc71] transition-colors">
            <Search className="h-[14px] w-[14px] shrink-0 text-black/30" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads…"
              className="w-full bg-transparent text-[13px] text-black/70 placeholder-black/30 outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); soundClick(); }} className="text-black/25 hover:text-black/50 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Title + count */}
          <h1 className="text-[19px] font-bold text-black tracking-tight whitespace-nowrap">
            Leads Database
            {status === 'ok' && leads.length > 0 && (
              <span className="ml-2 text-[12px] font-normal text-black/30">{leads.length}</span>
            )}
          </h1>

          <div className="flex-1" />

          {/* Right-side controls */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => { load(); soundRefresh(); }}
              disabled={status === 'loading'}
              className="flex items-center justify-center h-8 w-8 border border-black/10 text-black/35 hover:border-[#2ecc71] hover:text-[#2ecc71] disabled:opacity-40 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
            </button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={soundClick}
              className="flex items-center gap-1.5 bg-[#2ecc71] hover:bg-[#27af61] text-white text-[13px] font-semibold px-4 py-2 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Lead
            </motion.button>

            <div className="h-5 w-px bg-black/10" />

            <div className="relative">
              <Bell className="h-[17px] w-[17px] text-black/35" />
              <span className="absolute -top-0.5 -right-0.5 h-[6px] w-[6px] bg-[#2ecc71]" />
            </div>

            <div className="flex items-center gap-2 cursor-pointer">
              <Avatar
                src={personAvatarUrl({ name: 'Alief Vinicius' })}
                alt="Alief Vinicius"
                fallbackText="AV"
                className="h-8 w-8 text-[11px] shrink-0"
              />
              <span className="text-[13px] font-medium text-black/70 whitespace-nowrap">Alief Vinicius</span>
              <ChevronDown className="h-3.5 w-3.5 text-black/30" />
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-black/8 bg-white px-8 shrink-0">
          {TABS.map((tab, i) => {
            const count = leads.filter(l => (l.status ?? '').toLowerCase() === tab.toLowerCase()).length;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(i); soundTab(); }}
                className={`relative px-5 pb-2.5 pt-2 text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === i ? 'text-black' : 'text-black/35 hover:text-black/60'
                }`}
              >
                {tab}
                {status === 'ok' && count > 0 && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-sm ${
                    activeTab === i ? 'bg-[#2ecc71]/15 text-[#219251]' : 'bg-black/6 text-black/30'
                  }`}>
                    {count}
                  </span>
                )}
                {activeTab === i && (
                  <motion.span
                    layoutId="leads-tab-line"
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#2ecc71]"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-auto bg-white">

          {/* Loading skeleton */}
          <AnimatePresence>
            {status === 'loading' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="divide-y divide-black/5"
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[40px_1fr_140px_180px_150px_140px_40px] px-6 py-[13px]">
                    <div className="h-4 w-5 bg-black/6 animate-pulse self-center" />
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-black/6 animate-pulse shrink-0" />
                      <div className="space-y-1.5">
                        <div className="h-3 w-32 bg-black/6 animate-pulse" />
                        <div className="h-2.5 w-44 bg-black/4 animate-pulse" />
                      </div>
                    </div>
                    {[100, 140, 110, 80].map((w) => (
                      <div key={w} className="h-3 bg-black/5 animate-pulse self-center" style={{ width: w }} />
                    ))}
                    <div />
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error state */}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <AlertCircle className="h-8 w-8 text-black/20" />
              <p className="text-[13px] font-medium text-black/50">Could not load leads</p>
              <p className="text-[12px] text-black/30">Check your connection and try again.</p>
              <button
                onClick={load}
                className="mt-1 bg-[#2ecc71] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#27af61] transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          {status === 'ok' && (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[28px_1fr_116px_1fr_128px_104px_40px] px-8 py-3 border-b border-black/8 sticky top-0 bg-white z-10">
                <div />
                <span className="text-[11.5px] font-medium text-black/35">Basic Info</span>
                <span className="text-[11.5px] font-medium text-black/35">Reference</span>
                <span className="text-[11.5px] font-medium text-black/35">Role</span>
                <span className="text-[11.5px] font-medium text-black/35">Phone</span>
                <span className="text-[11.5px] font-medium text-black/35">Enquiry Date</span>
                <div />
              </div>

              {/* Empty state */}
              {visible.length === 0 && (
                <div className="flex items-center justify-center py-16 text-[13px] text-black/30">
                  {query ? `No leads match "${query}"` : `No ${TABS[activeTab].toLowerCase()} leads`}
                </div>
              )}

              {/* Rows */}
              {visible.map((lead, idx) => (
                <motion.div
                  key={lead.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.025, 0.4), duration: 0.18 }}
                  onClick={() => { setPanelLead(lead); setActiveLead(lead); soundOpen(); }}
                  className={`grid grid-cols-[28px_1fr_116px_1fr_128px_104px_40px] px-8 py-[13px] border-b border-black/5 last:border-0 cursor-pointer transition-colors ${
                    panelLead?.id === lead.id ? 'bg-[#2ecc71]/6' : 'hover:bg-black/[0.02]'
                  }`}
                >
                  <span className="text-[12px] text-black/25 self-center">{idx + 1}</span>

                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={personAvatarUrl(lead)}
                      alt={lead.name}
                      fallbackText={lead.initials}
                      className="h-9 w-9 text-[11px] shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-black leading-tight truncate">{lead.name}</p>
                      <p className="text-[11.5px] text-black/35 truncate">{lead.email}</p>
                    </div>
                  </div>

                  <span className="text-[12px] text-black/45 self-center font-mono truncate">{lead.code}</span>
                  <span className="text-[13px] font-medium text-black/70 self-center truncate pr-3 min-w-0">{lead.designation}</span>
                  <span className="text-[13px] text-black/50 self-center truncate">{lead.phone}</span>
                  <span className="text-[13px] text-black/50 self-center">{lead.joined}</span>

                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="self-center flex items-center justify-center text-black/20 hover:text-black/50 transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </>
          )}
        </div>
      </div>

      <LeadPanel lead={panelLead} onClose={() => { setPanelLead(null); soundClose(); }} />
    </div>
  );
}

export default Leads;
