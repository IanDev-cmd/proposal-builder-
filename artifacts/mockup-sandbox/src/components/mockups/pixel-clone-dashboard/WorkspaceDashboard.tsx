import { Menu, Search, MoreHorizontal, Plus, Check } from "lucide-react";

type Task = {
  label: string;
  status: "Approved" | "In Progress" | "In Review" | "Waiting";
  done: boolean;
};

const todayTasks: Task[] = [
  { label: "Create initial layout for homepage", status: "Approved", done: true },
  { label: "Fixing icons with transparent background", status: "In Progress", done: true },
  { label: "Fixing icons with transparent background", status: "In Progress", done: true },
  { label: "Create initial layout for homepage", status: "In Progress", done: true },
  { label: "Discussions regarding workflow improvement", status: "In Review", done: false },
  { label: "Create quotation for app redesign project", status: "Waiting", done: false },
];

const upcomingTasks: Task[] = [
  { label: "Create initial layout for homepage", status: "Waiting", done: false },
  { label: "Discussions regarding workflow improvement", status: "Waiting", done: false },
  { label: "Fixing icons with transparent background", status: "Waiting", done: false },
];

const statusStyles: Record<Task["status"], string> = {
  Approved: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-lime-100 text-lime-700",
  "In Review": "bg-teal-100 text-teal-700",
  Waiting: "bg-gray-100 text-gray-500",
};

type Project = {
  initials: string;
  label: string;
  gradient: string;
  badge?: boolean;
  isCount?: boolean;
};

const projects: Project[] = [
  { initials: "GH", label: "Green House", gradient: "from-emerald-400 to-teal-500" },
  { initials: "CP", label: "Cyber Punk", gradient: "from-lime-400 to-emerald-600", badge: true },
  { initials: "EC", label: "Easy Crypto", gradient: "from-teal-500 to-emerald-700" },
  { initials: "TA", label: "Travel App", gradient: "from-green-400 to-lime-500" },
  { initials: "LP", label: "Landing Page", gradient: "from-emerald-500 to-green-700", badge: true },
  { initials: "8+", label: "", gradient: "", isCount: true },
];

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            task.done
              ? "border-emerald-500 bg-emerald-500"
              : "border-gray-300 bg-white"
          }`}
        >
          {task.done && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </span>
        <span className="text-[13px] text-gray-700">{task.label}</span>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-[11px] font-medium ${statusStyles[task.status]}`}
      >
        {task.status}
      </span>
    </div>
  );
}

export function WorkspaceDashboard() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-white p-10">
      {/* green/white gradient backdrop, echoing the fashion-mag palette */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-lime-300 via-emerald-400 to-transparent opacity-60 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-emerald-400 via-teal-300 to-transparent opacity-50 blur-3xl" />
      </div>

      <div className="relative flex h-[560px] w-[900px] rounded-[28px] bg-white shadow-2xl ring-1 ring-black/5">
        {/* Left panel */}
        <div className="relative w-[420px] shrink-0 overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-800 via-emerald-700 to-green-600 p-8 text-white">
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <Menu className="h-4 w-4" />
          </button>

          <div className="mt-10">
            <h1 className="text-[26px] font-semibold leading-tight">Hi Samantha</h1>
            <p className="mt-1 text-[13px] text-emerald-100/80">
              Welcome back to the workspace, we missed you!
            </p>
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5">
            <Search className="h-4 w-4 text-emerald-100/70" />
            <span className="text-[13px] text-emerald-100/70">Search Task or Project...</span>
          </div>

          <div className="mt-8">
            <p className="text-[13px] font-medium text-emerald-100/90">
              Projects <span className="text-emerald-200/60">(13)</span>
            </p>

            <div className="mt-4 grid grid-cols-3 gap-4">
              {projects.map((project, i) => (
                <div key={i} className="flex flex-col items-start gap-2">
                  {project.isCount ? (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-[15px] font-semibold text-white">
                      8+
                    </div>
                  ) : (
                    <div
                      className={`relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${project.gradient} text-[15px] font-semibold text-white shadow-lg`}
                    >
                      {project.initials}
                      {project.badge && (
                        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-emerald-800 bg-white" />
                      )}
                    </div>
                  )}
                  {project.label && (
                    <span className="text-[11px] text-emerald-100/70">{project.label}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* decorative dot grid, bottom-left */}
          <div className="absolute bottom-6 left-8 grid grid-cols-4 gap-1.5 opacity-40">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-white" />
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="absolute inset-y-4 right-0 flex w-[520px] flex-col rounded-[24px] bg-white p-8 shadow-[0_20px_50px_-15px_rgba(16,60,40,0.25)] ring-1 ring-black/5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[22px] font-semibold text-gray-900">Cyber Punk</h2>
              <p className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-gray-400">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
                incididunt
              </p>
            </div>
            <div className="flex items-center">
              <div className="flex -space-x-2">
                <div className="h-8 w-8 rounded-full border-2 border-white bg-gradient-to-br from-emerald-300 to-emerald-500" />
                <div className="h-8 w-8 rounded-full border-2 border-white bg-gradient-to-br from-lime-300 to-emerald-600" />
                <div className="h-8 w-8 rounded-full border-2 border-white bg-gradient-to-br from-teal-300 to-emerald-500" />
              </div>
              <button className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-emerald-300 text-emerald-500">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-gray-800">Today</h3>
            <MoreHorizontal className="h-4 w-4 text-gray-300" />
          </div>
          <div className="mt-1 divide-y divide-gray-50">
            {todayTasks.map((task, i) => (
              <TaskRow key={i} task={task} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-gray-800">Upcoming</h3>
            <MoreHorizontal className="h-4 w-4 text-gray-300" />
          </div>
          <div className="mt-1 divide-y divide-gray-50">
            {upcomingTasks.map((task, i) => (
              <TaskRow key={i} task={task} />
            ))}
          </div>

          <button className="absolute -bottom-5 -right-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/40">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkspaceDashboard;
