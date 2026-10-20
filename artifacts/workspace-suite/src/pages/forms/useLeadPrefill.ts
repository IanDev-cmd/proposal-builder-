import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { getQuoteLead, type QuoteLead } from '@/lib/quoteLeadStore';
import { buildLeadPrefill, prefillHealerTasks } from '@/lib/leadPrefill';
import { applyPrefillHealerMatches, requestPrefillHealer } from '@/lib/prefillHealer';
import { goldTargetsFromRef } from '@/lib/goldScenarioPlaybook';

/** Sapphire / sheet lead → wizard form. Same mapper the page used inline. */
export function hydrateLeadForm<T extends Record<string, unknown>>(
  lead: QuoteLead | null,
  init: T,
  sourceTypes: readonly string[],
) {
  return buildLeadPrefill(lead, init, [...sourceTypes]);
}

type HealerSlice = {
  progressNotes: string;
  quoteVersion: string;
  keyItems: string;
};

/**
 * Optional catalogue healer. Local prefill has already run; this only fills leftovers.
 * Mount-only, matching the previous Forms effect.
 */
export function useLeadPrefillHealer<T extends HealerSlice>(args: {
  data: T;
  setData: Dispatch<SetStateAction<T>>;
  setPrefilledKeys: Dispatch<SetStateAction<Set<string>>>;
  setPrefilledLineIds: Dispatch<SetStateAction<Set<string>>>;
  setLowConfidenceKeys: Dispatch<SetStateAction<Set<string>>>;
}) {
  const { data, setData, setPrefilledKeys, setPrefilledLineIds, setLowConfidenceKeys } = args;
  useEffect(() => {
    const lead = getQuoteLead();
    if (goldTargetsFromRef(lead?.referenceNumber)) return;
    const notes = String(lead?.progressNotes || data.progressNotes || '');
    if (!notes.trim()) return;
    const tasks = prefillHealerTasks(notes, String(data.quoteVersion || 'V1'), String(data.keyItems || ''));
    let cancelled = false;
    requestPrefillHealer({ notes, quoteVersion: String(data.quoteVersion || ''), tasks })
      .then((matches) => {
        if (cancelled || !matches?.length) return;
        const patch = applyPrefillHealerMatches({
          matches,
          notes,
          data: data as T & Record<string, unknown>,
          tasks,
        });
        if (
          !Object.keys(patch.data).length &&
          !patch.prefilledKeys.length &&
          !patch.prefilledLineIds.length &&
          !patch.removedLineIds.length
        ) {
          return;
        }
        setData((prev) => ({ ...prev, ...patch.data }));
        if (patch.prefilledKeys.length) {
          setPrefilledKeys((prev) => {
            const next = new Set(prev);
            for (const key of patch.prefilledKeys) next.add(key);
            return next;
          });
        }
        if (patch.prefilledLineIds.length) {
          setPrefilledLineIds((prev) => {
            const next = new Set(prev);
            for (const id of patch.prefilledLineIds) next.add(id);
            return next;
          });
        }
        if (patch.lowConfidenceKeys.length) {
          setLowConfidenceKeys((prev) => {
            const next = new Set(prev);
            for (const key of patch.lowConfidenceKeys) next.add(key);
            return next;
          });
        }
      })
      .catch(() => {
        /* healer is optional — local prefill already ran */
      });
    return () => {
      cancelled = true;
    };
    // Mount-only: local prefill is already applied; healer fills leftovers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
