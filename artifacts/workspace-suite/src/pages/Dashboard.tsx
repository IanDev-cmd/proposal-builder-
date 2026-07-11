import { useState } from 'react';
import { Menu, Search, MoreHorizontal, Plus, Check } from 'lucide-react';
import { ProfileModal } from '@/components/ProfileModal';

type Status = 'Approved' | 'In Progress' | 'In Review' | 'Waiting';

type Task = {
  id: string;
  label: string;
  status: Status;
  done: boolean;
};

const initialToday: Task[] = [
  { id: 't1', label: 'Create initial layout for homepage', status: 'Approved', done: true },
  { id: 't2', label: 'Fixing icons with transparent background', status: 'In Progress', done: true },
  { id: 't3', label: 'Fixing icons with transparent background', status: 'In Progress', done: true },
  { id: 't4', label: 'Create initial layout for homepage', status: 'In Progress', done: true },
  { id: 't5', label: 'Discussions regarding workflow improvement', status: 'In Review', done: false },
  { id: 't6', label: 'Create quotation for app redesign project', status: 'Waiting', done: false },
];

const initialUpcoming: Task[] = [
  { id: 'u1', label: 'Create initial layout for homepage', status: 'Waiting', done: false },
  { id: 'u2', label: 'Discussions regarding workflow improvement', status: 'Waiting', done: false },
  { id: 'u3', label: 'Fixing icons with transparent background', status: 'Waiting', done: false },
];

const statusStyles: Record<Status, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  'In Progress': 'bg-emerald-200 text-emerald-800',
  'In Review': 'bg-emerald-50 text-emerald-600',
  Waiting: 'bg-gray-100 text-gray-500',
};

type Project = {
  initials: string;
  label: string;
  gradient: string;
  badge?: boolean;
  isCount?: boolean;
};

const projects: Project[] = [
  { initials: 'GH', label: 'Green House', gradient: 'from-emerald-400 to-emerald-500' },
  { initials: 'CP', label: 'Cyber Punk', gradient: 'from-emerald-400 to-emerald-600', badge: true },
  { initials: 'EC', label: 'Easy Crypto', gradient: 'from-emerald-500 to-emerald-700' },
  { initials: 'TA', label: 'Travel App', gradient: 'from-emerald-400 to-emerald-500' },
  { initials: 'LP', label: 'Landing Page', gradient: 'from-emerald-500 to-emerald-700', badge: true },
  { initials: '8+', label: '', gradient: '', isCount: true },
];

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
  const [today, setToday] = useState(initialToday);
  const [upcoming, setUpcoming] = useState(initialUpcoming);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileIndex, setProfileIndex] = useState(0);

  const toggleToday = (id: string) =>
    setToday((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const toggleUpcoming = (id: string) =>
    setUpcoming((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const openProfile = (i: number) => {
    setProfileIndex(i);
    setProfileOpen(true);
  };

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

          <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2.5 ring-1 ring-white/10">
            <Search className="h-4 w-4 text-white/40" />
            <span className="text-[13px] text-white/40">Search Task or Project...</span>
          </div>

          <div className="mt-8">
            <p className="text-[13px] font-medium text-white/70">
              Projects <span className="text-white/30">(13)</span>
            </p>

            <div className="mt-4 grid grid-cols-3 gap-4">
              {projects.map((project, i) => (
                <div key={i} className="flex flex-col items-start gap-2">
                  {project.isCount ? (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-[15px] font-semibold text-white ring-1 ring-white/10">
                      8+
                    </div>
                  ) : (
                    <div
                      className={`relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${project.gradient} text-[15px] font-semibold text-[#0a0a0a] shadow-lg`}
                    >
                      {project.initials}
                      {project.badge && (
                        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#0a0a0a] bg-white" />
                      )}
                    </div>
                  )}
                  {project.label && (
                    <span className="text-[11px] text-white/50">{project.label}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="absolute bottom-6 left-8 grid grid-cols-4 gap-1.5 opacity-40">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-white" />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto bg-[#0e0e0e] p-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[22px] font-semibold text-white">Cyber Punk</h2>
              <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-white/40">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
                incididunt
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
            {today.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={toggleToday} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-white/80">Upcoming</h3>
            <MoreHorizontal className="h-4 w-4 text-white/20" />
          </div>
          <div className="mt-1 divide-y divide-white/5">
            {upcoming.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={toggleUpcoming} />
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
