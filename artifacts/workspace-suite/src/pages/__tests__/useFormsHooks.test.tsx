import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { calcFinancials, type QuoteFormInput } from '@/lib/quoteFinance';
import { hydrateLeadForm } from '@/pages/forms/useLeadPrefill';
import { approvalAdvanceMessage, useQuoteWizardState } from '@/pages/forms/useQuoteWizardState';
import { runProposalGeneration } from '@/pages/forms/useProposalGeneration';
import type { QuoteLead } from '@/lib/quoteLeadStore';

vi.mock('@/lib/http', () => ({
  fetchWithTimeout: vi.fn(),
  blobToDataUrl: vi.fn(async () => 'data:application/pdf;base64,QQ=='),
}));

vi.mock('@/lib/proposalStore', () => ({
  addProposal: vi.fn(async (row: { id: string }) => row),
}));

vi.mock('@/lib/sheetsSync', () => ({
  writeQuoteStatus: vi.fn(async () => undefined),
}));

vi.mock('@/lib/notify', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

import { fetchWithTimeout } from '@/lib/http';

const fetchMock = vi.mocked(fetchWithTimeout);

function financeForm(): QuoteFormInput {
  return {
    vesselType: ['WEOTT II (Avontuur)'],
    eventType: 'Christmas Event',
    eventDate: '2026-12-02',
    guestCount: '40',
    embarkation: '18:00',
    departure: '18:30',
    returnTime: '22:00',
    disembarkation: '22:30',
    menuType: [],
    repeatClient: false,
    totalCost: '',
    baseCostAuto: true,
    selectedUpgrades: [],
    marginPercent: '25',
    selectedLineIds: [],
  };
}

describe('refactored form hooks', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } })),
    );
  });

  it('hydrates a Sapphire lead into the wizard form', () => {
    const lead = {
      id: 1,
      name: 'Ada Quote',
      email: 'ada@example.com',
      phone: '020 0000 0000',
      designation: 'Buyer',
      company: 'Space Made',
      referenceNumber: 'WE.19000',
      initials: 'AQ',
      color: '#112233',
      eventType: 'Christmas Event',
      groupSize: '40',
      groupSizeQuote: '40',
      progressNotes: 'HFB for 40',
    } as QuoteLead;
    const result = hydrateLeadForm(lead, { eventType: '', guestCount: '', source: '' }, ['Called Us']);
    expect(result.data.eventType).toBe('Christmas Event');
    expect(result.data.guestCount).toBe('40');
    expect(result.prefilledKeys.has('eventType') || result.data.eventType).toBeTruthy();
  });

  it('moves the wizard one step at a time and blocks cost approval when the cross-check fails', () => {
    const { result } = renderHook(() => useQuoteWizardState(1));
    act(() => result.current.goForward());
    expect(result.current.step).toBe(2);
    act(() => result.current.goBack());
    expect(result.current.step).toBe(1);
    act(() => result.current.goTo(6));
    expect(result.current.step).toBe(6);
    expect(
      approvalAdvanceMessage({ costApproved: false, blocked: true, hint: 'WEOTT does not match' }),
    ).toBe('WEOTT does not match');
    expect(approvalAdvanceMessage({ costApproved: true, blocked: true })).toBeNull();
  });

  it('runs proposal generation from idle through preparing to error, then to done', async () => {
    const stages: string[] = ['idle'];
    const fin = calcFinancials(financeForm());
    const base = {
      data: {
        ...financeForm(),
        costApproved: false,
        templateId: 'corporate/christmas_event/evening',
        proposalCategory: 'corporate' as const,
        requiresInserts: false,
        selectedInserts: [],
        proposalTimingsNotes: '',
        progressNotes: '',
        budget: '',
        source: '',
        dateFlexible: false,
        quoteVersion: 'V1',
        keyItems: '',
        weeklyPeriod: 'Mon to Thur',
        dayPeriod: 'Evening',
        groupBracket: 'Standard',
        noOfTables: '15',
        guestCountHigh: '40',
        agentReferral: false,
      },
      financeInput: financeForm(),
      fin,
      quoteLead: null,
      leadNotesKey: 'lead-1',
      parity: { ok: true, blockApprove: false, rows: [], hints: [] },
      sheetTargets: null,
      templateResolution: { templateId: 'corporate/christmas_event/evening' },
      prefilledKeys: new Set<string>(),
      confirmedKeys: new Set<string>(),
      fromSavedGenerateRef: { current: false },
      pendingGenerateIdRef: { current: null },
      setErrorMessage: () => undefined,
      setStage: (stage: string) => stages.push(stage),
      setStep: () => undefined,
      navigate: () => undefined,
    };

    await runProposalGeneration(base);
    expect(stages).toEqual(['idle', 'preparing', 'error']);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/pdf' : null) },
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
      text: async () => '',
      clone() {
        return this;
      },
    } as Response);

    const done: string[] = ['idle'];
    await runProposalGeneration({
      ...base,
      data: { ...base.data, costApproved: true },
      setStage: (stage: string) => done.push(stage),
    });
    expect(done).toEqual(['idle', 'preparing', 'sending', 'generating', 'done']);
  }, 15000);
});
