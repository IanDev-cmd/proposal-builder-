import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Check, X, ChevronDown, Tag, Trash2 } from 'lucide-react';
import { LeadPanel, type Lead } from '@/components/LeadPanel';
import { soundClick, soundOpen, soundClose, soundTab, soundToggle } from '@/lib/sounds';
import { loadRepTasks, saveRepTasks } from '@/lib/taskStore';
import { Avatar } from '@/components/Avatar';
import { personAvatarUrl } from '@/lib/avatar';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Client Relationship Representatives ───────────────────────────────────────
// Exported so other pages (e.g. Calendar) can resolve a task's repId to a name.
export const CRR_REPS: Lead[] = [
  { id: 9001, name: 'Katherine',  initials: 'KA', email: '', code: 'CRR-1', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9002, name: 'Sapphire',   initials: 'SA', email: '', code: 'CRR-2', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9003, name: 'Elizabeth',  initials: 'EL', email: '', code: 'CRR-3', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9004, name: 'Lily-May',   initials: 'LM', email: '', code: 'CRR-4', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
  { id: 9005, name: 'Natasha',    initials: 'NA', email: '', code: 'CRR-5', designation: 'Client Relationship Rep', phone: '', joined: '', color: '#2ecc71', sector: '', referenceNumber: '', source: '', company: '' },
];

// ── Email accounts (column L) ─────────────────────────────────────────────────
const EMAIL_ACCOUNTS = [
  'WEOTT Info',
  'WEOTT Sales',
  'WEOTT Sapphire',
  'WEOTT Katherine',
  'WEOTT Elizabeth',
  'WEOTT Lily',
];

// ── Default task types (users can add their own) ──────────────────────────────
const DEFAULT_TASK_TYPES = [
  'Follow Up',
  'Send Proposal',
  'Chase Payment',
  'Book Venue',
  'Confirm Details',
  'Send Contract',
  'Schedule Call',
  'Internal Review',
  'Client Update',
  'Site Visit',
];

// ── Task model ────────────────────────────────────────────────────────────────
type TaskList = 'today' | 'upcoming';

type TaskItem = {
  id:           string;
  text:         string;
  done:         boolean;
  tagged:       Lead[];
  list:         TaskList;
  taskType:     string;
  emailAccount: string;
  date:         string; // ISO yyyy-mm-dd — the calendar day this task is scheduled for
};

type RepTasks = Record<string, TaskItem[]>;

// ── TaskRow ───────────────────────────────────────────────────────────────────
function TaskRow({
  task,
  onToggle,
  onOpenRep,
  onDelete,
}: {
  task:      TaskItem;
  onToggle:  () => void;
  onOpenRep: (rep: Lead) => void;
  onDelete:  () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 group">
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

      <div className="flex-1 min-w-0">
        <span className={`text-[13px] leading-snug ${task.done ? 'text-black/30 line-through' : 'text-black/70'}`}>
          {task.text}
        </span>
        {task.taskType && (
          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-black/5 text-black/40 align-middle">
            {task.taskType}
          </span>
        )}
        {task.emailAccount && (
          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-400 align-middle">
            {task.emailAccount}
          </span>
        )}
      </div>

      {task.tagged.length > 0 && (
        <div className="flex -space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {task.tagged.slice(0, 3).map(rep => (
            <button
              key={rep.id}
              onClick={() => onOpenRep(rep)}
              title={rep.name}
              className="h-6 w-6 rounded-full border-2 border-white overflow-hidden hover:z-10 hover:scale-110 transition-transform"
            >
              <Avatar
                src={personAvatarUrl(rep)}
                alt={rep.name}
                fallbackText={rep.initials}
                className="h-full w-full text-[9px]"
              />
            </button>
          ))}
          {task.tagged.length > 3 && (
            <div className="h-6 w-6 rounded-full bg-black/10 border-2 border-white flex items-center justify-center text-[9px] font-semibold text-black/50">
              +{task.tagged.length - 3}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => { onDelete(); soundClick(); }}
        title="Delete task"
        className="shrink-0 flex h-6 w-6 items-center justify-center text-black/20 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── TypePicker ────────────────────────────────────────────────────────────────
function TypePicker({
  value,
  allTypes,
  onSelect,
  onAddNew,
}: {
  value:    string;
  allTypes: string[];
  onSelect: (t: string) => void;
  onAddNew: (t: string) => void;
}) {
  const [open,  setOpen]  = useState(false);
  const [q,     setQ]     = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = q.trim()
    ? allTypes.filter(t => t.toLowerCase().includes(q.toLowerCase()))
    : allTypes;

  const canCreate = q.trim() && !allTypes.some(t => t.toLowerCase() === q.trim().toLowerCase());

  const handleSelect = (t: string) => {
    onSelect(t);
    setOpen(false);
    setQ('');
    soundClick();
  };

  const handleCreate = () => {
    if (!q.trim()) return;
    onAddNew(q.trim());
    onSelect(q.trim());
    setOpen(false);
    setQ('');
    soundClick();
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); soundClick(); }}
        className={`flex items-center gap-1.5 border px-2.5 py-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
          value
            ? 'border-[#2ecc71]/40 bg-[#2ecc71]/8 text-[#1a7a40]'
            : 'border-black/12 text-black/35 hover:border-black/25'
        }`}
        title="Set task type"
      >
        <Tag className="h-3 w-3 shrink-0" />
        <span>{value || 'Type'}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{    opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.1 }}
            className="absolute top-full left-0 mt-1.5 w-[220px] bg-white border border-black/10 shadow-xl z-50 pb-1"
          >
            {/* Search / create input */}
            <div className="flex items-center gap-2 border-b border-black/8 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-black/30" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
                placeholder="Search or add new…"
                className="w-full bg-transparent text-[12px] text-black/70 placeholder-black/30 outline-none"
              />
              {q && <button onClick={() => setQ('')} className="text-black/30 hover:text-black/60"><X className="h-3 w-3" /></button>}
            </div>

            <div className="max-h-[200px] overflow-y-auto pt-0.5">
              {/* Clear selection */}
              {value && (
                <button
                  onClick={() => handleSelect('')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-black/35 hover:bg-black/[0.03] transition-colors italic"
                >
                  Clear type
                </button>
              )}

              {filtered.map(t => (
                <button
                  key={t}
                  onClick={() => handleSelect(t)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[12px] text-black/70 hover:bg-black/[0.03] transition-colors"
                >
                  {t}
                  {value === t && <Check className="h-3 w-3 text-[#2ecc71] shrink-0" />}
                </button>
              ))}

              {canCreate && (
                <button
                  onClick={handleCreate}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-[12px] text-[#2ecc71] font-medium hover:bg-[#2ecc71]/8 transition-colors border-t border-black/5 mt-0.5"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Add "{q.trim()}"
                </button>
              )}

              {filtered.length === 0 && !canCreate && (
                <p className="px-3 py-3 text-[12px] text-black/25">No matches</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── EmailPicker ───────────────────────────────────────────────────────────────
function EmailPicker({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); soundClick(); }}
        className={`flex items-center gap-1.5 border px-2.5 py-2 text-[11px] font-medium transition-colors whitespace-nowrap ${
          value
            ? 'border-blue-200 bg-blue-50 text-blue-500'
            : 'border-black/12 text-black/35 hover:border-black/25'
        }`}
        title="Email account used"
      >
        <span>✉</span>
        <span className="max-w-[90px] truncate">{value || 'Email'}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{    opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.1 }}
            className="absolute top-full left-0 mt-1.5 w-[200px] bg-white border border-black/10 shadow-xl z-50 py-1"
          >
            <p className="px-3 pt-2 pb-1.5 text-[10.5px] font-semibold text-black/35 uppercase tracking-wider">
              Email account used
            </p>
            {value && (
              <button
                onClick={() => { onSelect(''); setOpen(false); soundClick(); }}
                className="flex w-full items-center px-3 py-2 text-[12px] text-black/35 hover:bg-black/[0.03] italic"
              >
                Clear
              </button>
            )}
            {EMAIL_ACCOUNTS.map(acct => (
              <button
                key={acct}
                onClick={() => { onSelect(acct); setOpen(false); soundClick(); }}
                className="flex w-full items-center justify-between px-3 py-2 text-[12px] text-black/70 hover:bg-black/[0.03] transition-colors"
              >
                {acct}
                {value === acct && <Check className="h-3 w-3 text-[#2ecc71] shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function Tasks() {
  // Active rep
  const [activeRepId,  setActiveRepId]  = useState<string>(String(CRR_REPS[0].id));

  // Tasks per rep — persisted to localStorage so the Calendar page can read them
  const [tasksByRep,   setTasksByRep]   = useState<RepTasks>(() => loadRepTasks() as RepTasks);

  useEffect(() => {
    saveRepTasks(tasksByRep);
  }, [tasksByRep]);

  // Rep detail panel (reuse LeadPanel)
  const [panelRep, setPanelRep] = useState<Lead | null>(null);

  // Left-panel search
  const [query, setQuery] = useState('');

  // Task types (default + user-added)
  const [taskTypes, setTaskTypes] = useState<string[]>(DEFAULT_TASK_TYPES);

  // New task form
  const [newText,         setNewText]         = useState('');
  const [newList,         setNewList]         = useState<TaskList>('today');
  const [newTaskType,     setNewTaskType]      = useState('');
  const [newEmailAccount, setNewEmailAccount]  = useState('');
  const [newDate,         setNewDate]          = useState(todayIso());
  const [tagged,          setTagged]          = useState<Lead[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showTagDrop,  setShowTagDrop]  = useState(false);

  const inputRef   = useRef<HTMLInputElement>(null);
  const tagDropRef = useRef<HTMLDivElement>(null);

  // Close tag dropdown on outside click
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
  const activeRep    = CRR_REPS.find(r => String(r.id) === activeRepId) ?? CRR_REPS[0];
  const activeKey    = activeRepId;
  const activeTasks  = tasksByRep[activeKey] ?? [];
  const todayTasks   = activeTasks.filter(t => t.list === 'today');
  const upcomingTasks = activeTasks.filter(t => t.list === 'upcoming');

  const allTagged = useMemo(() => {
    const seen = new Set<string>();
    const result: Lead[] = [];
    activeTasks.forEach(t =>
      t.tagged.forEach(r => {
        const k = String(r.id);
        if (!seen.has(k)) { seen.add(k); result.push(r); }
      }),
    );
    return result;
  }, [activeTasks]);

  const filteredReps = query.trim()
    ? CRR_REPS.filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
    : CRR_REPS;

  // @ mention candidates
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

  const selectMention = useCallback((rep: Lead) => {
    setNewText(prev => {
      const lastAt = prev.lastIndexOf('@');
      return prev.slice(0, lastAt) + `@${rep.name} `;
    });
    setMentionQuery(null);
    setTagged(prev => prev.find(t => t.id === rep.id) ? prev : [...prev, rep]);
    soundClick();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const addTask = useCallback(() => {
    if (!newText.trim()) return;
    const task: TaskItem = {
      id:           `task-${Date.now()}`,
      text:         newText.trim(),
      done:         false,
      tagged,
      list:         newList,
      taskType:     newTaskType,
      emailAccount: newEmailAccount,
      date:         newDate,
    };
    setTasksByRep(prev => ({
      ...prev,
      [activeKey]: [...(prev[activeKey] ?? []), task],
    }));
    setNewText('');
    setTagged([]);
    setMentionQuery(null);
    soundClick();
  }, [newText, activeKey, tagged, newList, newTaskType, newEmailAccount, newDate]);

  const toggleTask = useCallback((taskId: string) => {
    setTasksByRep(prev => ({
      ...prev,
      [activeKey]: (prev[activeKey] ?? []).map(t =>
        t.id === taskId ? { ...t, done: !t.done } : t,
      ),
    }));
  }, [activeKey]);

  const deleteTask = useCallback((taskId: string) => {
    setTasksByRep(prev => ({
      ...prev,
      [activeKey]: (prev[activeKey] ?? []).filter(t => t.id !== taskId),
    }));
  }, [activeKey]);

  const removeTagged = (repId: number | string) =>
    setTagged(prev => prev.filter(t => t.id !== repId));

  const toggleTagInDrop = (rep: Lead) => {
    const isIn = tagged.find(t => t.id === rep.id);
    if (isIn) { removeTagged(rep.id); }
    else       { setTagged(prev => [...prev, rep]); soundClick(); }
  };

  // ── Render ──
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">

      {/* ── Left panel — Representatives (only the selected rep gets a green rectangle) ── */}
      <div className="flex w-[300px] shrink-0 flex-col overflow-hidden bg-white border-r border-black/8 p-7">
        <div className="mt-4">
          <h1 className="text-[22px] font-semibold leading-tight text-black">Representatives</h1>
          <p className="mt-1 text-[12px] text-black/45">Select a rep to manage their tasks</p>
        </div>

        {/* Search */}
        <div className="mt-5 flex items-center gap-2 bg-black/5 px-3.5 py-2.5 focus-within:bg-black/8 transition-colors shrink-0">
          <Search className="h-3.5 w-3.5 shrink-0 text-black/35" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search representatives…"
            className="w-full bg-transparent text-[12.5px] text-black/70 placeholder-black/30 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-black/30 hover:text-black/60">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Rep list */}
        <div className="mt-5 flex-1 overflow-y-auto flex flex-col gap-2">
          {filteredReps.map(rep => {
            const isActive   = String(rep.id) === activeRepId;
            const taskCount  = (tasksByRep[String(rep.id)] ?? []).length;
            const doneCount  = (tasksByRep[String(rep.id)] ?? []).filter(t => t.done).length;
            return (
              <button
                key={rep.id}
                onClick={() => { setActiveRepId(String(rep.id)); soundTab(); }}
                className={`flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  isActive
                    ? 'bg-[#2ecc71]'
                    : 'hover:bg-black/5'
                }`}
              >
                <div className={`relative h-12 w-12 rounded-full shrink-0 transition-transform overflow-hidden ${
                  isActive ? 'scale-105' : ''
                }`}>
                  <Avatar
                    src={personAvatarUrl(rep)}
                    alt={rep.name}
                    fallbackText={rep.initials}
                    className={`h-full w-full text-[15px] ${isActive ? 'bg-white text-[#2ecc71]' : 'bg-black/5 text-black/50'}`}
                  />
                  {taskCount > 0 && (
                    <span className={`absolute -right-0.5 -top-0.5 h-[18px] min-w-[18px] px-[3px] rounded-full bg-[#0d2318] border-2 flex items-center justify-center text-[9px] font-bold text-white leading-none ${
                      isActive ? 'border-[#2ecc71]' : 'border-white'
                    }`}>
                      {taskCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold truncate ${isActive ? 'text-white' : 'text-black/80'}`}>
                    {rep.name}
                  </p>
                  {taskCount > 0 ? (
                    <p className={`text-[11px] mt-0.5 ${isActive ? 'text-white/75' : 'text-black/40'}`}>
                      {doneCount}/{taskCount} done
                    </p>
                  ) : (
                    <p className={`text-[11px] mt-0.5 ${isActive ? 'text-white/60' : 'text-black/35'}`}>No tasks yet</p>
                  )}
                </div>
              </button>
            );
          })}

          {filteredReps.length === 0 && (
            <p className="text-[12px] text-black/40 px-2">No representatives match.</p>
          )}
        </div>
      </div>

      {/* ── Right panel (white) ── */}
      <div className="relative flex flex-1 flex-col overflow-hidden border-l border-black/8 bg-white">
        <>
          {/* Header */}
          <div className="flex items-start justify-between border-b border-black/8 px-8 py-5 shrink-0">
            <div>
              <h2 className="text-[22px] font-semibold text-black">{activeRep.name}</h2>
              <p className="mt-0.5 text-[12px] text-black/40">{activeRep.designation}</p>
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
                    {allTagged.slice(0, 5).map(rep => (
                      <motion.button
                        key={rep.id}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        onClick={() => { setPanelRep(rep); soundOpen(); }}
                        title={rep.name}
                        className="h-8 w-8 rounded-full border-2 border-white overflow-hidden hover:z-10 hover:scale-110 transition-transform"
                      >
                        <Avatar
                          src={personAvatarUrl(rep)}
                          alt={rep.name}
                          fallbackText={rep.initials}
                          className="h-full w-full text-[10px]"
                        />
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

              {/* + dropdown to tag a rep */}
              <div className="relative" ref={tagDropRef}>
                <button
                  onClick={() => { setShowTagDrop(v => !v); soundClick(); }}
                  className="ml-1 flex h-8 w-8 rounded-full items-center justify-center border border-dashed border-[#2ecc71] text-[#2ecc71] hover:bg-[#2ecc71]/8 transition-colors"
                  title="Tag a representative"
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
                            <Avatar
                              src={personAvatarUrl(rep)}
                              alt={rep.name}
                              fallbackText={rep.initials}
                              className="h-7 w-7 text-[10px] shrink-0"
                            />
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

          {/* ── Add task form (top) ── */}
          <div className="border-b border-black/8 px-8 py-4 shrink-0 bg-white">

            {/* Tagged pills */}
            <AnimatePresence>
              {tagged.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{    opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-1.5 mb-3 overflow-hidden"
                >
                  {tagged.map(rep => (
                    <motion.span
                      key={rep.id}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{    opacity: 0, scale: 0.85 }}
                      className="flex items-center gap-1.5 bg-[#2ecc71]/10 border border-[#2ecc71]/20 px-2 py-1 text-[12px] text-[#1a7a40] font-medium"
                    >
                      <Avatar
                        src={personAvatarUrl(rep)}
                        alt={rep.name}
                        fallbackText={rep.initials}
                        className="h-4 w-4 text-[8px] shrink-0"
                      />
                      @{rep.name.split(' ')[0]}
                      <button
                        onClick={() => removeTagged(rep.id)}
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

              {/* Task type picker */}
              <TypePicker
                value={newTaskType}
                allTypes={taskTypes}
                onSelect={setNewTaskType}
                onAddNew={t => setTaskTypes(prev => [...prev, t])}
              />

              {/* Email account picker */}
              <EmailPicker value={newEmailAccount} onSelect={setNewEmailAccount} />

              {/* Calendar date — determines which day this task appears on in Calendar */}
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                title="Date this task is scheduled for"
                className="shrink-0 border border-black/12 px-2.5 py-2 text-[11px] font-medium text-black/60 outline-none focus:border-[#2ecc71] transition-colors"
              />

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
                      className="absolute top-full left-0 mt-1.5 w-[240px] bg-white border border-black/10 shadow-xl z-50 py-1 max-h-[220px] overflow-y-auto"
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
                          <Avatar
                            src={personAvatarUrl(rep)}
                            alt={rep.name}
                            fallbackText={rep.initials}
                            className="h-7 w-7 text-[10px] shrink-0"
                          />
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
                  onOpenRep={rep => { setPanelRep(rep); soundOpen(); }}
                  onDelete={() => deleteTask(task.id)}
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
                  onOpenRep={rep => { setPanelRep(rep); soundOpen(); }}
                  onDelete={() => deleteTask(task.id)}
                />
              ))}
            </div>
          </div>
        </>
      </div>

      {/* LeadPanel reused for tagged-rep click-throughs */}
      <LeadPanel lead={panelRep} onClose={() => { setPanelRep(null); soundClose(); }} />
    </div>
  );
}

export default Tasks;
