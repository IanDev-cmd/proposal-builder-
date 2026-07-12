import { md5 } from './md5';

/**
 * Shared avatar/logo resolution helpers.
 *
 * Person photos are resolved directly against Gravatar (keyed by the MD5
 * hash of the email — no third-party proxy involved), then fall back to a
 * generated DiceBear "Lorelei" illustration seeded by the person's email
 * (or name, if no email is on file) when no Gravatar profile exists. A
 * plain initials badge is the final, last-resort fallback (handled by the
 * <Avatar> component if even DiceBear fails to load).
 *
 * Company logos still resolve via LinkedIn (through unavatar.io) with a
 * Clearbit domain guess as a fallback — unchanged from before.
 */

function slugifyCompany(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}

function hasEmail(email: string | undefined): email is string {
  return Boolean(email && email !== '—');
}

/**
 * Best-effort real photo for a person: a direct Gravatar URL built from the
 * MD5 hash of their lowercased/trimmed email. `?d=404` tells Gravatar to
 * respond with a 404 (instead of a generic silhouette) when no profile
 * image is set, so the caller can detect the miss and fall back.
 * Returns `undefined` when we have no email/photo to resolve from.
 */
export function personAvatarUrl(person: { email?: string; name: string; photoUrl?: string }): string | undefined {
  if (person.photoUrl) return person.photoUrl;
  if (hasEmail(person.email)) {
    const hash = md5(person.email.toLowerCase().trim());
    return `https://www.gravatar.com/avatar/${hash}?d=404`;
  }
  return undefined;
}

/**
 * Fallback avatar for a person when Gravatar has no profile image (404) or
 * fails to load: a generated DiceBear "Lorelei" illustration seeded by
 * their email (falling back to their name when no email is on file), so
 * every person gets a consistent, distinctive picture instead of a flat
 * initials circle.
 */
export function personAvatarFallbackUrl(person: { email?: string; name: string }): string {
  const seed = hasEmail(person.email) ? person.email.toLowerCase().trim() : person.name;
  return `https://api.dicebear.com/10.x/lorelei/svg?seed=${encodeURIComponent(seed)}`;
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
