/**
 * Shared team PIN session — sessionStorage only (closing the tab logs out).
 * Idle timeout: 2 hours without pointer/keyboard activity.
 */

const STORAGE_KEY = 'nexus-team-session';
export const TEAM_IDLE_MS = 2 * 60 * 60 * 1000;
const PIN_LENGTH = 4;

type TeamSession = { lastActivity: number };

function readSession(): TeamSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TeamSession;
    if (!parsed || typeof parsed.lastActivity !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: TeamSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function configuredTeamPin(): string {
  return String(import.meta.env.VITE_NEXUS_TEAM_PASSWORD || '').trim();
}

export function isTeamPasswordConfigured(): boolean {
  return /^\d{4}$/.test(configuredTeamPin());
}

export function isTeamSessionActive(now = Date.now()): boolean {
  const session = readSession();
  if (!session) return false;
  return now - session.lastActivity < TEAM_IDLE_MS;
}

export function startTeamSession(now = Date.now()): void {
  writeSession({ lastActivity: now });
}

export function touchTeamSession(now = Date.now()): void {
  if (!isTeamSessionActive(now)) return;
  writeSession({ lastActivity: now });
}

export function clearTeamSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function verifyTeamPin(pin: string): { ok: boolean; reason?: 'empty' | 'mismatch' | 'length' } {
  const expected = configuredTeamPin();
  const entered = String(pin || '').replace(/\D/g, '');
  if (entered.length !== PIN_LENGTH) return { ok: false, reason: 'length' };
  if (!isTeamPasswordConfigured()) return { ok: false, reason: 'empty' };
  if (entered !== expected) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}
