/**
 * Canonical Nexus landing page after PIN login or session restore.
 * Deep links and leftover wizard URLs must not survive re-authentication.
 */
export const HOME_PATH = '/home';

export function isHomeDashboardPath(pathname: string): boolean {
  const path = String(pathname || '').split('?')[0];
  return path === '/' || path === '/home' || path === '';
}
