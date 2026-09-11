/**
 * Canonical Nexus landing page after PIN login or session restore.
 * Leftover wizard URLs go home. Copied quote/proposal share links stay put.
 */
export const HOME_PATH = '/home';

export function isHomeDashboardPath(pathname: string): boolean {
  const path = String(pathname || '').split('?')[0];
  return path === '/' || path === '/home' || path === '';
}

/** Quote review `/saved-quotes/:id` and proposal `/proposal-doc?id=` share URLs. */
export function isShareDeepLink(pathname: string, search = ''): boolean {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (/^\/saved-quotes\/[^/]+$/.test(path)) return true;
  const query = search.startsWith('?') ? search.slice(1) : search;
  return path === '/proposal-doc' && Boolean(new URLSearchParams(query).get('id'));
}
