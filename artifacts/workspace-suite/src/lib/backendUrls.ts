/**
 * Backend URLs for the WEOTT Nexus workspace.
 *
 * After cutover:
 *   Sheets (leads / rates / notes / quote snapshots) → Apps Script web app
 *   PDF → Flask /generate (browser calls it directly)
 *   Gemini → n8n harmonyproxy PrefillHealer + LeadNotesSummary only
 *
 * Paste the Web app /exec URL after Deploy → New deployment (see NexusApi.gs).
 */
export const PROPOSAL_ENGINE_URL = 'https://weott-proposal-engine.onrender.com';
export const PROPOSAL_ENGINE_GENERATE_URL = `${PROPOSAL_ENGINE_URL}/generate`;

/**
 * Google Apps Script Web App (NexusApi.gs).
 * Replace PASTE_DEPLOYMENT_ID with the id from Deploy → Web app → /exec URL.
 * Example: https://script.google.com/macros/s/AKfycb.../exec
 */
export const APPS_SCRIPT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbz5TEEIhivFUIzeMVOk34KUgnT6D0vWl5N5bFSMsKpnhNfgb05BNhLYkBoOyRmFwsv5Cg/exec';

export function isAppsScriptConfigured(): boolean {
  const url = APPS_SCRIPT_WEBAPP_URL.trim();
  return (
    /^https:\/\/script\.google\.com\/macros\/s\//i.test(url) &&
    !/PASTE_DEPLOYMENT_ID/i.test(url)
  );
}

export function appsScriptActionUrl(
  action: string,
  query: Record<string, string | number | boolean | undefined> = {},
): string {
  const url = new URL(APPS_SCRIPT_WEBAPP_URL.trim());
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Gemini n8n host — PrefillHealer + LeadNotesSummary only. Not a Sheets proxy. */
const N8N_WEBHOOK_BASE = 'https://harmonyproxy.app.n8n.cloud/webhook';
export const N8N_INSTANCE_HOST = 'https://harmonyproxy.app.n8n.cloud';
export const N8N_INSTANCE_ID = '0b033e4dea3e06f7022fa976138770d89a94a569a45a7883de93bf9335d36920';

export const N8N_GEMINI_MODELS = {
  leadNotesSummary: 'models/gemini-3.6-flash',
  prefillHealer: 'models/gemini-3-flash-preview',
} as const;

/** UI → Flask /generate. Alias kept so older call sites compile. */
export const QUOTE_WEBHOOK_URL = PROPOSAL_ENGINE_GENERATE_URL;

/** Google Gemini n8n webhook — CRM notes → catalogue matches. */
export const PREFILL_HEALER_URL = `${N8N_WEBHOOK_BASE}/PrefillHealer`;
/** Google Gemini n8n webhook — lead notes → titled point summary. */
export const LEAD_NOTES_SUMMARY_URL = `${N8N_WEBHOOK_BASE}/LeadNotesSummary`;
