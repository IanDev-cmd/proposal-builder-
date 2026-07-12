/**
 * Shared avatar/logo resolution helpers.
 *
 * Real photos are resolved by "pinging" public identity services with the
 * data we actually have (email for people, LinkedIn URL for companies),
 * with graceful fallbacks so a profile never shows a broken image — it
 * degrades to a clean initials/name badge instead.
 */

function slugifyCompany(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}

/** Best-effort real photo for a person, resolved from their email. */
export function personAvatarUrl(person: { email?: string; name: string; photoUrl?: string }): string {
  if (person.photoUrl) return person.photoUrl;
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=1a1a1a&color=ffffff&size=256&bold=true`;
  if (person.email && person.email !== '—') {
    return `https://unavatar.io/${encodeURIComponent(person.email)}?fallback=${encodeURIComponent(fallback)}`;
  }
  return fallback;
}

/**
 * Best-effort real logo for a company. LinkedIn is the primary source when
 * available (unavatar.io resolves company photos straight from the LinkedIn
 * page), then falls back to a Clearbit domain guess, then a name badge.
 */
export function companyAvatarUrl(entity: { company: string; linkedin?: string; companyLogo?: string }): string {
  if (entity.companyLogo) return entity.companyLogo;
  const nameBadge = `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.company)}&background=1a1a1a&color=ffffff&size=256&bold=true`;
  const slug = slugifyCompany(entity.company);
  const clearbitGuess = slug ? `https://logo.clearbit.com/${slug}.com` : nameBadge;
  if (entity.linkedin) {
    return `https://unavatar.io/linkedin/${encodeURIComponent(entity.linkedin)}?fallback=${encodeURIComponent(clearbitGuess)}`;
  }
  return clearbitGuess;
}
