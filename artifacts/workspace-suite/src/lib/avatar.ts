/**
 * Shared avatar/logo resolution helpers.
 *
 * Real photos are resolved by "pinging" public identity services with the
 * data we actually have (email for people, LinkedIn URL for companies),
 * with graceful fallbacks so a profile never shows a broken image — it
 * degrades to a clean initials/name badge instead.
 */

import katherineBulaonAvatar from '@/assets/avatars/katherine-bulaon.png';

function slugifyCompany(company: string): string {
  return company.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Manually-supplied real photos for specific people, keyed by normalized
 * name. Checked before any external lookup so a known headshot always wins
 * over the email/LinkedIn-derived guess.
 */
const PERSON_AVATAR_OVERRIDES: Record<string, string> = {
  'katherine bulaon': katherineBulaonAvatar,
};

/**
 * A varied, pleasant palette for initials/name-badge fallbacks. Picking a
 * color deterministically from a name (rather than always the same shade)
 * keeps a busy list — reps, leads, companies — visually distinguishable.
 */
const AVATAR_PALETTE = [
  '2ecc71', '3b82f6', 'f59e0b', 'ef4444', '8b5cf6',
  'ec4899', '06b6d4', 'f97316', '6366f1', '14b8a6',
  'd946ef', '0ea5e9',
];

/** Deterministically picks a palette color from a name/seed string. */
export function colorForName(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Best-effort real photo for a person, resolved from their email. */
export function personAvatarUrl(person: { email?: string; name: string; photoUrl?: string }): string {
  const override = PERSON_AVATAR_OVERRIDES[normalizeName(person.name)];
  if (override) return override;
  if (person.photoUrl) return person.photoUrl;
  const bg = colorForName(person.name);
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=${bg}&color=ffffff&size=256&bold=true`;
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
  const bg = colorForName(entity.company);
  const nameBadge = `https://ui-avatars.com/api/?name=${encodeURIComponent(entity.company)}&background=${bg}&color=ffffff&size=256&bold=true`;
  const slug = slugifyCompany(entity.company);
  const clearbitGuess = slug ? `https://logo.clearbit.com/${slug}.com` : nameBadge;
  if (entity.linkedin) {
    return `https://unavatar.io/linkedin/${encodeURIComponent(entity.linkedin)}?fallback=${encodeURIComponent(clearbitGuess)}`;
  }
  return clearbitGuess;
}
