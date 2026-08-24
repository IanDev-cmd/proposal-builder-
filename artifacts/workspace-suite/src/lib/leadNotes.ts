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

export function updateNote(leadKey: string, noteId: string, text: string): LeadNote[] {
  const store = loadStore();
  const list = store[leadKey] ?? [];
  const updated = list.map((n) =>
    n.id === noteId ? { ...n, text, tag: detectTag(text) ?? n.tag } : n,
  );
  store[leadKey] = updated;
  saveStore(store);
  return updated;
}

export function deleteNote(leadKey: string, noteId: string): LeadNote[] {
  const store = loadStore();
  const updated = (store[leadKey] ?? []).filter((n) => n.id !== noteId);
  store[leadKey] = updated;
  saveStore(store);
  return updated;
}

/** Quote Builder sticky-note draft (Key Items + Progress Notes + free notes). */
export type QuoteNotesDraft = {
  keyItems: string;
  progressNotes: string;
  savedAt: string;
};

const DRAFT_KEY = 'nexus_quote_builder_notes_draft';

export function loadQuoteNotesDraft(leadKey: string): QuoteNotesDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as Record<string, QuoteNotesDraft>;
    return raw[leadKey] || null;
  } catch {
    return null;
  }
}

export function saveQuoteNotesDraft(leadKey: string, draft: Omit<QuoteNotesDraft, 'savedAt'>): QuoteNotesDraft {
  let store: Record<string, QuoteNotesDraft> = {};
  try {
    store = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
  } catch {
    store = {};
  }
  const next: QuoteNotesDraft = { ...draft, savedAt: new Date().toISOString() };
  store[leadKey] = next;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(store));
  return next;
}

/** Split concatenated Progress 1…N / pipe-joined notes into scannable entries. */
export function splitProgressNoteEntries(raw: string): string[] {
  const text = String(raw || '').trim();
  if (!text) return [];

  let parts = text
    .split(/\s*\|\s*|\n{2,}|(?=Progress\s*\d+\s*[:.-])/i)
    .map(cleanNoteEntry)
    .filter(Boolean);

  if (parts.length <= 1 && /\n/.test(text)) {
    parts = text.split(/\n+/).map(cleanNoteEntry).filter(Boolean);
  }

  if (parts.length <= 1 && /(?:^|\n)\s*(?:[-•*]|\d+[.)])\s+/.test(text)) {
    parts = text
      .split(/(?:^|\n)\s*(?:[-•*]|\d+[.)])\s+/)
      .map(cleanNoteEntry)
      .filter(Boolean);
  }

  if (parts.length <= 1 && text.length > 180) {
    parts = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map(cleanNoteEntry)
      .filter((s) => s.length >= 24);
    if (parts.length <= 1) parts = [cleanNoteEntry(text)].filter(Boolean);
  }

  return parts;
}

function cleanNoteEntry(s: string): string {
  return s
    .replace(/^Progress\s*\d+\s*[:.\-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function joinProgressNoteEntries(entries: string[]): string {
  return entries.map((s) => s.trim()).filter(Boolean).join('\n\n');
}

export function appendProgressNoteEntry(raw: string, next: string): string {
  const trimmed = next.trim();
  if (!trimmed) return String(raw || '');
  return joinProgressNoteEntries([...splitProgressNoteEntries(raw), trimmed]);
}

export function replaceProgressNoteEntry(raw: string, index: number, next: string): string {
  const entries = splitProgressNoteEntries(raw);
  if (index < 0 || index >= entries.length) return String(raw || '');
  const trimmed = next.trim();
  if (!trimmed) entries.splice(index, 1);
  else entries[index] = trimmed;
  return joinProgressNoteEntries(entries);
}

export function removeProgressNoteEntry(raw: string, index: number): string {
  return replaceProgressNoteEntry(raw, index, '');
}

export type PointKind =
  | 'budget'
  | 'calls'
  | 'research'
  | 'logistics'
  | 'pipeline'
  | 'history'
  | 'guests'
  | 'timing'
  | 'catering'
  | 'enquiry'
  | 'discovery'
  | 'general';

export type PointKindMeta = {
  kind: PointKind;
  label: string;
  iconName:
    | 'CircleDollarSign'
    | 'Phone'
    | 'Search'
    | 'Anchor'
    | 'GitBranch'
    | 'Clock'
    | 'Users'
    | 'Calendar'
    | 'UtensilsCrossed'
    | 'MessageSquareText'
    | 'Sparkles'
    | 'StickyNote';
  color: string;
  keywords: string[];
};

export const POINT_KINDS: PointKindMeta[] = [
  {
    kind: 'budget',
    label: 'Budget',
    iconName: 'CircleDollarSign',
    color: '#16a34a',
    keywords: ['budget', 'discount', 'margin', '£', 'price', 'pp', 'cost', 'quote', 'financial'],
  },
  {
    kind: 'calls',
    label: 'Call',
    iconName: 'Phone',
    color: '#0284c7',
    keywords: ['call', 'phone', 'voicemail', 'spoke to', 'video intro', 'no answer', 'confirmed receipt'],
  },
  {
    kind: 'research',
    label: 'Research',
    iconName: 'Search',
    color: '#4f46e5',
    keywords: ['linkedin', 'job title', 'sector', 'employees', 'research', 'profile'],
  },
  {
    kind: 'logistics',
    label: 'Logistics',
    iconName: 'Anchor',
    color: '#d97706',
    keywords: ['vessel', 'avontuur', 'rose', 'elizabethan', 'timing', 'staffing', 'firm', 'negotiable', 'tbc'],
  },
  {
    kind: 'pipeline',
    label: 'Pipeline',
    iconName: 'GitBranch',
    color: '#db2777',
    keywords: ['proposal created', 'handover', 'dropbox', 'cost still needs checking', 'pm handover', 'status', 'booked'],
  },
  {
    kind: 'history',
    label: 'History',
    iconName: 'Clock',
    color: '#7c3aed',
    keywords: ['last year', 'repeat', 'previous', 'same as', 'final event brief'],
  },
  {
    kind: 'guests',
    label: 'Guests',
    iconName: 'Users',
    color: '#2563eb',
    keywords: ['guest', 'pax', 'group', 'people', 'headcount', 'covers'],
  },
  {
    kind: 'timing',
    label: 'Timing',
    iconName: 'Calendar',
    color: '#ea580c',
    keywords: ['date', 'embark', 'depart', 'return', 'disembark', 'am', 'pm', 'evening', 'daytime', 'flexible'],
  },
  {
    kind: 'catering',
    label: 'Catering',
    iconName: 'UtensilsCrossed',
    color: '#e11d48',
    keywords: ['canap', 'menu', 'catering', 'drinks', 'hfb', 'csd', 'buffet', 'street food'],
  },
  {
    kind: 'enquiry',
    label: 'Enquiry',
    iconName: 'MessageSquareText',
    color: '#0f766e',
    keywords: ['enquiry', 'initial', 'requested'],
  },
  {
    kind: 'discovery',
    label: 'Discovery',
    iconName: 'Sparkles',
    color: '#7c3aed',
    keywords: ['discovery', 'key items', 'updated enquiry'],
  },
  {
    kind: 'general',
    label: 'Note',
    iconName: 'StickyNote',
    color: '#64748b',
    keywords: [],
  },
];

const KIND_BY_TAG: Record<NoteTag, PointKind> = {
  research: 'research',
  calls: 'calls',
  financial: 'budget',
  logistics: 'logistics',
  pipeline: 'pipeline',
  history: 'history',
};

export function pointKindMeta(kind: PointKind): PointKindMeta {
  return POINT_KINDS.find((k) => k.kind === kind) ?? POINT_KINDS[POINT_KINDS.length - 1];
}

export function tagToPointKind(tag: NoteTag): PointKind {
  return KIND_BY_TAG[tag];
}

export function detectPointKinds(text: string): PointKind[] {
  const lower = text.toLowerCase();
  const found: PointKind[] = [];
  for (const cat of POINT_KINDS) {
    if (cat.kind === 'general' || cat.kind === 'enquiry' || cat.kind === 'discovery') continue;
    if (cat.keywords.some((kw) => lower.includes(kw))) found.push(cat.kind);
  }
  const tagged = detectTag(text);
  if (tagged) {
    const mapped = KIND_BY_TAG[tagged];
    if (!found.includes(mapped)) found.unshift(mapped);
  }
  return found.length ? found : ['general'];
}

export type NotePoint = {
  id: string;
  title: string;
  summary: string;
  body: string;
  kind: PointKind;
  kinds: PointKind[];
  when: string;
  sourceIndex: number | null;
};

const TIME_RE = /\b(\d{1,2}:\d{2}\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM))\b/i;
const DATE_RE = /\b(\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b/i;

export function timeLabelFromNote(text: string, fallback: string): string {
  const time = text.match(TIME_RE);
  if (time) return time[1].toUpperCase().replace(/\s+/g, ' ');
  const date = text.match(DATE_RE);
  if (date) return date[1];
  return fallback;
}

function titleFromEntry(text: string, kinds: PointKind[]): string {
  const primary = kinds[0];
  if (primary && primary !== 'general') return pointKindMeta(primary).label;
  const clause = text.split(/[.|]/)[0]?.trim() || text;
  return clause.length > 28 ? `${clause.slice(0, 26).trim()}…` : clause || 'Note';
}

function summaryFromEntry(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return sentence.length > 140 ? `${sentence.slice(0, 132).trim()}…` : sentence;
}

/** Local fallback: one scannable card per Progress 1…N / pipe / paragraph entry. */
export function pointsFromProgressNotes(raw: string): NotePoint[] {
  return splitProgressNoteEntries(raw).map((body, i) => {
    const kinds = detectPointKinds(body);
    return {
      id: `progress-${i}`,
      title: titleFromEntry(body, kinds),
      summary: summaryFromEntry(body),
      body,
      kind: kinds[0],
      kinds,
      when: timeLabelFromNote(body, `Note ${i + 1}`),
      sourceIndex: i,
    };
  });
}
