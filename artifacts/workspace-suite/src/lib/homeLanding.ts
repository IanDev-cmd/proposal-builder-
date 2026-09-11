/**
 * Canonical Nexus landing page after PIN login or session restore.
 * Leftover wizard URLs go home. Copied quote/proposal share links stay put.
 */
export const HOME_PATH = '/home';

export function isHomeDashboardPath(pathname: string): boolean {
  const path = String(pathname || '').split('?')[0];
  return path === '/' || path === '/home' || path === '';
}

export type ShareDeepLink =
  | { kind: 'quote'; id: string }
  | { kind: 'proposal'; id: string };

function pathnameOnly(pathname: string): string {
  return String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
}

/** Quote review `/saved-quotes/:id` and proposal `/proposal-doc?id=` share URLs. */
export function parseShareDeepLink(pathname: string, search = ''): ShareDeepLink | null {
  const path = pathnameOnly(pathname);
  const quoteMatch = path.match(/^\/saved-quotes\/([^/]+)$/);
  if (quoteMatch?.[1]) {
    try {
      return { kind: 'quote', id: decodeURIComponent(quoteMatch[1]) };
    } catch {
      return { kind: 'quote', id: quoteMatch[1] };
    }
  }
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (path === '/proposal-doc') {
    const id = new URLSearchParams(query).get('id');
    if (id) return { kind: 'proposal', id };
  }
  return null;
}

export function isShareDeepLink(pathname: string, search = ''): boolean {
  return Boolean(parseShareDeepLink(pathname, search));
}
