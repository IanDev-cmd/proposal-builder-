import { useCallback, useState } from 'react';

export const STEPS = [
  { n: 1, label: 'Event Core' },
  { n: 2, label: 'Guest Count' },
  { n: 3, label: 'Schedule Timings' },
  { n: 4, label: 'Cost Lines' },
  { n: 5, label: 'Financials' },
  { n: 6, label: 'Cost Approval' },
  { n: 7, label: 'Proposal Pack' },
] as const;

export const LAST_CONTENT_STEP = 7;

const APPROVAL_BLOCK_MESSAGE =
  'Financial cross-check failed — align WEOTT with Quote Sheet before continuing.';

/**
 * Step 6 is the only gated step. Steps 1–5 advance without extra checks,
 * matching the wizard buttons that were inline on the page.
 */
export function approvalAdvanceMessage(input: {
  costApproved: boolean;
  blocked: boolean;
  hint?: string;
}): string | null {
  if (input.costApproved || !input.blocked) return null;
  return input.hint || APPROVAL_BLOCK_MESSAGE;
}

/** Step index, bounds, and the Cost Approval gate. */
export function useQuoteWizardState(initialStep: number | (() => number)) {
  const [step, setStep] = useState(initialStep);
  const goTo = useCallback((next: number) => {
    setStep(Math.min(LAST_CONTENT_STEP, Math.max(1, next)));
  }, []);
  const goBack = useCallback(() => {
    setStep((current) => Math.max(1, current - 1));
  }, []);
  const goForward = useCallback(() => {
    setStep((current) => Math.min(LAST_CONTENT_STEP, current + 1));
  }, []);
  return { step, setStep, goTo, goBack, goForward, steps: STEPS, lastContentStep: LAST_CONTENT_STEP };
}
