/**
 * Key Items shown through costing is the REP's current quote instruction,
 * not the original enquiry. Prefill may copy the latest progress note;
 * once the REP edits page 1, that value must follow through.
 */

const NOISE_RE =
  /\b(lead received|proposal sent|spoke(?:\s+to)?|called|emailed|voicemail|follow[- ]?up|no answer)\b/i;

export function displayQuoteKeyItems(data: {
  keyItems?: string;
  initialEnquiry?: string;
}): string {
  const current = String(data.keyItems || '').trim();
  if (current) return current;
  return String(data.initialEnquiry || '').trim();
}

export function isQuoteInstructionKeyItems(text: string): boolean {
  const s = String(text || '').trim();
  if (s.length < 8) return false;
  if (NOISE_RE.test(s)) return false;
  return true;
}

/** Latest progress entry that looks like a quote instruction, else empty. */
export function keyItemsFromLatestProgressNote(notes: string, quoteVersion = 'V1'): string {
  const raw = String(notes || '').trim();
  if (!raw) return '';
  const chunks = raw
    .split(/\s*\|\s*|\n{2,}|(?=Progress\s*\d+\s*[:.-])/i)
    .map((s) => s.replace(/^Progress\s*\d+\s*[:.\-]\s*/i, '').trim())
    .filter(Boolean);
  const verRe = new RegExp(`\\b${String(quoteVersion).replace('.', '\\.')}\\b`, 'i');
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (!isQuoteInstructionKeyItems(chunk)) continue;
    if (chunks.length > 1 && verRe.test(raw) && !verRe.test(chunk) && !/\bV\d+\b/i.test(chunk)) {
      /* still allow unversioned later notes — they are the REP's latest instruction */
    }
    return chunk.slice(0, 220);
  }
  return '';
}
