/**
 * Proposal templates + inserts catalog (Meera Priority 1).
 * Source: artifacts/pdf-engine catalog + inserts manifest.
 * Salespeople pick manually — no auto-selection in the UI.
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
    if (opts.vesselHint && i.kind === 'vessel' && i.vessel) {
      const v = opts.vesselHint.toLowerCase();
      const iv = i.vessel.toLowerCase();
      if (!v.includes(iv) && !iv.includes(v.split('(')[0].trim()) && !iv.split(' ').some((p) => v.includes(p))) {
        // soft filter — still allow if no overlap on WEOTT number
        const num = (s: string) => s.match(/weott\s*(i{1,3}|iv|v|vi{0,3}|vii|yacht|limo)/i)?.[0]?.toLowerCase();
        if (num(v) && num(iv) && num(v) !== num(iv)) return false;
      }
    }
    if (q) {
      const hay = `${i.label} ${i.vessel || ''} ${i.staff || ''} ${i.season || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
