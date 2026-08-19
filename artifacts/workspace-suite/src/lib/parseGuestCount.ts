/**
 * Parse guest count for Quote Builder from Enquiry fields.
 * Ambiguous values stay empty so the REP must enter them — never default
 * to a higher-capacity slot.
 */
export type GuestCountParse = {
  value: string;
  ambiguous: boolean;
};

export function parseGuestCountDetailed(opts: {
  groupSizeQuote?: number | string | null;
  groupSize?: string | null;
  quoteVersion?: string | null;
}): GuestCountParse {
  const text = String(opts.groupSize || '');
  const versionHits = [...text.matchAll(/V\s*(\d+)\s*[-–:]?\s*(\d{2,})/gi)];
  const want = String(opts.quoteVersion || '').match(/V?\s*(\d+)/i)?.[1];
  if (versionHits.length) {
    if (want) {
      const hit = versionHits.find((m) => m[1] === want);
      if (hit) return { value: hit[2], ambiguous: false };
    }
    if (versionHits.length > 1 && !want) return { value: '', ambiguous: true };
    return { value: versionHits[versionHits.length - 1][2], ambiguous: false };
  }

  const gsqRaw = opts.groupSizeQuote;
  const gsqMissing = gsqRaw == null || String(gsqRaw).trim() === '';
  const gsq = Number(gsqRaw);

  // Ranges like "50 - 65" without a dedicated quote number — REP must pick.
  const range = text.match(/(\d{2,})\s*[-–]\s*(\d{2,})/);
  if (range && gsqMissing) return { value: '', ambiguous: true };

  if (Number.isFinite(gsq) && gsq >= 10) return { value: String(Math.round(gsq)), ambiguous: false };

  const nums = [...text.matchAll(/\d{2,}/g)].map((m) => Number(m[0]));
  if (nums.length === 1 && (gsqMissing || !Number.isFinite(gsq) || gsq < 10)) {
    return { value: String(nums[0]), ambiguous: false };
  }
  if (nums.length > 1) return { value: '', ambiguous: true };

  if (!gsqMissing && Number.isFinite(gsq) && gsq >= 2 && gsq < 10) {
    return { value: '', ambiguous: true };
  }
  if (gsqMissing && !text.trim()) return { value: '', ambiguous: true };
  return { value: '', ambiguous: false };
}

/** @deprecated Prefer parseGuestCountDetailed — returns '' when ambiguous. */
export function parseGuestCount(opts: {
  groupSizeQuote?: number | string | null;
  groupSize?: string | null;
  quoteVersion?: string | null;
}): string {
  return parseGuestCountDetailed(opts).value;
}
