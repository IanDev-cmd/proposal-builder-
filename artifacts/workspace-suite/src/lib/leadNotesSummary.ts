/**
 * Lead notes summary — local Progress 1…N cards only.
 * Display-only — never writes output back onto the sheet string.
 */
import { type LeadNotePointPayload } from '@/lib/contracts';
import {
  detectPointKinds,
  pointsFromProgressNotes,
  progressNoteTitle,
  timeLabelFromNote,
  type NotePoint,
  type PointKind,
} from '@/lib/leadNotes';

const cache = new Map<string, NotePoint[]>();
const CACHE_MAX = 40;

function cacheSet(key: string, value: NotePoint[]) {
  cache.set(key, value);
  if (cache.size <= CACHE_MAX) return;
  const oldest = cache.keys().next().value;
  if (oldest !== undefined) cache.delete(oldest);
}

function cacheKey(leadKey: string, notes: string): string {
  return `${leadKey}::${notes.length}:${notes.slice(0, 80)}:${notes.slice(-80)}`;
}

function kindsFromPayload(p: LeadNotePointPayload, evidence: string): PointKind[] {
  const extra = Array.isArray(p.kinds) ? p.kinds : [];
  const detected = detectPointKinds(`${p.title} ${p.summary} ${evidence}`);
  const merged = [p.kind, ...extra, ...detected].filter(Boolean) as PointKind[];
  return [...new Set(merged)].slice(0, 4);
}

export function mergeSummaryPoints(notes: string, remote: LeadNotePointPayload[]): NotePoint[] {
  const local = pointsFromProgressNotes(notes);
  if (!remote.length) return local;

  return remote.map((p, i) => {
    const evidence = String(p.evidence || p.summary || '').trim();
    const sourceIndex = local.findIndex(
      (l) =>
        evidence &&
        (l.body.toLowerCase().includes(evidence.toLowerCase().slice(0, 48)) ||
          evidence.toLowerCase().includes(l.body.toLowerCase().slice(0, 48))),
    );
    const body = sourceIndex >= 0 ? local[sourceIndex].body : evidence || p.summary || p.title;
    const kinds = kindsFromPayload(p, body);
    const idx = sourceIndex >= 0 ? sourceIndex : i;
    return {
      id: `note-${i}`,
      title: progressNoteTitle(idx),
      summary: (p.summary || local[sourceIndex]?.summary || body).slice(0, 220),
      body,
      kind: kinds[0] || 'general',
      kinds,
      when: p.when || timeLabelFromNote(body, `Note ${i + 1}`),
      sourceIndex: sourceIndex >= 0 ? sourceIndex : null,
    };
  });
}

export async function requestLeadNotesSummary(opts: {
  notes: string;
  leadKey?: string;
  leadName?: string;
  referenceNumber?: string;
}): Promise<NotePoint[] | null> {
  const notes = String(opts.notes || '').slice(0, 8000);
  if (!notes.trim()) return [];

  const key = cacheKey(opts.leadKey || '', notes);
  const hit = cache.get(key);
  if (hit) return hit;

  const points = pointsFromProgressNotes(notes);
  cacheSet(key, points);
  return points;
}
