/**
 * Team PIN session. The PIN is verified only by the proposal engine.
 * sessionStorage holds a signed Bearer token (closing the tab logs out).
 * Idle timeout: 2 hours without pointer/keyboard activity.
 */

import { PROPOSAL_ENGINE_URL } from '@/lib/backendUrls';
import { fetchWithTimeout } from '@/lib/http';

const STORAGE_KEY = 'nexus-team-session';
export const TEAM_IDLE_MS = 2 * 60 * 60 * 1000;
export const PIN_LENGTH = 6;
export const TEAM_AUTH_EXPIRED_EVENT = 'nexus-team-auth-expired';
const TOUCH_EVERY_MS = 60_000;

type TeamSession = {
  token: string;
  lastActivity: number;
  lastTouch: number;
};

export type TeamLoginResult =
  | { ok: true }
  | { ok: false; reason: 'length' | 'mismatch' | 'locked' | 'network' };

function readSession(): TeamSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TeamSession>;
    if (!parsed || typeof parsed.token !== 'string' || typeof parsed.lastActivity !== 'number') {
      return null;
    }
    const token = parsed.token.trim();
    if (!token || token.length > 220) return null;
    return {
      token,
      lastActivity: parsed.lastActivity,
      lastTouch: typeof parsed.lastTouch === 'number' ? parsed.lastTouch : parsed.lastActivity,
    };
  } catch {
    return null;
  }
}

function writeSession(session: TeamSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getTeamToken(): string | null {
  const session = readSession();
  if (!session) return null;
  if (Date.now() - session.lastActivity >= TEAM_IDLE_MS) return null;
  return session.token;
}

export function engineAuthHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getTeamToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  return headers;
}

export function isTeamSessionActive(now = Date.now()): boolean {
  const session = readSession();
  if (!session?.token) return false;
  return now - session.lastActivity < TEAM_IDLE_MS;
}

export function startTeamSession(token: string, now = Date.now()): void {
  writeSession({ token: token.trim(), lastActivity: now, lastTouch: now });
}

export function clearTeamSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function notifyTeamAuthExpired(): void {
  clearTeamSession();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TEAM_AUTH_EXPIRED_EVENT));
  }
}

function applyServerToken(token: unknown, now = Date.now()): void {
  const session = readSession();
  if (!session) return;
  if (typeof token === 'string' && token.trim()) {
    writeSession({ ...session, token: token.trim(), lastActivity: now, lastTouch: now });
    return;
  }
  writeSession({ ...session, lastActivity: now, lastTouch: now });
}

export function touchTeamSession(now = Date.now()): void {
  const session = readSession();
  if (!session || now - session.lastActivity >= TEAM_IDLE_MS) return;
  writeSession({ ...session, lastActivity: now });
  if (now - session.lastTouch < TOUCH_EVERY_MS) return;
  void fetchWithTimeout(`${PROPOSAL_ENGINE_URL}/auth/touch`, {
    method: 'POST',
    headers: engineAuthHeaders(),
    timeoutMs: 15_000,
  })
    .then(async (res) => {
      if (res.status === 401) {
        notifyTeamAuthExpired();
        return;
      }
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as { token?: string } | null;
      applyServerToken(body?.token, Date.now());
    })
    .catch(() => {
      /* offline touch stays local until the next engine call */
    });
}

export async function restoreTeamSession(): Promise<boolean> {
  const token = getTeamToken();
  if (!token) {
    clearTeamSession();
    return false;
  }
  try {
    const res = await fetchWithTimeout(`${PROPOSAL_ENGINE_URL}/auth/session`, {
      headers: engineAuthHeaders(),
      timeoutMs: 15_000,
    });
    if (!res.ok) {
      clearTeamSession();
      return false;
    }
    touchTeamSession();
    return true;
  } catch {
    clearTeamSession();
    return false;
  }
}

export async function logoutTeamSession(): Promise<void> {
  const token = getTeamToken();
  if (token) {
    try {
      await fetchWithTimeout(`${PROPOSAL_ENGINE_URL}/auth/logout`, {
        method: 'POST',
        headers: engineAuthHeaders(),
        timeoutMs: 8_000,
      });
    } catch {
      /* still drop the local token */
    }
  }
  clearTeamSession();
}

export async function loginTeamPin(pin: string): Promise<TeamLoginResult> {
  const entered = String(pin || '').replace(/\D/g, '');
  if (entered.length !== PIN_LENGTH) return { ok: false, reason: 'length' };
  try {
    const res = await fetchWithTimeout(`${PROPOSAL_ENGINE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin: entered }),
      timeoutMs: 20_000,
    });
    if (res.status === 429) return { ok: false, reason: 'locked' };
    if (!res.ok) return { ok: false, reason: 'mismatch' };
    const body = (await res.json().catch(() => null)) as { token?: string } | null;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) return { ok: false, reason: 'network' };
    startTeamSession(token);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
