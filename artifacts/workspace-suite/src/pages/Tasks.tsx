import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Check, X, ChevronDown } from 'lucide-react';
import { LeadPanel, type Lead } from '@/components/LeadPanel';
import { soundClick, soundOpen, soundClose, soundTab, soundToggle } from '@/lib/sounds';

// ── Webhook (same as Leads page) ──────────────────────────────────────────────
const WEBHOOK_URL = 'https://ravenmark.app.n8n.cloud/webhook/LeadDataFetch';

interface RawLead {
  row_number: number;
  'Name': string;
  'Main Contact - Job Role': string;
  'Company Name': string;
  'Company Sector (If Applicable)': string;
  'Main Contact - Email': string;
  'Main Contact - Number': string;
  'Client Reference Number': string;
  'Source': string;
  'Enquiry Date': string;
}

function toInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function mapRaw(raw: RawLead, i: number): Lead {
  return {
    id:              raw.row_number ?? i + 1,
    name:            raw['Name'] ?? '—',
    email:           raw['Main Contact - Email'] ?? '—',
    code:            raw['Client Reference Number'] ?? `#${i + 1}`,
    designation:     raw['Main Contact - Job Role'] ?? '—',
    phone:           raw['Main Contact - Number'] ?? '—',
    joined:          raw['Enquiry Date'] ?? '—',
    color:           '#2ecc71',
    initials:        toInitials(raw['Name'] ?? '?'),
    sector:          raw['Company Sector (If Applicable)'] ?? '—',
    referenceNumber: raw['Client Reference Number'] ?? '—',
    source:          raw['Source'] ?? '—',
    company:         raw['Company Name'] ?? '—',
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

// ── Client Relationship Representatives (fixed list for tagging) ──────────────
const CRR_REPS: Lead[] = [
  { id: 9001, name: 'Katherine',  initials: 'KA', email: '', code: 'CRR-1', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9002, name: 'Sapphire',   initials: 'SA', email: '', code: 'CRR-2', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9003, name: 'Elizabeth',  initials: 'EL', email: '', code: 'CRR-3', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9004, name: 'Lily-May',   initials: 'LM', email: '', code: 'CRR-4', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9005, name: 'Natasha',    initials: 'NA', email: '', code: 'CRR-5', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
];

// ── Task model ────────────────────────────────────────────────────────────────
type TaskList = 'today' | 'upcoming';

type TaskItem = {
  id:     string;
  text:   string;
  done:   boolean;
  tagged: Lead[];
  list:   TaskList;
};

type LeadTasks = Record<string, TaskItem[]>;

// ── TaskRow ───────────────────────────────────────────────────────────────────
function TaskRow({
  task,
  onToggle,
  onOpenLead,
}: {
  task:       TaskItem;
  onToggle:   () => void;
  onOpenLead: (lead: Lead) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 group">
      {/* Checkbox */}
      <button
        onClick={() => { onToggle(); soundToggle(); }}
        className={`flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${
          task.done
            ? 'border-[#2ecc71] bg-[#2ecc71]'
            : 'border-black/20 bg-white hover:border-[#2ecc71]'
        }`}
        aria-label={task.done ? 'Mark undone' : 'Mark done'}
      >
        {task.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </button>

      {/* Text */}
      <span className={`flex-1 text-[13px] leading-snug ${
        task.done ? 'text-black/30 line-through' : 'text-black/70'
      }`}>
        {task.text}
      </span>

      {/* Tagged avatars — visible on hover */}
      {task.tagged.length > 0 && (
        <div className="flex -space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {task.tagged.slice(0, 3).map(lead => (
            <button
              key={lead.id}
              onClick={() => onOpenLead(lead)}
              title={lead.name}
              className="h-6 w-6 rounded-full bg-[#2ecc71] border-2 border-white flex items-center justify-center text-white text-[9px] font-bold hover:z-10 hover:scale-110 transition-transform"
            >
              {lead.initials}
            </button>
          ))}
          {task.tagged.length > 3 && (
            <div className="h-6 w-6 rounded-full bg-black/10 border-2 border-white flex items-center justify-center text-[9px] font-semibold text-black/50">
              +{task.tagged.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Tasks() {
  // Leads data
  const [leads,       setLeads]       = useState<Lead[]>([]);
  const [fetchStatus, setFetchStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  // Tasks per lead
  const [tasksByLead, setTasksByLead] = useState<LeadTasks>({});

  // Lead panel (reuse the existing LeadPanel component)
  const [panelLead, setPanelLead] = useState<Lead | null>(null);

  // Left-panel search
  const [query, setQuery] = useState('');

  // New task form
  const [newText,     setNewText]     = useState('');
  const [newList,     setNewList]     = useState<TaskList>('today');
  const [tagged,      setTagged]      = useState<Lead[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showTagDrop,  setShowTagDrop]  = useState(false);

  const inputRef   = useRef<HTMLInputElement>(null);
  const tagDropRef = useRef<HTMLDivElement>(null);

  // ── Fetch ──
  useEffect(() => {
    setFetchStatus('loading');
    fetchLeads()
      .then(data => {
        setLeads(data);
        setActiveLeadId(data[0] ? String(data[0].id) : null);
        setFetchStatus('ok');
      })
      .catch(() => setFetchStatus('error'));
  }, []);

  // ── Close tag dropdown on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tagDropRef.current && !tagDropRef.current.contains(e.target as Node)) {
        setShowTagDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived ──
  const activeLead  = leads.find(l => String(l.id) === activeLeadId) ?? null;
  const activeKey   = activeLeadId ?? '';
  const activeTasks = tasksByLead[activeKey] ?? [];
  const todayTasks    = activeTasks.filter(t => t.list === 'today');
  const upcomingTasks = activeTasks.filter(t => t.list === 'upcoming');

  // Unique leads tagged across ALL tasks for the active lead
  const allTagged = useMemo(() => {
    const seen = new Set<string>();
    const result: Lead[] = [];
    activeTasks.forEach(t =>
      t.tagged.forEach(l => {
        const k = String(l.id);
        if (!seen.has(k)) { seen.add(k); result.push(l); }
      }),
    );
    return result;
  }, [activeTasks]);

  // Filtered leads for the left panel
  const filteredLeads = query.trim()
    ? leads.filter(l =>
        [l.name, l.email, l.company, l.designation]
          .some(v => v.toLowerCase().includes(query.toLowerCase())),
      )
    : leads;

  // @ mention candidates — only CRR representatives
  const mentionResults = mentionQuery !== null
    ? CRR_REPS.filter(r =>
        r.name.toLowerCase().includes(mentionQuery) &&
        !tagged.find(t => t.id === r.id),
      )
    : [];

  // ── Handlers ──
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewText(val);
    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1) {
      const after = val.slice(lastAt + 1);
      if (!after.includes(' ')) { setMentionQuery(after.toLowerCase()); return; }
    }
    setMentionQuery(null);
  };

  const selectMention = useCallback((lead: Lead) => {
    setNewText(prev => {
      const lastAt = prev.lastIndexOf('@');
      return prev.slice(0, lastAt) + `@${lead.name} `;
    });
    setMentionQuery(null);
    setTagged(prev => prev.find(t => t.id === lead.id) ? prev : [...prev, lead]);
    soundClick();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const addTask = useCallback(() => {
    if (!newText.trim() || !activeLeadId) return;
    const task: TaskItem = {
      id:     `task-${Date.now()}`,
      text:   newText.trim(),
      done:   false,
      tagged,
      list:   newList,
    };
    setTasksByLead(prev => ({
      ...prev,
      [activeKey]: [...(prev[activeKey] ?? []), task],
    }));
    setNewText('');
    setTagged([]);
    setMentionQuery(null);
    soundClick();
  }, [newText, activeLeadId, activeKey, tagged, newList]);

  const toggleTask = useCallback((taskId: string) => {
    setTasksByLead(prev => ({
      ...prev,
      [activeKey]: (prev[activeKey] ?? []).map(t =>
        t.id === taskId ? { ...t, done: !t.done } : t,
      ),
    }));
  }, [activeKey]);

  const removeTagged = (leadId: number | string) =>
    setTagged(prev => prev.filter(t => t.id !== leadId));

  const toggleTagInDrop = (lead: Lead) => {
    const isIn = tagged.find(t => t.id === lead.id);
    if (isIn) { removeTagged(lead.id); }
    else       { setTagged(prev => [...prev, lead]); soundClick(); }
  };

  // ── Render ──
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">

      {/* ── Left panel (green) ── */}
      <div className="flex w-[340px] shrink-0 flex-col overflow-hidden bg-[#2ecc71] p-8">
        <div className="mt-4">
          <h1 className="text-[26px] font-semibold leading-tight text-[#0d2318]">Hi Samantha</h1>
          <p className="mt-1 text-[13px] text-[#0d2318]/55">Welcome back to the workspace!</p>
        </div>

        {/* Search */}
        <div className="mt-6 flex items-center gap-2 bg-white/30 px-4 py-2.5 focus-within:bg-white/40 transition-colors shrink-0">
          <Search className="h-4 w-4 shrink-0 text-[#0d2318]/50" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search leads…"
            className="w-full bg-transparent text-[13px] text-[#0d2318] placeholder-[#0d2318]/45 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#0d2318]/40 hover:text-[#0d2318]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Lead grid */}
        <div className="mt-6 flex-1 overflow-y-auto">
          {fetchStatus === 'loading' && (
            <div className="grid grid-cols-3 gap-x-4 gap-y-5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="h-16 w-16 rounded-full bg-white/20 animate-pulse" />
                  <div className="h-2 w-10 bg-white/20 animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {fetchStatus === 'ok' && (
            <>
              <p className="mb-4 text-[12px] font-medium text-[#0d2318]/60">
                Leads <span className="text-[#0d2318]/35">({filteredLeads.length})</span>
              </p>
              <div className="grid grid-cols-3 gap-x-4 gap-y-5">
                {filteredLeads.map(lead => {
                  const isActive  = String(lead.id) === activeLeadId;
                  const taskCount = (tasksByLead[String(lead.id)] ?? []).length;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => { setActiveLeadId(String(lead.id)); soundTab(); }}
                      className="flex flex-col items-center gap-2 text-center"
                    >
                      <div className={`relative h-16 w-16 rounded-full bg-white flex items-center justify-center text-[14px] font-bold text-[#2ecc71] transition-transform ${
                        isActive
                          ? 'scale-105 ring-2 ring-[#0d2318]/25 ring-offset-2 ring-offset-[#2ecc71]'
                          : 'hover:scale-105'
                      }`}>
                        {lead.initials}
                        {taskCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 h-[18px] w-[18px] rounded-full bg-[#0d2318] border-2 border-[#2ecc71] flex items-center justify-center text-[9px] font-bold text-white leading-none">
                            {taskCount}
                          </span>
                        )}
                      </div>
                      <span className={`w-full truncate text-[10px] leading-tight px-1 ${
                        isActive ? 'text-[#0d2318] font-semibold' : 'text-[#0d2318]/55'
                      }`}>
                        {lead.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {fetchStatus === 'error' && (
            <p className="text-[13px] text-[#0d2318]/60">Could not load leads.</p>
          )}
        </div>
      </div>

      {/* ── Right panel (white) ── */}
      <div className="relative flex flex-1 flex-col overflow-hidden border-l border-black/8 bg-white">
        {!activeLead ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-black/25">
            {fetchStatus === 'loading' ? 'Loading…' : 'Select a lead from the left panel'}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between border-b border-black/8 px-8 py-5 shrink-0">
              <div>
                <h2 className="text-[22px] font-semibold text-black">{activeLead.name}</h2>
                <p className="mt-0.5 text-[12px] text-black/40">
                  {activeLead.designation}
                  {activeLead.company && activeLead.company !== '—' && ` · ${activeLead.company}`}
                </p>
              </div>

              {/* Tagged profiles (top-right) */}
              <div className="flex items-center gap-1.5">
                <AnimatePresence>
                  {allTagged.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex -space-x-2"
                    >
                      {allTagged.slice(0, 5).map(lead => (
                        <motion.button
                          key={lead.id}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          onClick={() => { setPanelLead(lead); soundOpen(); }}
                          title={lead.name}
                          className="h-8 w-8 rounded-full border-2 border-white bg-[#2ecc71] flex items-center justify-center text-[10px] font-bold text-white hover:z-10 hover:scale-110 transition-transform"
                        >
                          {lead.initials}
                        </motion.button>
                      ))}
                      {allTagged.length > 5 && (
                        <div className="h-8 w-8 rounded-full border-2 border-white bg-black/8 flex items-center justify-center text-[10px] font-semibold text-black/50">
                          +{allTagged.length - 5}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* + dropdown to tag from all leads */}
                <div className="relative" ref={tagDropRef}>
                  <button
                    onClick={() => { setShowTagDrop(v => !v); soundClick(); }}
                    className="ml-1 flex h-8 w-8 rounded-full items-center justify-center border border-dashed border-[#2ecc71] text-[#2ecc71] hover:bg-[#2ecc71]/8 transition-colors"
                    title="Tag a lead"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>

                  <AnimatePresence>
                    {showTagDrop && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0,  scale: 1 }}
                        exit={{    opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-2 w-[230px] bg-white border border-black/10 shadow-xl z-50 py-1 max-h-[280px] overflow-y-auto"
                      >
                        <p className="px-3 pt-2 pb-1.5 text-[10.5px] font-semibold text-black/35 uppercase tracking-wider">
                          Tag a representative
                        </p>
                        {CRR_REPS.map(rep => {
                          const isIn = !!tagged.find(t => t.id === rep.id);
                          return (
                            <button
                              key={rep.id}
                              onClick={() => toggleTagInDrop(rep)}
                              className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-black/[0.03] transition-colors"
                            >
                              <div className="h-7 w-7 rounded-full bg-[#2ecc71] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                {rep.initials}
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <p className="text-[13px] font-medium text-black/80 truncate">{rep.name}</p>
                                <p className="text-[11px] text-black/35 truncate">{rep.designation}</p>
                              </div>
                              {isIn && <Check className="h-3.5 w-3.5 text-[#2ecc71] shrink-0" />}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Task list */}
            <div className="flex-1 overflow-y-auto px-8 pt-6 pb-2">
              {/* Today */}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-black/35">Today</p>
              <div className="divide-y divide-black/5 mb-6">
                {todayTasks.length === 0 && (
                  <p className="py-3 text-[12.5px] text-black/20">No tasks for today — add one below.</p>
                )}
                {todayTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                    onOpenLead={lead => { setPanelLead(lead); soundOpen(); }}
                  />
                ))}
              </div>

              {/* Upcoming */}
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-black/35">Upcoming</p>
              <div className="divide-y divide-black/5">
                {upcomingTasks.length === 0 && (
                  <p className="py-3 text-[12.5px] text-black/20">Nothing upcoming.</p>
                )}
                {upcomingTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => toggleTask(task.id)}
                    onOpenLead={lead => { setPanelLead(lead); soundOpen(); }}
                  />
                ))}
              </div>
            </div>

            {/* ── Add task form ── */}
            <div className="border-t border-black/8 px-8 py-4 shrink-0 bg-white">

              {/* Tagged pills */}
              <AnimatePresence>
                {tagged.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{    opacity: 0, height: 0 }}
                    className="flex flex-wrap gap-1.5 mb-3 overflow-hidden"
                  >
                    {tagged.map(lead => (
                      <motion.span
                        key={lead.id}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{    opacity: 0, scale: 0.85 }}
                        className="flex items-center gap-1.5 bg-[#2ecc71]/10 border border-[#2ecc71]/20 px-2 py-1 text-[12px] text-[#1a7a40] font-medium"
                      >
                        <div className="h-4 w-4 rounded-full bg-[#2ecc71] flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                          {lead.initials}
                        </div>
                        @{lead.name.split(' ')[0]}
                        <button
                          onClick={() => removeTagged(lead.id)}
                          className="text-[#2ecc71]/50 hover:text-[#2ecc71] transition-colors ml-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.span>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-2">
                {/* Today / Upcoming toggle */}
                <button
                  onClick={() => { setNewList(v => v === 'today' ? 'upcoming' : 'today'); soundTab(); }}
                  className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[#2ecc71] border border-[#2ecc71]/30 px-2.5 py-2 hover:bg-[#2ecc71]/8 transition-colors whitespace-nowrap"
                >
                  {newList === 'today' ? 'Today' : 'Upcoming'}
                  <ChevronDown className="h-3 w-3" />
                </button>

                {/* Text input + @ mention dropdown */}
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    value={newText}
                    onChange={handleTextChange}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !mentionQuery) addTask();
                      if (e.key === 'Escape') { setMentionQuery(null); setShowTagDrop(false); }
                    }}
                    placeholder="Add a task… type @ to tag a representative"
                    className="w-full border border-black/12 px-3 py-2 text-[13px] text-black/70 placeholder-black/25 outline-none focus:border-[#2ecc71] transition-colors"
                  />

                  {/* @ mention dropdown */}
                  <AnimatePresence>
                    {mentionQuery !== null && mentionResults.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{    opacity: 0, y: 6 }}
                        transition={{ duration: 0.1 }}
                        className="absolute bottom-full left-0 mb-1.5 w-[240px] bg-white border border-black/10 shadow-xl z-50 py-1 max-h-[220px] overflow-y-auto"
                      >
                        <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold text-black/35 uppercase tracking-wider">
                          Tag a representative
                        </p>
                        {mentionResults.map(rep => (
                          <button
                            key={rep.id}
                            onMouseDown={e => { e.preventDefault(); selectMention(rep); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 hover:bg-[#2ecc71]/8 transition-colors"
                          >
                            <div className="h-7 w-7 rounded-full bg-[#2ecc71] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                              {rep.initials}
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-[13px] font-medium text-black/80 truncate">{rep.name}</p>
                              <p className="text-[11px] text-black/35 truncate">{rep.designation}</p>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Submit */}
                <button
                  onClick={addTask}
                  disabled={!newText.trim()}
                  className="shrink-0 flex items-center gap-1.5 bg-[#2ecc71] hover:bg-[#27af61] disabled:opacity-35 text-white text-[13px] font-semibold px-4 py-2 transition-colors whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* LeadPanel reused for tagged-lead click-throughs */}
      <LeadPanel lead={panelLead} onClose={() => { setPanelLead(null); soundClose(); }} />
    </div>
  );
}

export default Tasks;
