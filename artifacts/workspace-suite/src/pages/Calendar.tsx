import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { loadAllTasksFlat, subscribeTasks, type StoredTask } from '@/lib/taskStore';
import { loadProposals, subscribeProposals, type GeneratedProposal } from '@/lib/proposalStore';
import { CRR_REPS } from '@/pages/Tasks';

const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const REP_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  CRR_REPS.map((r) => [String(r.id), r.name]),
);

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Cell = { date: Date; iso: string; inMonth: boolean };

function buildMonthGrid(year: number, month: number): Cell[][] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ date: d, iso: toIso(d), inMonth: d.getMonth() === month });
  }

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  // Trailing all-next-month week is only useful context — drop it if the last
  // row is entirely outside the current month to keep the grid tight.
  if (weeks.length > 5 && weeks[weeks.length - 1].every((c) => !c.inMonth)) weeks.pop();
  return weeks;
}

export function Calendar() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedIso, setSelectedIso] = useState(() => toIso(today));

  const [tasks, setTasks] = useState<StoredTask[]>(() => loadAllTasksFlat(REP_NAME_BY_ID));
  const [proposals, setProposals] = useState<GeneratedProposal[]>(() => loadProposals());

  useEffect(() => subscribeTasks(() => setTasks(loadAllTasksFlat(REP_NAME_BY_ID))), []);
  useEffect(() => subscribeProposals(() => setProposals(loadProposals())), []);

  const weeks = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, StoredTask[]> = {};
    for (const t of tasks) (map[t.date] ??= []).push(t);
    return map;
  }, [tasks]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, GeneratedProposal[]> = {};
    for (const p of proposals) if (p.eventDate) (map[p.eventDate] ??= []).push(p);
    return map;
  }, [proposals]);

  const daysWithContent = useMemo(() => {
    const set = new Set<string>();
    Object.keys(tasksByDay).forEach((d) => set.add(d));
    Object.keys(eventsByDay).forEach((d) => set.add(d));
    return set;
  }, [tasksByDay, eventsByDay]);

  const selectedDate = new Date(`${selectedIso}T00:00:00`);
  const selectedTasks = tasksByDay[selectedIso] ?? [];
  const selectedEvents = eventsByDay[selectedIso] ?? [];

  const goToMonth = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full overflow-hidden bg-white">
      {/* ── Left: calendar grid ── */}
      <div className="w-[400px] shrink-0 border-r border-black/8 bg-white p-8">
        <div className="flex items-center justify-between">
          <button
            onClick={() => goToMonth(-1)}
            className="flex h-7 w-7 items-center justify-center text-black/30 hover:text-black transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[16px] font-semibold text-gray-900">
            {monthNames[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <button
            onClick={() => goToMonth(1)}
            className="flex h-7 w-7 items-center justify-center text-black/30 hover:text-black transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-7 gap-y-3 text-center">
          {weekdays.map((d) => (
            <span key={d} className="text-[11px] font-medium tracking-wide text-black/35">
              {d}
            </span>
          ))}

          {weeks.map((week, wi) =>
            week.map((cell, di) => {
              const isSelected = cell.iso === selectedIso;
              const isToday = cell.iso === toIso(today);
              const hasTasks = !!tasksByDay[cell.iso]?.length;
              const hasEvents = !!eventsByDay[cell.iso]?.length;
              return (
                <div key={`${wi}-${di}`} className="flex flex-col items-center justify-center gap-1 py-1.5">
                  {isSelected ? (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2ecc71] text-[13px] font-semibold text-white">
                      {cell.date.getDate()}
                    </span>
                  ) : (
                    <button
                      onClick={() => setSelectedIso(cell.iso)}
                      className={`relative flex h-9 w-9 items-center justify-center rounded-full text-[13px] transition-colors ${
                        !cell.inMonth
                          ? 'text-black/20 hover:text-black/40'
                          : isToday
                          ? 'font-semibold text-[#2ecc71] ring-1 ring-[#2ecc71]/40'
                          : 'text-gray-600 hover:text-[#2ecc71]'
                      }`}
                    >
                      {cell.date.getDate()}
                    </button>
                  )}
                  {daysWithContent.has(cell.iso) && !isSelected && (
                    <div className="flex items-center gap-[3px]">
                      {hasTasks && <span className="h-[4px] w-[4px] rounded-full bg-blue-500" />}
                      {hasEvents && <span className="h-[4px] w-[4px] rounded-full bg-orange-500" />}
                    </div>
                  )}
                </div>
              );
            }),
          )}
        </div>

        <div className="mt-6 flex items-center gap-4 border-t border-black/8 pt-4 text-[11px] text-black/45">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Tasks</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-500" /> Events</span>
        </div>
      </div>

      {/* ── Right: agenda panel ── */}
      <div className="relative flex flex-1 flex-col overflow-hidden bg-white p-8">
        <div>
          <h2 className="text-[22px] font-semibold text-gray-900">{dayNames[selectedDate.getDay()]}</h2>
          <p className="mt-0.5 text-[12px] text-black/35">
            {selectedDate.getDate()} {monthNames[selectedDate.getMonth()]} {selectedDate.getFullYear()}
          </p>
        </div>

        <div className="scrollbar-thin relative mt-8 flex-1 overflow-y-auto">
          {selectedTasks.length === 0 && selectedEvents.length === 0 ? (
            <p className="text-[13px] text-black/35">Nothing scheduled for this day.</p>
          ) : (
            <div className="flex flex-col gap-8">
              {selectedEvents.length > 0 && (
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-orange-500/80">Events</p>
                  <div className="relative pl-5">
                    <div className="absolute left-[6px] top-2 bottom-2 w-px bg-orange-200" />
                    <div className="flex flex-col gap-5">
                      {selectedEvents.map((event) => (
                        <div key={event.id} className="relative">
                          <span className="absolute -left-[17px] top-[4px] h-[7px] w-[7px] rounded-full bg-orange-500" />
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500/70 mb-[3px]">
                            {event.eventType} · {event.guestCount || '—'} guests
                          </p>
                          <p className="text-[13px] font-medium leading-snug text-gray-800">{event.title}</p>
                          <p className="mt-0.5 text-[11px] text-black/35">{event.vesselType}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedTasks.length > 0 && (
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-500/80">Tasks</p>
                  <div className="relative pl-5">
                    <div className="absolute left-[6px] top-2 bottom-2 w-px bg-blue-200" />
                    <div className="flex flex-col gap-5">
                      {selectedTasks.map((task) => (
                        <div key={task.id} className="relative">
                          <span
                            className={`absolute -left-[17px] top-[4px] h-[7px] w-[7px] rounded-full ${
                              task.done ? 'bg-blue-500' : 'border border-blue-400 bg-white'
                            }`}
                          />
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-500/70 mb-[3px]">
                            {task.repName}{task.taskType ? ` · ${task.taskType}` : ''}
                          </p>
                          <p
                            className={`text-[13px] font-medium leading-snug ${
                              task.done ? 'text-black/30 line-through' : 'text-gray-800'
                            }`}
                          >
                            {task.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Calendar;
