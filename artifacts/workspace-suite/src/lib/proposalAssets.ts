/**
 * Proposal templates + inserts catalog.
 * Source: artifacts/pdf-engine catalog + inserts manifest.
 * Auto-selection via proposalPrefill.ts; REP confirms in UI (blue → glow).
 */

import catalog from './assets/proposalCatalog.json';

export type ProposalTemplate = {
  id: string;
  category: string;
  event_type: string;
  event_slug?: string;
  slot: string;
  aliases?: string[];
};

export type ProposalInsert = {
  id: string;
  label: string;
  kind: 'vessel' | 'staff' | 'map' | 'other' | string;
  season?: string;
  slot?: string;
  category?: string;
  vessel?: string;
  staff?: string;
  dancefloor?: boolean;
};

export const PROPOSAL_TEMPLATES = catalog.templates as ProposalTemplate[];
export const PROPOSAL_INSERTS = (catalog.inserts.inserts || []) as ProposalInsert[];
export const INSERT_PLACEMENT_RULES = catalog.inserts.placement_rules || {};

export function templatesForCategory(category: 'corporate' | 'wedding' | 'all'): ProposalTemplate[] {
  if (category === 'all') return PROPOSAL_TEMPLATES;
  return PROPOSAL_TEMPLATES.filter((t) => t.category === category);
}

export function templateLabel(t: ProposalTemplate): string {
  const slot = t.slot && t.slot !== 'any' ? ` · ${t.slot}` : '';
  return `${t.event_type}${slot}`;
}

/** WEOTT I vs II vs III must not match as substrings ("I" inside "III"). */
export function weottVesselKey(raw: string): string {
  const m = String(raw || '')
    .toLowerCase()
    .match(/weott[\s_-]*(yacht|limo|vii|vi|iv|iii|ii|v|i)(?![a-z])/);
  if (!m) return '';
  return `weott ${m[1]}`;
}

export function filterInserts(opts: {
  kind?: string;
  category?: string;
  vesselHint?: string;
  query?: string;
}): ProposalInsert[] {
  const q = (opts.query || '').trim().toLowerCase();
  return PROPOSAL_INSERTS.filter((i) => {
    if (opts.kind && i.kind !== opts.kind) return false;
    if (opts.category && opts.category !== 'any' && i.category && i.category !== 'any' && i.category !== opts.category) {
      return false;
    }
    if (opts.vesselHint && i.kind === 'vessel') {
      const want = weottVesselKey(opts.vesselHint);
      const have = weottVesselKey(`${i.id} ${i.label || ''} ${i.vessel || ''}`);
      if (want && have && want !== have) return false;
    }
    if (q) {
      const hay = `${i.label} ${i.vessel || ''} ${i.staff || ''} ${i.season || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
