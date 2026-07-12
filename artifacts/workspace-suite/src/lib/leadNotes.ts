// ── Lead notes: taggable, per-lead note history ─────────────────────────────
// Backs the "Add a note" screen on a lead's profile panel. Notes are stored
// per-lead (keyed by reference number / email / id) and each note carries a
// tag drawn from a fixed set of categories the business actually uses.

export type NoteTag = 'research' | 'calls' | 'financial' | 'logistics' | 'pipeline' | 'history';

export type NoteCategory = {
  tag: NoteTag;
  label: string;
  hashtag: string;
  description: string;
  iconName: 'Search' | 'Phone' | 'CircleDollarSign' | 'Anchor' | 'GitBranch' | 'Clock';
  color: string;
  keywords: string[];
};

export const NOTE_CATEGORIES: NoteCategory[] = [
  {
    tag: 'research',
    label: 'Professional Enrichment & Research',
    hashtag: '#research',
    description: 'Job titles, sector, company size — LinkedIn profiling.',
    iconName: 'Search',
    color: '#6366f1',
    keywords: ['linkedin', 'job title', 'sector', 'employees', 'research', 'profile'],
  },
  {
    tag: 'calls',
    label: 'Interaction History & Calls',
    hashtag: '#calls',
    description: 'Call outcomes, voicemails, next-action reminders.',
    iconName: 'Phone',
    color: '#0ea5e9',
    keywords: ['call', 'phone', 'voicemail', 'video intro', 'next action', 'confirmed receipt'],
  },
  {
    tag: 'financial',
    label: 'Financial Modeling & Logic',
    hashtag: '#financial',
    description: 'Repeat-client discounts, margins, target budgets.',
    iconName: 'CircleDollarSign',
    color: '#22c55e',
    keywords: ['budget', 'discount', 'margin', '£', 'repeat client', 'price', 'pp'],
  },
  {
    tag: 'logistics',
    label: 'Operational Logistics',
    hashtag: '#logistics',
    description: 'Timing flexibility, vessel requirements, staffing ratios.',
    iconName: 'Anchor',
    color: '#f59e0b',
    keywords: ['vessel', 'timing', 'catering', 'staffing', 'firm', 'negotiable', 'tbc', 'remove for'],
  },
  {
    tag: 'pipeline',
    label: 'Pipeline Status & Handoff',
    hashtag: '#pipeline',
    description: 'Cost checks, proposal status, PM handover, Dropbox paths.',
    iconName: 'GitBranch',
    color: '#ec4899',
    keywords: ['proposal created', 'handover', 'dropbox', 'cost still needs checking', 'pm handover', 'status'],
  },
  {
    tag: 'history',
    label: 'Historical Context',
    hashtag: '#history',
    description: 'Past client database, "same as last year" requests.',
    iconName: 'Clock',
    color: '#8b5cf6',
    keywords: ['last year', 'repeat', 'previous', 'same as', 'final event brief'],
  },
];

const HASHTAG_TO_TAG: Record<string, NoteTag> = NOTE_CATEGORIES.reduce((acc, c) => {
  acc[c.hashtag.slice(1).toLowerCase()] = c.tag;
  return acc;
}, {} as Record<string, NoteTag>);

/** Detect a tag from free text: an explicit #hashtag wins, otherwise fall back to keyword match. */
export function detectTag(text: string): NoteTag | null {
  const lower = text.toLowerCase();

  const hashtagMatch = lower.match(/#([a-z]+)/);
  if (hashtagMatch) {
    const direct = HASHTAG_TO_TAG[hashtagMatch[1]];
    if (direct) return direct;
  }

  for (const cat of NOTE_CATEGORIES) {
    if (cat.keywords.some((kw) => lower.includes(kw))) return cat.tag;
  }
  return null;
}

export type LeadNote = {
  id: string;
  text: string;
  tag: NoteTag | null;
  createdAt: string;
};

type NotesStore = Record<string, LeadNote[]>;

const STORAGE_KEY = 'nexus_lead_notes';

function loadStore(): NotesStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStore(store: NotesStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadNotes(leadKey: string): LeadNote[] {
  return loadStore()[leadKey] ?? [];
}

export function addNote(leadKey: string, note: LeadNote): LeadNote[] {
  const store = loadStore();
  const updated = [note, ...(store[leadKey] ?? [])];
  store[leadKey] = updated;
  saveStore(store);
  return updated;
}
