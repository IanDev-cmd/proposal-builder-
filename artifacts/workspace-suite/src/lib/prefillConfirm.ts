/**
 * Keys that require REP click-to-confirm before generate (template / inserts).
 */
export function collectPrefillConfirmKeys(opts: {
  prefilledKeys: Set<string>;
  confirmedKeys: Set<string>;
  requiresInserts: boolean;
  selectedInserts: string[];
}): string[] {
  const pending: string[] = [];
  const { prefilledKeys, confirmedKeys, requiresInserts, selectedInserts } = opts;

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
