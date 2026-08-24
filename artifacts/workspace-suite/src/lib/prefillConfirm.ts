/**
 * Keys that require REP click-to-confirm before generate (template / inserts).
 */
export function collectPrefillConfirmKeys(opts: {
  prefilledKeys: Set<string>;
  confirmedKeys: Set<string>;
  requiresInserts: boolean;
  selectedInserts: string[];
  lowConfidenceKeys?: Set<string>;
  ambiguousFields?: Set<string>;
}): string[] {
  const pending: string[] = [];
  const {
    prefilledKeys,
    confirmedKeys,
    requiresInserts,
    selectedInserts,
    lowConfidenceKeys,
    ambiguousFields,
  } = opts;

  if (lowConfidenceKeys) {
    for (const key of lowConfidenceKeys) {
      if (prefilledKeys.has(key) && !confirmedKeys.has(key)) pending.push(key);
    }
  }
  if (ambiguousFields) {
    for (const key of ambiguousFields) {
      if (!confirmedKeys.has(key)) pending.push(key);
    }
  }

  if (prefilledKeys.has('templateId') && !confirmedKeys.has('templateId')) {
    pending.push('templateId');
  }
  if (prefilledKeys.has('requiresInserts') && requiresInserts && !confirmedKeys.has('requiresInserts')) {
    pending.push('requiresInserts');
  }
  if (prefilledKeys.has('selectedInserts') && requiresInserts) {
    for (const id of selectedInserts) {
      if (!confirmedKeys.has(`insert:${id}`)) pending.push(`insert:${id}`);
    }
  }
  return pending;
}

export function hasPendingPrefillConfirms(opts: Parameters<typeof collectPrefillConfirmKeys>[0]): boolean {
  return collectPrefillConfirmKeys(opts).length > 0;
}

/** Mark template / inserts (and any other pending prefill) as already accepted. */
export function autoConfirmPrefillKeys(opts: {
  prefilledKeys: Iterable<string>;
  requiresInserts: boolean;
  selectedInserts: string[];
}): Set<string> {
  const prefilledKeys = new Set(opts.prefilledKeys);
  const confirmed = new Set<string>(prefilledKeys);
  if (opts.requiresInserts) {
    confirmed.add('requiresInserts');
    for (const id of opts.selectedInserts) confirmed.add(`insert:${id}`);
  }
  if (prefilledKeys.has('templateId') || confirmed.has('templateId')) confirmed.add('templateId');
  for (const id of opts.selectedInserts) confirmed.add(`insert:${id}`);
  return confirmed;
}
