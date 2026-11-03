/**
 * Backend URLs for the WEOTT Nexus workspace.
 *
 *   Sheets (leads / Cost Mother catalog) → Apps Script web app
 *   PDF + saved quotes → Flask (browser calls it directly)
 *
 * Paste the Web app /exec URL after Deploy → New deployment (see NexusApi.gs).
 *
 * Desktop builds set VITE_DESKTOP=1 so /generate and /workspace/* use the
 * local engine. Electron can also set window.__WEOTT_DESKTOP__ before load.
 */
const DESKTOP_ENGINE_ORIGIN = 'http://127.0.0.1:8765';

function desktopEngine(): boolean {
  if (import.meta.env.VITE_DESKTOP === '1') return true;
  return typeof window !== 'undefined' && window.__WEOTT_DESKTOP__ === true;
}

export const PROPOSAL_ENGINE_URL = desktopEngine()
  ? DESKTOP_ENGINE_ORIGIN
  : 'https://weott-proposal-engine.onrender.com';
export const PROPOSAL_ENGINE_GENERATE_URL = `${PROPOSAL_ENGINE_URL}/generate`;

/**
 * Google Apps Script Web App (NexusApi.gs).
 * Replace PASTE_DEPLOYMENT_ID with the id from Deploy → Web app → /exec URL.
 * Example: https://script.google.com/macros/s/AKfycb.../exec
 */
export const APPS_SCRIPT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbwmurfWliOxunCIT3Z-v10oBEuTao9GvhMdTworDJanaVcwKaUHPsuOkG3W2sM98Yf8zQ/exec';

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
