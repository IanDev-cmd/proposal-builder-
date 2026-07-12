// Lightweight localStorage-backed store so Tasks (per representative) can be
// read by other pages (e.g. Calendar) without a backend. Tasks.tsx owns writes;
// any page can subscribe to read live updates.

export type StoredTask = {
  id: string;
  text: string;
  done: boolean;
  date: string; // ISO yyyy-mm-dd — the calendar day this task belongs to
  repId: string;
  repName: string;
  taskType: string;
};

export type RepTasksRecord = Record<string, Omit<StoredTask, 'repId' | 'repName'>[]>;

const TASKS_KEY = 'nexus_tasks_by_rep';
const TASKS_EVENT = 'nexus:tasks-updated';

export function loadRepTasks(): RepTasksRecord {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? (JSON.parse(raw) as RepTasksRecord) : {};
  } catch {
    return {};
  }
}

export function saveRepTasks(data: RepTasksRecord) {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable — fail silently, in-memory state still works
  }
  window.dispatchEvent(new Event(TASKS_EVENT));
}

/** Flatten every representative's tasks into one list, tagged with rep name/id. */
export function loadAllTasksFlat(repNameById: Record<string, string>): StoredTask[] {
  const byRep = loadRepTasks();
  const flat: StoredTask[] = [];
  for (const [repId, tasks] of Object.entries(byRep)) {
    for (const t of tasks) {
      flat.push({ ...t, repId, repName: repNameById[repId] ?? 'Unassigned' });
    }
  }
  return flat;
}

/** Subscribe to task changes (same-tab custom event + cross-tab storage event). */
export function subscribeTasks(cb: () => void): () => void {
  window.addEventListener(TASKS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(TASKS_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}
