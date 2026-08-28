/**
 * Backend URLs for the WEOTT Nexus workspace.
 *
 *   Sheets (leads / rates / notes / quote snapshots) → Apps Script web app
 *   PDF → Flask /generate (browser calls it directly)
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

/** UI → Flask /generate. Alias kept so older call sites compile. */
export const QUOTE_WEBHOOK_URL = PROPOSAL_ENGINE_GENERATE_URL;
