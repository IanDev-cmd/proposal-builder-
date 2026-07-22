/**
 * Match Enquiry vessel string(s) to VESSEL_TYPES options.
 * e.g. "WEOTT II (Avontuur)" → ["WEOTT II (Avontuur)"]
 */
import { VESSEL_TYPES, EVENT_TYPES } from '@/lib/formOptions';

export function matchVessels(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[,;/|]+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const hit = VESSEL_TYPES.find(
      (v) =>
        v.toLowerCase() === lower ||
        lower.includes(v.toLowerCase()) ||
        v.toLowerCase().includes(lower) ||
        fuzzyVessel(lower, v.toLowerCase()),
    );
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

function fuzzyVessel(raw: string, opt: string): boolean {
  if (raw.includes('avon') && opt.includes('avon')) return true;
  if ((raw.includes('rose') || raw.includes('weott i ')) && opt.includes('rose')) return true;
  if (raw.includes('golden') && opt.includes('golden')) return true;
  if ((raw.includes('vaulla') || raw.includes('valulla')) && (opt.includes('vaulla') || opt.includes('valulla')))
    return true;
  if (raw.includes('dixie') && opt.includes('dixie')) return true;
  if (raw.includes('elizabeth') && opt.includes('elizabeth')) return true;
  if (raw.includes('edward') && opt.includes('edward')) return true;
  if ((raw.includes('bourne') || raw.includes('limo')) && opt.includes('bourne')) return true;
  return false;
}

export function matchEventType(raw?: string): string {
  if (!raw?.trim()) return '';
  const lower = raw.toLowerCase();
  const exact = EVENT_TYPES.find((e) => e.toLowerCase() === lower);
  if (exact) return exact;
  const starts = EVENT_TYPES.find((e) => lower.startsWith(e.toLowerCase()) || e.toLowerCase().startsWith(lower));
  if (starts) return starts;
  if (lower.includes('wedding')) {
    return EVENT_TYPES.find((e) => e.toLowerCase().includes('wedding reception')) || 'Wedding Reception';
  }
  if (lower.includes('summer')) return 'Summer Event';
  if (lower.includes('christmas') || lower.includes('xmas')) return 'Christmas Event';
  return '';
}

/** Parse "18:30 - 22:30" or "20:00 - 00:00" → embark / disembark HH:MM */
export function parseRequestedTimes(raw?: string): { embarkation?: string; disembarkation?: string } {
  if (!raw?.trim()) return {};
  const m = raw.match(/(\d{1,2}:\d{2})\s*[-–—to]+\s*(\d{1,2}:\d{2})/i);
  if (!m) return {};
  const norm = (t: string) => {
    const [h, min] = t.split(':');
    return `${h.padStart(2, '0')}:${min}`;
  };
  return { embarkation: norm(m[1]), disembarkation: norm(m[2]) };
}

export function isFlexibleDate(flexible?: string, flexibleBool?: boolean): boolean {
  if (flexibleBool === true) return true;
  const s = String(flexible || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return s.includes('yes') || s.includes('tbc') || s.includes('flex');
}

export function isRepeatYes(raw?: string | boolean): boolean {
  if (raw === true) return true;
  if (raw === false || raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s.startsWith('yes');
}

/** Prefer ISO yyyy-mm-dd when parseable; otherwise leave for Date TBC handling. */
export function parseEventDateForInput(display?: string, full?: string, flexible?: boolean): string {
  if (flexible) return ''; // Forms uses dateFlexible flag + empty date
  const src = (display || full || '').trim();
  if (!src || /tbc/i.test(src)) return '';
  // already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(src)) return src.slice(0, 10);
  const d = new Date(src);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return '';
}
