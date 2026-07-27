/**
 * Parse guest count for Quote Builder from Enquiry fields.
 * Handles multi-version strings like "V1 - 100\\nV2 - 70" and ignores
 * bogus groupSizeQuote values (e.g. version index `1`).
 */
export function parseGuestCount(opts: {
  groupSizeQuote?: number | string | null;
  groupSize?: string | null;
  quoteVersion?: string | null;
}): string {
  const text = String(opts.groupSize || '');
  const versionHits = [...text.matchAll(/V\s*(\d+)\s*[-–:]?\s*(\d{2,})/gi)];
  if (versionHits.length) {
    const want = String(opts.quoteVersion || '').match(/V?\s*(\d+)/i)?.[1];
    if (want) {
      const hit = versionHits.find((m) => m[1] === want);
      if (hit) return hit[2];
    }
    return versionHits[versionHits.length - 1][2];
  }

  const gsq = Number(opts.groupSizeQuote);
  // Ignore tiny values that look like version indexes (1, 2, 3…)
  if (Number.isFinite(gsq) && gsq >= 10) return String(Math.round(gsq));

  // Ranges like "50 - 65" → use lower bound (quote planning floor)
  const range = text.match(/(\d{2,})\s*[-–]\s*(\d{2,})/);
  if (range) return range[1];

  const nums = [...text.matchAll(/\d{2,}/g)].map((m) => Number(m[0]));
  if (nums.length) return String(nums[nums.length - 1]);

  if (Number.isFinite(gsq) && gsq >= 2) return String(Math.round(gsq));
  return '';
}
