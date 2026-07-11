import { useMemo, useState } from 'react';
import { Menu, Search, MoreHorizontal, Plus, Check, X } from 'lucide-react';
import { ProfileModal } from '@/components/ProfileModal';

type Status = 'Approved' | 'In Progress' | 'In Review' | 'Waiting';

type Task = {
  id: string;
  label: string;
  status: Status;
  done: boolean;
};

type Project = {
  id: string;
  initials: string;
  label: string;
  gradient: string;
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
    gradient: 'from-emerald-400 to-emerald-500',
    description: 'Sustainable co-working space fit-out, phase 2 of the build-out plan.',
    today: [
      { id: 'gh1', label: 'Review contractor quotes for fit-out', status: 'In Review', done: false },
      { id: 'gh2', label: 'Confirm plant delivery schedule', status: 'Approved', done: true },
    ],
    upcoming: [
      { id: 'gh3', label: 'Sign off on floor plan revisions', status: 'Waiting', done: false },
    ],
  },
  {
    id: 'cyber-punk',
    initials: 'CP',
    label: 'Cyber Punk',
    gradient: 'from-emerald-400 to-emerald-600',
    badge: true,
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt',
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
    gradient: 'from-emerald-500 to-emerald-700',
    description: 'Wallet onboarding flow redesign and exchange rate widget.',
    today: [
      { id: 'ec1', label: 'Wire up live exchange rate widget', status: 'In Progress', done: false },
      { id: 'ec2', label: 'QA the KYC upload flow', status: 'Waiting', done: false },
    ],
    upcoming: [
      { id: 'ec3', label: 'Prepare release notes for v2.3', status: 'Waiting', done: false },
    ],
  },
  {
    id: 'travel-app',
    initials: 'TA',
    label: 'Travel App',
    gradient: 'from-emerald-400 to-emerald-500',
    description: 'Itinerary builder and offline map caching for the mobile app.',
    today: [
      { id: 'ta1', label: 'Fix offline map cache invalidation bug', status: 'In Progress', done: false },
      { id: 'ta2', label: 'Design empty state for itinerary builder', status: 'Approved', done: true },
    ],
    upcoming: [
      { id: 'ta3', label: 'User test the booking checkout flow', status: 'Waiting', done: false },
    ],
  },
  {
    id: 'landing-page',
    initials: 'LP',
    label: 'Landing Page',
    gradient: 'from-emerald-500 to-emerald-700',
    badge: true,
    description: 'New marketing site launch, pricing section and testimonials.',
    today: [
      { id: 'lp1', label: 'Finalize pricing table copy', status: 'In Review', done: false },
      { id: 'lp2', label: 'Add customer testimonial carousel', status: 'In Progress', done: false },
    ],
    upcoming: [
      { id: 'lp3', label: 'Set up analytics conversion events', status: 'Waiting', done: false },
    ],
  },
  {
    id: 'more',
    initials: '8+',
    label: '',
    gradient: '',
    isCount: true,
    description: 'Eight more active projects across the workspace.',
    today: [],
    upcoming: [],
  },
];

const statusStyles: Record<Status, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  'In Progress': 'bg-emerald-200 text-emerald-800',
  'In Review': 'bg-emerald-50 text-emerald-600',
  Waiting: 'bg-gray-100 text-gray-500',
};

function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggle(task.id)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            task.done ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 bg-white hover:border-emerald-400'
          }`}
          aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
        >
          {task.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>
        <span
          className={`text-[13px] ${task.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}
        >
          {task.label}
        </span>
      </div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${statusStyles[task.status]}`}>
        {task.status}
      </span>
    </div>
  );
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>(PROJECTS);
  const [activeId, setActiveId] = useState('cyber-punk');
  const [query, setQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileIndex, setProfileIndex] = useState(0);

  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  const toggleTask = (listKey: 'today' | 'upcoming', taskId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== activeId
          ? p
          : {
              ...p,
              [listKey]: p[listKey].map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
            },
      ),
    );
  };

  const openProfile = (i: number) => {
    setProfileIndex(i);
    setProfileOpen(true);
  };

  // Real search: matches against project names and task labels, across all projects.
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
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-[#0a0a0a]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent opacity-60 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-emerald-500/20 via-emerald-500/10 to-transparent opacity-50 blur-3xl" />
      </div>

      <div className="relative flex min-h-[calc(100vh-4rem)] w-full bg-[#0a0a0a] shadow-2xl ring-1 ring-white/10">
        <div className="relative w-[420px] shrink-0 overflow-hidden bg-gradient-to-br from-[#101010] via-[#0c0c0c] to-[#050505] p-8 text-white ring-1 ring-white/5">
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <Menu className="h-4 w-4" />
          </button>

          <div className="mt-10">
            <h1 className="text-[26px] font-semibold leading-tight">Hi Samantha</h1>
            <p className="mt-1 text-[13px] text-white/50">
              Welcome back to the workspace, we missed you!
            </p>
          </div>

          {/* real, working search */}
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 ring-1 ring-white/10 focus-within:ring-emerald-400/50">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Task or Project..."
              className="w-full bg-transparent text-[13px] text-white placeholder-white/40 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/70">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* live search results */}
          {searchResults ? (
            <div className="mt-5 max-h-[420px] space-y-4 overflow-y-auto">
              {searchResults.matchedProjects.length === 0 && searchResults.matchedTasks.length === 0 && (
                <p className="text-[12.5px] text-white/40">No matches for &ldquo;{query}&rdquo;.</p>
              )}

              {searchResults.matchedProjects.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">Projects</p>
                  <div className="space-y-1.5">
                    {searchResults.matchedProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveId(p.id);
                          setQuery('');
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-white/80 hover:bg-white/5"
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-semibold text-[#0a0a0a] bg-gradient-to-br ${p.gradient}`}
                        >
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
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/35">Tasks</p>
                  <div className="space-y-1.5">
                    {searchResults.matchedTasks.map(({ project, task }) => (
                      <button
                        key={task.id}
                        onClick={() => {
                          setActiveId(project.id);
                          setQuery('');
                        }}
                        className="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                      >
                        <span className="text-[13px] text-white/80">{task.label}</span>
                        <span className="text-[11px] text-white/35">{project.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-8">
              <p className="text-[13px] font-medium text-white/70">
                Projects <span className="text-white/30">(13)</span>
              </p>

              {/* clickable project leads — selecting one switches the task panel */}
              <div className="mt-4 grid grid-cols-3 gap-4">
                {projects.map((project) => {
                  const isActive = project.id === activeId;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setActiveId(project.id)}
                      className="flex flex-col items-start gap-2 text-left"
                    >
                      {project.isCount ? (
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-[15px] font-semibold text-white ring-1 ring-white/10">
                          8+
                        </div>
                      ) : (
                        <div
                          className={`relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${project.gradient} text-[15px] font-semibold text-[#0a0a0a] shadow-lg transition-transform ${
                            isActive ? 'scale-105 ring-2 ring-white ring-offset-2 ring-offset-[#0c0c0c]' : 'hover:scale-105'
                          }`}
                        >
                          {project.initials}
                          {project.badge && (
                            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#0a0a0a] bg-white" />
                          )}
                        </div>
                      )}
                      {project.label && (
                        <span className={`text-[11px] ${isActive ? 'text-white' : 'text-white/50'}`}>
                          {project.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="absolute bottom-6 left-8 grid grid-cols-4 gap-1.5 opacity-40">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-white" />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto bg-[#0e0e0e] p-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[22px] font-semibold text-white">{active.label || 'Project'}</h2>
              <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-white/40">
                {active.description}
              </p>
            </div>
            <div className="flex items-center">
              <div className="flex -space-x-2">
                <button
                  onClick={() => openProfile(0)}
                  className="h-8 w-8 rounded-full border-2 border-[#0e0e0e] bg-gradient-to-br from-emerald-300 to-emerald-500 transition-transform hover:z-10 hover:scale-110"
                  aria-label="Open profile 1"
                />
                <button
                  onClick={() => openProfile(1)}
                  className="h-8 w-8 rounded-full border-2 border-[#0e0e0e] bg-gradient-to-br from-emerald-300 to-emerald-600 transition-transform hover:z-10 hover:scale-110"
                  aria-label="Open profile 2"
                />
                <button
                  onClick={() => openProfile(2)}
                  className="h-8 w-8 rounded-full border-2 border-[#0e0e0e] bg-gradient-to-br from-emerald-300 to-emerald-500 transition-transform hover:z-10 hover:scale-110"
                  aria-label="Open profile 3"
                />
              </div>
              <button className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-emerald-400/50 text-emerald-400">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-white/80">Today</h3>
            <MoreHorizontal className="h-4 w-4 text-white/20" />
          </div>
          <div className="mt-1 divide-y divide-white/5">
            {active.today.length === 0 && (
              <p className="py-3 text-[12.5px] text-white/30">No tasks for today.</p>
            )}
            {active.today.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={(id) => toggleTask('today', id)} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-white/80">Upcoming</h3>
            <MoreHorizontal className="h-4 w-4 text-white/20" />
          </div>
          <div className="mt-1 divide-y divide-white/5">
            {active.upcoming.length === 0 && (
              <p className="py-3 text-[12.5px] text-white/30">Nothing upcoming.</p>
            )}
            {active.upcoming.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={(id) => toggleTask('upcoming', id)} />
            ))}
          </div>

          <button className="absolute -bottom-5 -right-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-[#0a0a0a] shadow-lg shadow-emerald-500/40 transition-transform hover:scale-105">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <ProfileModal open={profileOpen} index={profileIndex} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export default Dashboard;
