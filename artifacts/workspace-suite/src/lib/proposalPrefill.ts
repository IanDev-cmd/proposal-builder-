/**
 * Resolve proposal template + inserts from enquiry / form context.
 * Mirrors pdf-engine catalog.py selection order.
 */
import {
  PROPOSAL_INSERTS,
  PROPOSAL_TEMPLATES,
  weottVesselKey,
  type ProposalInsert,
  type ProposalTemplate,
} from '@/lib/proposalAssets';
import { versionBlock } from '@/lib/progressNotesFinance';

export type ProposalTemplateContext = {
  proposalCategory: 'corporate' | 'wedding';
  eventType: string;
  guestCount?: string;
  embarkation?: string;
  departure?: string;
  disembarkation?: string;
  dayPeriod?: string;
  eventDate?: string;
  progressNotes?: string;
  quoteVersion?: string;
  market?: string;
};

export type ProposalTemplateResolution = {
  templateId: string;
  matchedBy: string;
  eventTypeUsed: string;
  slotUsed: string;
};

export type ProposalPackPrefill = {
  templateId: string;
  requiresInserts: boolean;
  selectedInserts: string[];
};

const VESSEL_TOKENS: Record<string, string[]> = {
  'WEOTT I (Rose)': ['weott_i', 'weott i', 'rose', 'london rose'],
  'WEOTT II (Avontuur)': ['weott_ii', 'weott ii', 'avontuur', 'avon'],
  'WEOTT III (Golden Sal)': ['weott_iii', 'weott iii', 'golden'],
  'WEOTT IV (Vaulla)': ['weott_iv', 'weott iv', 'vaulla', 'valulla'],
  'WEOTT V (Dixie)': ['weott_v', 'weott v', 'dixie'],
  'WEOTT VI (Elizabethan)': ['weott_vi', 'weott vi', 'elizabethan'],
  'WEOTT VII (Edwardian)': ['weott_vii', 'weott vii', 'edwardian'],
  'WEOTT Limo III (Bourne)': ['weott_limo', 'limo', 'bourne'],
};

function slug(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseHour(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

/** Daytime vs evening for template slot + insert matching. */
export function inferTimeSlot(embarkation?: string, disembarkation?: string): string {
  const emb = parseHour(embarkation);
  const dis = parseHour(disembarkation);
  const h = emb ?? dis;
  if (h == null) return 'daytime_or_evening';
  if (h >= 17 || (dis != null && dis >= 19)) return 'evening';
  if (h < 12) return 'daytime';
  return h >= 15 ? 'evening' : 'daytime';
}

export function inferSeason(eventDate?: string, eventType?: string): string {
  if (/christmas|xmas/i.test(eventType || '')) return 'christmas';
  if (!eventDate) return 'all_seasons';
  const d = new Date(eventDate.slice(0, 10));
  if (Number.isNaN(d.getTime())) return 'all_seasons';
  const month = d.getMonth() + 1;
  if (month === 12) return 'christmas';
  if (month >= 3 && month <= 8) return 'spring_summer';
  return 'autumn_winter';
}

function vesselTokens(vesselHint?: string): string[] {
  if (!vesselHint) return [];
  const exact = VESSEL_TOKENS[vesselHint];
  if (exact) return exact;
  const lower = vesselHint.toLowerCase();
  for (const [key, tokens] of Object.entries(VESSEL_TOKENS)) {
    if (lower.includes(key.toLowerCase().split('(')[0].trim())) return tokens;
  }
  const roman = lower.match(/weott\s*(i{1,3}|iv|v|vi{0,3}|vii|limo|yacht)/i)?.[0];
  return roman ? [roman.replace(/\s+/g, '_').toLowerCase(), roman.toLowerCase()] : [lower];
}

function slotMatches(insertSlot: string | undefined, wanted: string): boolean {
  if (!insertSlot || insertSlot === 'any') return true;
  if (insertSlot === wanted) return true;
  if (insertSlot === 'daytime_or_evening') return wanted === 'daytime' || wanted === 'evening';
  return false;
}

function seasonMatches(insertSeason: string | undefined, wanted: string): boolean {
  if (!insertSeason || insertSeason === 'any') return true;
  if (insertSeason === 'except_christmas') return wanted !== 'christmas';
  if (insertSeason === wanted) return true;
  if (['any_season', 'all_seasons'].includes(insertSeason)) return true;
  if (wanted === 'all_seasons') return true;
  return false;
}

function scoreInsert(
  ins: ProposalInsert,
  ctx: {
    category: 'corporate' | 'wedding';
    vesselHint: string;
    slot: string;
    season: string;
    repName: string;
    wedding: boolean;
  },
): number {
  if (ins.kind === 'map') return 0;
  let score = 0;
  const id = ins.id.toLowerCase();
  const label = ins.label.toLowerCase();

  if (ins.category && ins.category !== 'any' && ins.category !== ctx.category) return -1000;

  if (ins.kind === 'vessel') {
    const want = weottVesselKey(ctx.vesselHint);
    const have = weottVesselKey(`${ins.id} ${ins.label || ''} ${ins.vessel || ''}`);
    if (want && have && want !== have) return -1000;
    if (want && have && want === have) score += 35;
  } else {
    for (const tok of vesselTokens(ctx.vesselHint)) {
      const t = tok.replace(/\s+/g, '_');
      if (id.includes(t) || label.includes(tok.replace(/_/g, ' '))) score += 35;
    }
  }

  if (ins.kind === 'vessel') {
    if (ctx.wedding && (id.includes('wedding') || label.includes('wedding'))) score += 25;
    if (!ctx.wedding && id.includes('wedding')) score -= 40;
    if (seasonMatches(ins.season, ctx.season)) score += 18;
    else score -= 25;
    if (slotMatches(ins.slot, ctx.slot)) score += 15;
    else if (ins.slot === 'daytime_or_evening') score += 6;
    else score -= 10;
  }

  if (ins.kind === 'staff' && ctx.repName) {
    const rep = ctx.repName.toLowerCase();
    const staff = (ins.staff || '').toLowerCase();
    if (staff && (staff.includes(rep) || rep.includes(staff.split(' ')[0]))) score += 50;
    else score -= 30;
    if (slotMatches(ins.slot, ctx.slot)) score += 12;
    else if (ins.slot === 'daytime_or_evening') score += 5;
  }

  return score;
}

/** Indexed catalog views for UI (full manifest). */
export function indexProposalTemplates(category?: 'corporate' | 'wedding' | 'all') {
  const list =
    category && category !== 'all'
      ? PROPOSAL_TEMPLATES.filter((t) => t.category === category)
      : PROPOSAL_TEMPLATES;
  const byEventType = new Map<string, ProposalTemplate[]>();
  for (const t of list) {
    const key = t.event_type;
    if (!byEventType.has(key)) byEventType.set(key, []);
    byEventType.get(key)!.push(t);
  }
  return { all: list, byEventType, count: list.length };
}

export function indexProposalInserts(opts?: { category?: string; kind?: string }) {
  let list = [...PROPOSAL_INSERTS].filter(
    (i) => i.kind !== 'map' && i.id !== '2024_weott_proposal_river_map',
  );
  if (opts?.category && opts.category !== 'any') {
    list = list.filter((i) => !i.category || i.category === 'any' || i.category === opts.category);
  }
  if (opts?.kind) list = list.filter((i) => i.kind === opts.kind);
  const byKind = new Map<string, ProposalInsert[]>();
  for (const i of list) {
    const k = i.kind || 'other';
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(i);
  }
  return { all: list, byKind, count: list.length };
}

function inferEventTypeForTemplate(
  notes: string,
  quoteVersion: string,
  eventType: string,
  market?: string,
): string {
  const block = versionBlock(notes, quoteVersion);
  const hay = `${block} ${eventType} ${market || ''}`.toLowerCase();
  if (/\btransfer\b/.test(block.toLowerCase()) && /wedding/.test(hay)) return 'Wedding Transfer';
  if (/\bengagement\b/.test(hay)) return 'Engagement Celebration';
  if (/\bteam\s*building\b/.test(hay)) return 'Team Building';
  if (/\bchristmas|xmas\b/.test(hay)) return 'Christmas Event';
  if (/\bsummer\s*event\b/.test(hay) || (/\bsummer\b/.test(hay) && !/wedding/.test(hay))) return 'Summer Event';
  if (/\bwedding\s*reception\b/.test(hay)) return 'Wedding Reception';
  return eventType;
}

function slotForTemplate(ctx: Pick<ProposalTemplateContext, 'dayPeriod' | 'embarkation' | 'departure' | 'disembarkation' | 'eventType' | 'guestCount'>): string {
  if (ctx.dayPeriod === 'Daytime') return 'daytime';
  if (ctx.dayPeriod === 'Evening') return 'evening';
  let slot = inferTimeSlot(ctx.departure || ctx.embarkation, ctx.disembarkation);
  if ((ctx.eventType || '').toLowerCase().includes('transfer')) {
    const n = parseInt(String(ctx.guestCount || '0').trim(), 10);
    slot = Number.isFinite(n) && n >= 12 ? 'above_12' : 'below_12';
  }
  return slot;
}

export function resolveProposalTemplateDetailed(ctx: ProposalTemplateContext): ProposalTemplateResolution {
  const category = ctx.proposalCategory;
  let eventType = ctx.eventType.trim();
  if (ctx.progressNotes?.trim()) {
    eventType = inferEventTypeForTemplate(
      ctx.progressNotes,
      ctx.quoteVersion || 'V1',
      eventType,
      ctx.market,
    );
  }
  if (!eventType && /wedding/i.test(ctx.market || '')) eventType = 'Wedding Reception';
  if (!eventType) {
    return { templateId: '', matchedBy: 'missing_event_type', eventTypeUsed: '', slotUsed: '' };
  }

  const slot = slotForTemplate({ ...ctx, eventType });
  const templateId = pickTemplateId(category, eventType, slot);
  return {
    templateId,
    matchedBy: templateId ? `event_type+slot:${slot}` : 'none',
    eventTypeUsed: eventType,
    slotUsed: slot,
  };
}

function pickTemplateId(category: 'corporate' | 'wedding', eventType: string, slot: string): string {
  const slugEt = slug(eventType);
  let candidates = PROPOSAL_TEMPLATES.filter((t) => t.category === category);

  if (eventType) {
    // Prefer exact alias / event_slug matches. Do not let bare "wedding" steal
    // Wedding Transfer / Anniversary (slugEt.includes("wedding") was wrong).
    const scored = candidates
      .map((t) => {
        const aliases = [...(t.aliases || []), t.event_type, t.event_slug].map(slug);
        const exact = aliases.includes(slugEt);
        const partialHits = aliases.filter(
          (a) => a && a !== 'wedding' && (slugEt.includes(a) || a.includes(slugEt)),
        );
        const bestPartial = partialHits.length ? Math.max(...partialHits.map((a) => a.length)) : 0;
        const weakWeddingOnly =
          !exact && bestPartial === 0 && aliases.includes('wedding') && slugEt.startsWith('wedding');
        return { t, exact, bestPartial, weakWeddingOnly };
      })
      .filter((x) => x.exact || x.bestPartial > 0 || x.weakWeddingOnly);

    if (scored.length) {
      scored.sort((a, b) => {
        if (a.exact !== b.exact) return a.exact ? -1 : 1;
        if (a.bestPartial !== b.bestPartial) return b.bestPartial - a.bestPartial;
        if (a.weakWeddingOnly !== b.weakWeddingOnly) return a.weakWeddingOnly ? 1 : -1;
        return 0;
      });
      candidates = scored.map((x) => x.t);
    }
  }

  if (!candidates.length) {
    const broad = PROPOSAL_TEMPLATES.filter((t) => {
      const aliases = [...(t.aliases || []), t.event_slug].map(slug);
      return (
        aliases.includes(slugEt) ||
        aliases.some((a) => a && a !== 'wedding' && (slugEt.includes(a) || a.includes(slugEt)))
      );
    });
    if (broad.length) candidates = broad;
  }

  if (!candidates.length) {
    const fallback = PROPOSAL_TEMPLATES.find((t) => t.id === 'corporate/summer_event/any');
    return fallback?.id || '';
  }

  const preferred = slot
    ? [slot, 'any', 'default', 'daytime', 'evening', 'above_12', 'below_12']
    : ['any', 'default', 'daytime', 'evening'];
  for (const pref of preferred) {
    // Keep scored order: first candidate that matches preferred slot wins
    const hit = candidates.find((t) => t.slot === pref);
    if (hit) return hit.id;
  }
  return candidates[0].id;
}

export function resolveProposalTemplate(ctx: ProposalTemplateContext): string {
  return resolveProposalTemplateDetailed(ctx).templateId;
}

export function resolveProposalTemplateFromForm(
  data: {
    proposalCategory: 'corporate' | 'wedding';
    eventType: string;
    guestCount?: string;
    embarkation?: string;
    departure?: string;
    disembarkation?: string;
    dayPeriod?: string;
    eventDate?: string;
    quoteVersion?: string;
    progressNotes?: string;
  },
  lead?: { progressNotes?: string; market?: string } | null,
): ProposalTemplateResolution {
  return resolveProposalTemplateDetailed({
    proposalCategory: data.proposalCategory,
    eventType: data.eventType,
    guestCount: data.guestCount,
    embarkation: data.embarkation,
    departure: data.departure,
    disembarkation: data.disembarkation,
    dayPeriod: data.dayPeriod,
    eventDate: data.eventDate,
    quoteVersion: data.quoteVersion,
    progressNotes: data.progressNotes || lead?.progressNotes,
    market: lead?.market,
  });
}

export function resolveProposalInserts(opts: {
  category: 'corporate' | 'wedding';
  eventType: string;
  vesselHint?: string;
  eventDate?: string;
  embarkation?: string;
  departure?: string;
  disembarkation?: string;
  repName?: string;
}): { requiresInserts: boolean; selectedInserts: string[] } {
  const slot = inferTimeSlot(opts.departure || opts.embarkation, opts.disembarkation);
  const season = inferSeason(opts.eventDate, opts.eventType);
  const wedding = opts.category === 'wedding' || /wedding|engagement/i.test(opts.eventType);
  const ctx = {
    category: opts.category,
    vesselHint: opts.vesselHint || '',
    slot,
    season,
    repName: opts.repName || '',
    wedding,
  };

  const selected: string[] = [];

  const vesselCandidates = PROPOSAL_INSERTS.filter((i) => i.kind === 'vessel');
  let bestVessel: ProposalInsert | null = null;
  let bestVesselScore = -1;
  for (const ins of vesselCandidates) {
    const s = scoreInsert(ins, ctx);
    if (s > bestVesselScore) {
      bestVesselScore = s;
      bestVessel = ins;
    }
  }
  if (bestVessel && bestVesselScore > 0) selected.push(bestVessel.id);

  const staffCandidates = PROPOSAL_INSERTS.filter((i) => i.kind === 'staff');
  let bestStaff: ProposalInsert | null = null;
  let bestStaffScore = -1;
  for (const ins of staffCandidates) {
    const s = scoreInsert(ins, ctx);
    if (s > bestStaffScore) {
      bestStaffScore = s;
      bestStaff = ins;
    }
  }
  if (bestStaff && bestStaffScore > 0) selected.push(bestStaff.id);

  return {
    requiresInserts: selected.length > 0,
    selectedInserts: [...new Set(selected)],
  };
}

export function resolveProposalPack(opts: {
  category: 'corporate' | 'wedding';
  eventType: string;
  guestCount?: string;
  vesselHint?: string;
  eventDate?: string;
  embarkation?: string;
  departure?: string;
  disembarkation?: string;
  dayPeriod?: string;
  quoteVersion?: string;
  progressNotes?: string;
  market?: string;
  repName?: string;
}): ProposalPackPrefill {
  const templateId = resolveProposalTemplate({
    proposalCategory: opts.category,
    eventType: opts.eventType,
    guestCount: opts.guestCount,
    embarkation: opts.embarkation,
    departure: opts.departure,
    disembarkation: opts.disembarkation,
    dayPeriod: opts.dayPeriod,
    eventDate: opts.eventDate,
    quoteVersion: opts.quoteVersion,
    progressNotes: opts.progressNotes,
    market: opts.market,
  });
  const { requiresInserts, selectedInserts } = resolveProposalInserts(opts);
  return { templateId, requiresInserts, selectedInserts };
}

/** Always include a matching V2 vessel-profile insert so page 9 is not left as template artwork. */
export function insertsForGenerate(data: {
  requiresInserts: boolean;
  selectedInserts: string[];
  proposalCategory: 'corporate' | 'wedding';
  eventType: string;
  vesselType?: string[];
  eventDate?: string;
  embarkation?: string;
  departure?: string;
  disembarkation?: string;
}): string[] {
  const selected = (data.requiresInserts ? [...data.selectedInserts] : []).filter(
    (id) => id !== '2024_weott_proposal_river_map' && PROPOSAL_INSERTS.find((i) => i.id === id)?.kind !== 'map',
  );
  const hasVessel = selected.some((id) => PROPOSAL_INSERTS.find((i) => i.id === id)?.kind === 'vessel');
  if (hasVessel || !data.vesselType?.[0]) return selected;
  const auto = resolveProposalInserts({
    category: data.proposalCategory,
    eventType: data.eventType,
    vesselHint: data.vesselType[0],
    eventDate: data.eventDate,
    embarkation: data.embarkation,
    departure: data.departure,
    disembarkation: data.disembarkation,
  });
  const vesselIds = auto.selectedInserts.filter(
    (id) => PROPOSAL_INSERTS.find((i) => i.id === id)?.kind === 'vessel',
  );
  return [...selected, ...vesselIds];
}
