/**
 * Browser client for NexusApi.gs (Google Apps Script web app).
 *
 * CORS: script.google.com POST + application/json preflights and 302s to
 * googleusercontent, which a Vite SPA cannot complete. Working pattern:
 *   - GET + query for reads (simple request, follow redirects)
 *   - POST + text/plain JSON body for writes (no preflight; GAS still parses e.postData)
 * Do not send Content-Type: application/json from the browser.
 */
import {
  APPS_SCRIPT_WEBAPP_URL,
  appsScriptActionUrl,
  isAppsScriptConfigured,
} from '@/lib/backendUrls';
import { SheetsApiError } from '@/lib/errors';
import { fetchWithTimeout } from '@/lib/http';

const READ_ACTIONS = new Set(['LeadDataFetch', 'CostRatesFetch', 'NotesFetch', 'QuotesFetch', 'health']);

function assertConfigured(): void {
  if (!isAppsScriptConfigured()) {
    throw new SheetsApiError(
      'AppsScript',
      undefined,
      'Apps Script is not deployed. Deploy NexusApi.gs as a Web app (Execute as: Me, Who has access: Anyone) and paste the /exec URL into APPS_SCRIPT_WEBAPP_URL.',
    );
  }
}

function looksLikeHtml(text: string): boolean {
  const t = text.trim().slice(0, 32).toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

async function parseAppsScriptJson<T>(action: string, res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new SheetsApiError(
      action,
      res.status,
      `${action} returned an empty body from Apps Script. Confirm the Web app deployment is current and Who has access is Anyone.`,
    );
  }
  if (looksLikeHtml(text)) {
    throw new SheetsApiError(
      action,
      res.status,
      `${action} returned an HTML login page instead of JSON. Redeploy NexusApi.gs with Who has access: Anyone.`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SheetsApiError(
      action,
      res.status,
      `${action} returned invalid JSON (${text.slice(0, 160).trim()}).`,
    );
  }
}

async function postPlain(action: string, payload: Record<string, unknown>, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<Response> {
  try {
    return await fetchWithTimeout(APPS_SCRIPT_WEBAPP_URL.trim(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action }),
      signal: opts?.signal,
      timeoutMs: opts?.timeoutMs ?? 45_000,
    });
  } catch (err) {
    throw new SheetsApiError(
      action,
      undefined,
      `Could not reach Apps Script (${action}): ${err instanceof Error ? err.message : 'network error'}`,
    );
  }
}

export async function callAppsScript<T = unknown>(
  action: string,
  payload: Record<string, unknown> = {},
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  assertConfigured();
  const timeoutMs = opts?.timeoutMs ?? 45_000;

  if (READ_ACTIONS.has(action)) {
    const query: Record<string, string | number | boolean | undefined> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null || typeof value === 'object') continue;
      query[key] = value as string | number | boolean;
    }
    let getRes: Response;
    try {
      getRes = await fetchWithTimeout(appsScriptActionUrl(action, query), {
        method: 'GET',
        redirect: 'follow',
        signal: opts?.signal,
        timeoutMs,
      });
    } catch (err) {
      throw new SheetsApiError(
        action,
        undefined,
        `Could not reach Apps Script (${action}): ${err instanceof Error ? err.message : 'network error'}`,
      );
    }
    const getText = await getRes.clone().text();
    if (getRes.ok && getText.trim() && !looksLikeHtml(getText)) {
      return parseAppsScriptJson<T>(action, getRes);
    }
    const postRes = await postPlain(action, payload, { timeoutMs, signal: opts?.signal });
    if (!postRes.ok) {
      const detail = (await postRes.clone().text()).trim().slice(0, 160);
      throw new SheetsApiError(
        action,
        postRes.status,
        detail ? `${action} failed (${postRes.status}): ${detail}` : `${action} failed (${postRes.status})`,
      );
    }
    return parseAppsScriptJson<T>(action, postRes);
  }

  const res = await postPlain(action, payload, { timeoutMs, signal: opts?.signal });
  if (!res.ok) {
    const detail = (await res.clone().text()).trim().slice(0, 160);
    throw new SheetsApiError(
      action,
      res.status,
      detail ? `${action} failed (${res.status}): ${detail}` : `${action} failed (${res.status})`,
    );
  }
  return parseAppsScriptJson<T>(action, res);
}
