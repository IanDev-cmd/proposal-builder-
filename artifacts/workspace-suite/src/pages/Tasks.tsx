import { useMemo, useState } from 'react';
import { Search, MoreHorizontal, Plus, Check, X } from 'lucide-react';
import { ProfileModal } from '@/components/ProfileModal';
import { soundClick, soundOpen, soundClose, soundTab, soundToggle } from '@/lib/sounds';

type Status = 'Approved' | 'In Progress' | 'In Review' | 'Waiting';

type Task = { id: string; label: string; status: Status; done: boolean };

type Project = {
  id: string;
  initials: string;
  label: string;
  badge?: boolean;
  isCount?: boolean;
  description: string;
  today: Task[];
  upcoming: Task[];
};

const PROJECTS: Project[] = [
  {
    id: 'green-house',
    initials: 'GH',
    label: 'Green House',
    description: 'Sustainable co-working space fit-out, phase 2 of the build-out plan.',
    today: [
      { id: 'gh1', label: 'Review contractor quotes for fit-out', status: 'In Review', done: false },
      { id: 'gh2', label: 'Confirm plant delivery schedule', status: 'Approved', done: true },
    ],
    upcoming: [{ id: 'gh3', label: 'Sign off on floor plan revisions', status: 'Waiting', done: false }],
  },
  {
    id: 'cyber-punk',
    initials: 'CP',
    label: 'Cyber Punk',
    badge: true,
    description: 'Brand identity refresh — typography, color system and component library.',
    today: [
      { id: 't1', label: 'Create initial layout for homepage', status: 'Approved', done: true },
      { id: 't2', label: 'Fixing icons with transparent background', status: 'In Progress', done: true },
      { id: 't3', label: 'Fixing icons with transparent background', status: 'In Progress', done: true },
      { id: 't4', label: 'Create initial layout for homepage', status: 'In Progress', done: true },
      { id: 't5', label: 'Discussions regarding workflow improvement', status: 'In Review', done: false },
      { id: 't6', label: 'Create quotation for app redesign project', status: 'Waiting', done: false },
    ],
    upcoming: [
      { id: 'u1', label: 'Create initial layout for homepage', status: 'Waiting', done: false },
      { id: 'u2', label: 'Discussions regarding workflow improvement', status: 'Waiting', done: false },
      { id: 'u3', label: 'Fixing icons with transparent background', status: 'Waiting', done: false },
    ],
  },
  {
    id: 'easy-crypto',
    initials: 'EC',
    label: 'Easy Crypto',
    description: 'Wallet onboarding flow redesign and exchange rate widget.',
    today: [
      { id: 'ec1', label: 'Wire up live exchange rate widget', status: 'In Progress', done: false },
      { id: 'ec2', label: 'QA the KYC upload flow', status: 'Waiting', done: false },
    ],
    upcoming: [{ id: 'ec3', label: 'Prepare release notes for v2.3', status: 'Waiting', done: false }],
  },
  {
    id: 'travel-app',
    initials: 'TA',
    label: 'Travel App',
    description: 'Itinerary builder and offline map caching for the mobile app.',
    today: [
      { id: 'ta1', label: 'Fix offline map cache invalidation bug', status: 'In Progress', done: false },
      { id: 'ta2', label: 'Design empty state for itinerary builder', status: 'Approved', done: true },
    ],
    upcoming: [{ id: 'ta3', label: 'User test the booking checkout flow', status: 'Waiting', done: false }],
  },
  {
    id: 'landing-page',
    initials: 'LP',
    label: 'Landing Page',
    badge: true,
    description: 'New marketing site launch, pricing section and testimonials.',
    today: [
      { id: 'lp1', label: 'Finalize pricing table copy', status: 'In Review', done: false },
      { id: 'lp2', label: 'Add customer testimonial carousel', status: 'In Progress', done: false },
    ],
    upcoming: [{ id: 'lp3', label: 'Set up analytics conversion events', status: 'Waiting', done: false }],
  },
  {
    id: 'more',
    initials: '8+',
    label: '',
    isCount: true,
    description: 'Eight more active projects across the workspace.',
    today: [],
    upcoming: [],
  },
];

const statusStyles: Record<Status, string> = {
  Approved:     'bg-[#2ecc71]/15 text-[#219251]',
  'In Progress':'bg-[#2ecc71]/25 text-[#19703e]',
  'In Review':  'bg-[#2ecc71]/8  text-[#27af61]',
  Waiting:      'bg-black/6 text-black/40',
};

function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { onToggle(task.id); soundToggle(); }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${
            task.done ? 'border-[#2ecc71] bg-[#2ecc71]' : 'border-black/20 bg-white hover:border-[#2ecc71]'
          }`}
          aria-label={task.done ? 'Mark undone' : 'Mark done'}
        >
          {task.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>
        <span className={`text-[13px] ${task.done ? 'text-black/30 line-through' : 'text-black/70'}`}>
          {task.label}
        </span>
      </div>
      <span className={`px-3 py-1 text-[11px] font-medium ${statusStyles[task.status]}`}>
        {task.status}
      </span>
    </div>
  );
}

export function Tasks() {
  const [projects, setProjects] = useState<Project[]>(PROJECTS);
  const [activeId, setActiveId] = useState('cyber-punk');
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileIndex, setProfileIndex] = useState(0);

  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  const toggleTask = (listKey: 'today' | 'upcoming', taskId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== activeId ? p : { ...p, [listKey]: p[listKey].map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) },
      ),
    );
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const matchedProjects = projects.filter((p) => p.label.toLowerCase().includes(q));
    const matchedTasks: { project: Project; task: Task }[] = [];
    projects.forEach((p) => {
      [...p.today, ...p.upcoming].forEach((t) => {
        if (t.label.toLowerCase().includes(q)) matchedTasks.push({ project: p, task: t });
      });
    });
    return { matchedProjects, matchedTasks };
  }, [projects, query]);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">
      {/* ── Left panel: green ── */}
      <div className="relative w-[380px] shrink-0 overflow-hidden bg-[#2ecc71] p-8">
        <div className="mt-4">
          <h1 className="text-[26px] font-semibold leading-tight text-[#0d2318]">Hi Samantha</h1>
          <p className="mt-1 text-[13px] text-[#0d2318]/55">
            Welcome back to the workspace, we missed you!
          </p>
        </div>

        {/* Search */}
        <div className="mt-6 flex items-center gap-2 bg-white/30 px-4 py-2.5 focus-within:bg-white/40 transition-colors">
          <Search className="h-4 w-4 shrink-0 text-[#0d2318]/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search task or project…"
            className="w-full bg-transparent text-[13px] text-[#0d2318] placeholder-[#0d2318]/45 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#0d2318]/40 hover:text-[#0d2318]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchResults ? (
          <div className="mt-5 max-h-[400px] space-y-4 overflow-y-auto">
            {searchResults.matchedProjects.length === 0 && searchResults.matchedTasks.length === 0 && (
              <p className="text-[12.5px] text-[#0d2318]/50">No matches for "{query}".</p>
            )}
            {searchResults.matchedProjects.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#0d2318]/50">Projects</p>
                <div className="space-y-1.5">
                  {searchResults.matchedProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setActiveId(p.id); setQuery(''); }}
                      className="flex w-full items-center gap-2.5 px-2 py-1.5 text-left text-[13px] text-[#0d2318]/80 hover:bg-white/20 transition-colors"
                    >
                      <span className="flex h-7 w-7 items-center justify-center bg-white text-[10px] font-bold text-[#2ecc71]">
                        {p.initials}
                      </span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {searchResults.matchedTasks.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#0d2318]/50">Tasks</p>
                <div className="space-y-1.5">
                  {searchResults.matchedTasks.map(({ project, task }) => (
                    <button
                      key={task.id}
                      onClick={() => { setActiveId(project.id); setQuery(''); }}
                      className="flex w-full flex-col items-start px-2 py-1.5 text-left hover:bg-white/20 transition-colors"
                    >
                      <span className="text-[13px] text-[#0d2318]/80">{task.label}</span>
                      <span className="text-[11px] text-[#0d2318]/45">{project.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-[13px] font-medium text-[#0d2318]/70">
              Projects <span className="text-[#0d2318]/40">(13)</span>
            </p>
            <div className="mt-4 grid grid-cols-3 gap-4">
              {projects.map((project) => {
                const isActive = project.id === activeId;
                return (
                  <button
                    key={project.id}
                    onClick={() => { setActiveId(project.id); soundTab(); }}
                    className="flex flex-col items-start gap-2 text-left"
                  >
                    {project.isCount ? (
                      <div className="flex h-16 w-16 items-center justify-center bg-white/20 text-[15px] font-semibold text-[#0d2318]">
                        8+
                      </div>
                    ) : (
                      <div
                        className={`relative flex h-16 w-16 items-center justify-center bg-white text-[15px] font-bold text-[#2ecc71] transition-transform ${
                          isActive ? 'scale-105 ring-2 ring-[#0d2318]/30 ring-offset-2 ring-offset-[#2ecc71]' : 'hover:scale-105'
                        }`}
                      >
                        {project.initials}
                        {project.badge && (
                          <span className="absolute -right-1 -top-1 h-3 w-3 border-2 border-[#2ecc71] bg-[#0d2318]" />
                        )}
                      </div>
                    )}
                    {project.label && (
                      <span className={`text-[11px] ${isActive ? 'text-[#0d2318]' : 'text-[#0d2318]/55'}`}>
                        {project.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: white ── */}
      <div className="relative flex flex-1 flex-col overflow-y-auto border-l border-black/8 bg-white p-8">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[22px] font-semibold text-black">{active.label || 'Project'}</h2>
            <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-black/40">{active.description}</p>
          </div>
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  onClick={() => { setProfileIndex(i); setProfileOpen(true); soundOpen(); }}
                  className="h-8 w-8 rounded-full border-2 border-white bg-[#2ecc71] transition-transform hover:z-10 hover:scale-110 flex items-center justify-center text-[10px] font-bold text-white"
                  aria-label={`Open profile ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={soundClick}
              className="ml-2 flex h-8 w-8 rounded-full items-center justify-center border border-dashed border-[#2ecc71] text-[#2ecc71]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-black/70">Today</h3>
          <MoreHorizontal className="h-4 w-4 text-black/20" />
        </div>
        <div className="mt-1 divide-y divide-black/5">
          {active.today.length === 0 && <p className="py-3 text-[12.5px] text-black/30">No tasks for today.</p>}
          {active.today.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={(id) => toggleTask('today', id)} />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-black/70">Upcoming</h3>
          <MoreHorizontal className="h-4 w-4 text-black/20" />
        </div>
        <div className="mt-1 divide-y divide-black/5">
          {active.upcoming.length === 0 && <p className="py-3 text-[12.5px] text-black/30">Nothing upcoming.</p>}
          {active.upcoming.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={(id) => toggleTask('upcoming', id)} />
          ))}
        </div>

        {/* FAB */}
        <button className="absolute bottom-6 right-6 flex h-12 w-12 items-center justify-center bg-[#2ecc71] text-white shadow-lg transition-transform hover:scale-105">
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <ProfileModal open={profileOpen} index={profileIndex} onClose={() => { setProfileOpen(false); soundClose(); }} />
    </div>
  );
}

export default Tasks;
