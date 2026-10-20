import type { MutableRefObject } from 'react';
import { addProposal } from '@/lib/proposalStore';
import {
  filenameFromContentDisposition,
  proposalFileStem,
  proposalFilenameFromRecord,
} from '@/lib/proposalFilename';
import { buildStargtmPayload, calcFinancials, type QuoteFormInput } from '@/lib/quoteFinance';
import { writeQuoteStatus } from '@/lib/sheetsSync';
import { resolveStaffContactFromInsertIds } from '@/lib/staffContacts';
import { formatPhoneDisplay } from '@/lib/phoneFormat';
import {
  buildItineraryProposalBlock,
  formatEventTimingsPayload,
  parseItineraryProposalText,
} from '@/lib/proposalTimings';
import { PROPOSAL_INSERTS } from '@/lib/proposalAssets';
import { PROPOSAL_ENGINE_GENERATE_URL } from '@/lib/backendUrls';
import { blobToDataUrl, fetchWithTimeout } from '@/lib/http';
import { engineAuthHeaders, notifyTeamAuthExpired } from '@/lib/teamSession';
import { insertsForGenerate } from '@/lib/proposalPrefill';
import { costApprovalBlocked, type FinancialParityReport } from '@/lib/financialParity';
import type { SheetFinancialColumns } from '@/lib/progressNotesFinance';
import { itineraryOverlayWording } from '@/lib/goldPackageWording';
import { formatEventDateForProposal } from '@/lib/goldScenarioCover';
import { hasPendingPrefillConfirms } from '@/lib/prefillConfirm';
import { toastError } from '@/lib/notify';
import { quoteNeedsApprovalFirst } from '@/lib/quoteReview';
import { errorMessage as formatError } from '@/lib/errors';
import {
  humanizeEngineWarning,
  layoutOverflowMessages,
  parseEngineWarningHeader,
} from '@/lib/engineWarnings';
import { clearQuoteLead, type QuoteLead } from '@/lib/quoteLeadStore';
import { getSavedQuote, listSavedQuotes, persistSavedQuote } from '@/lib/savedQuotesStore';
import { savedQuoteId as versionedQuoteId } from '@/lib/quoteBuilderCatalog';
import { LAST_CONTENT_STEP } from '@/pages/forms/useQuoteWizardState';

type GenerationStage = 'idle' | 'preparing' | 'sending' | 'generating' | 'done' | 'error';

type GenerateForm = QuoteFormInput & {
  costApproved: boolean;
  templateId: string;
  proposalCategory: 'corporate' | 'wedding';
  requiresInserts: boolean;
  selectedInserts: string[];
  proposalTimingsNotes: string;
  progressNotes: string;
  budget: string;
  source: string;
  dateFlexible: boolean;
  quoteVersion: string;
  keyItems: string;
  weeklyPeriod: string;
  dayPeriod: string;
  groupBracket: string;
  noOfTables: string;
  guestCountHigh: string;
  vesselType: string[];
};

export type ProposalGenerationContext = {
  data: GenerateForm;
  financeInput: QuoteFormInput;
  fin: ReturnType<typeof calcFinancials>;
  quoteLead: QuoteLead | null;
  leadNotesKey: string;
  parity: FinancialParityReport;
  sheetTargets: SheetFinancialColumns | null;
  templateResolution: { templateId?: string };
  prefilledKeys: Set<string>;
  confirmedKeys: Set<string>;
  fromSavedGenerateRef: MutableRefObject<boolean>;
  pendingGenerateIdRef: MutableRefObject<string | null>;
  setErrorMessage: (message: string) => void;
  setStage: (stage: GenerationStage) => void;
  setStep: (step: number | ((current: number) => number)) => void;
  navigate: (path: string) => void;
};

async function sheetsWrite(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    toastError({
      key: `sheets:${label}`,
      title: 'Sheets sync failed',
      description: `${label} — ${formatError(err)}`,
      err,
    });
    return false;
  }
}

/** POST /generate with the same body the wizard built inline. Flask does not recalculate money. */
export async function runProposalGeneration(ctx: ProposalGenerationContext): Promise<void> {
  const {
    data,
    financeInput,
    fin,
    quoteLead,
    leadNotesKey,
    parity,
    sheetTargets,
    templateResolution,
    prefilledKeys,
    confirmedKeys,
    fromSavedGenerateRef,
    pendingGenerateIdRef,
    setErrorMessage,
    setStage,
    setStep,
    navigate,
  } = ctx;

  setErrorMessage('');
  setStage('preparing');

  const fromSavedQuote = Boolean(fromSavedGenerateRef.current || pendingGenerateIdRef.current);
  const savedForReview =
    (pendingGenerateIdRef.current && getSavedQuote(pendingGenerateIdRef.current)) ||
    listSavedQuotes().find((quote) => quote.leadKey === leadNotesKey) ||
    null;
  if (quoteNeedsApprovalFirst(savedForReview) && !data.costApproved) {
    toastError({
      key: 'approve-quote-first',
      title: 'Approve Quote First',
      description: 'You can still generate this proposal.',
      duration: 8000,
    });
  }

  if (!data.costApproved && !fromSavedQuote) {
    setErrorMessage('Confirm cost cross-check approval before Proposal Pack / generate.');
    setStage('error');
    setStep(6);
    return;
  }

  if (!fromSavedQuote && costApprovalBlocked(parity, sheetTargets)) {
    setErrorMessage(
      parity.hints[0] ||
        'Financial cross-check failed — align WEOTT cost with Quote Sheet before generating.',
    );
    setStage('error');
    setStep(6);
    return;
  }

  const templateId = data.templateId || templateResolution.templateId;
  if (!templateId) {
    setErrorMessage('Select a proposal template in Proposal Pack before generating.');
    setStage('error');
    setStep(7);
    return;
  }

  if (
    !fromSavedQuote &&
    hasPendingPrefillConfirms({
      prefilledKeys,
      confirmedKeys,
      requiresInserts: data.requiresInserts,
      selectedInserts: data.selectedInserts,
    })
  ) {
    setErrorMessage('Confirm all blue suggestions (template + inserts) before generating.');
    setStage('error');
    setStep(7);
    return;
  }

  const generateInserts = insertsForGenerate(data);
  const staffContact = resolveStaffContactFromInsertIds(generateInserts, PROPOSAL_INSERTS);
  const timingBlock =
    parseItineraryProposalText(data.proposalTimingsNotes) ||
    buildItineraryProposalBlock({
      embarkation: data.embarkation,
      departure: data.departure,
      returnTime: data.returnTime,
      disembarkation: data.disembarkation,
    });
  const packageWording = itineraryOverlayWording(timingBlock);

  const payload = buildStargtmPayload({
    form: financeInput,
    financials: fin,
    lead: quoteLead
      ? {
          name: quoteLead.name,
          email: quoteLead.email,
          phone: formatPhoneDisplay(quoteLead.phone),
          company: quoteLead.company,
          referenceNumber: quoteLead.referenceNumber,
          designation: quoteLead.designation,
          preparedBy: quoteLead.preparedBy,
          assignedRep: quoteLead.assignedRep,
          budget: quoteLead.budget || data.budget,
          vessels: quoteLead.vessels,
          market: quoteLead.market,
          source: quoteLead.source || data.source,
          yearOfEvent: quoteLead.yearOfEvent,
          repeatClient: data.repeatClient,
          eventDateDisplay: formatEventDateForProposal({
            eventDate: data.eventDate,
            dateFlexible: data.dateFlexible,
            fullEventDate: quoteLead.fullEventDate,
            eventDateDisplay: quoteLead.eventDateDisplay,
          }),
          eventDateFlexibleBool: data.dateFlexible,
          requestedEventTimes: quoteLead.requestedEventTimes,
          groupSize: quoteLead.groupSize,
          groupSizeQuote: quoteLead.groupSizeQuote,
          progressNotes: data.progressNotes,
        }
      : null,
    nexusLead: quoteLead
      ? {
          ...(quoteLead.sapphire || {}),
          referenceNumber: quoteLead.referenceNumber,
          name: quoteLead.name,
          companyName: quoteLead.company,
          companySector: quoteLead.companySector,
          email: quoteLead.email,
          phone: formatPhoneDisplay(quoteLead.phone),
          jobRole: quoteLead.designation,
          budget: data.budget || quoteLead.budget,
          repeatClient: data.repeatClient ? 'YES' : 'NO',
          preparedBy: quoteLead.preparedBy,
          assignedRep: quoteLead.assignedRep || quoteLead.preparedBy,
          status: quoteLead.status,
          liveDead: quoteLead.liveDead,
          source: data.source || quoteLead.source,
          enquiryDate: quoteLead.enquiryDate,
          eventType: data.eventType || quoteLead.eventType,
          fullEventDate: quoteLead.fullEventDate,
          eventDateFlexible: data.dateFlexible ? 'YES' : quoteLead.eventDateFlexible || 'NO',
          eventDateFlexibleBool: data.dateFlexible,
          eventDateDisplay: formatEventDateForProposal({
            eventDate: data.eventDate,
            dateFlexible: data.dateFlexible,
            fullEventDate: quoteLead.fullEventDate,
            eventDateDisplay: quoteLead.eventDateDisplay,
          }),
          requestedEventTimes: formatEventTimingsPayload(data),
          groupSize: data.guestCount || quoteLead.groupSize,
          groupSizeQuote: parseFloat(data.guestCount) || quoteLead.groupSizeQuote,
          vessels: data.vesselType.join(', ') || quoteLead.vessels,
          market: quoteLead.market,
          bestTimeToCall: quoteLead.bestTimeToCall,
          yearOfEvent: quoteLead.yearOfEvent,
          progressNotes: data.progressNotes || quoteLead.progressNotes,
          agent: data.agentReferral ? 'YES' : '',
          contact_name: staffContact.name,
          contact_title: staffContact.title,
          contact_phone: staffContact.phone,
          contact_mobile: staffContact.mobile,
          contact_email: staffContact.email,
        }
      : null,
    templateId,
    category: data.proposalCategory,
    selectedInserts: generateInserts,
    progressNotes: data.progressNotes,
    packageWording,
    staffContact,
    fullEventDate: quoteLead?.fullEventDate,
  });

  setStage('sending');

  try {
    void sheetsWrite('Quote status (generating)', () =>
      writeQuoteStatus({
        referenceNumber: quoteLead?.referenceNumber,
        email: quoteLead?.email,
        leadName: quoteLead?.name,
        status: 'generating',
        version: data.quoteVersion,
        title: `${data.eventType || 'Event'} Proposal`,
        eventType: data.eventType,
        eventDate: data.eventDate,
        guestCount: data.guestCount,
        guestCountHigh: data.guestCountHigh,
        guests: parseFloat(data.guestCount) || 0,
        repeatClient: data.repeatClient,
        agentReferral: data.agentReferral,
        selectedUpgrades: data.selectedUpgrades,
        selectedLineLabels: (fin.lines || []).map((line) => line.label),
        selectedLineIds: data.selectedLineIds,
        keyItems: data.keyItems,
        weeklyPeriod: data.weeklyPeriod || fin.rateParts?.weeklyPeriod,
        dayPeriod: data.dayPeriod || fin.rateParts?.dayPeriod,
        groupBracket: data.groupBracket || fin.rateParts?.groupBracket,
        noOfTables: data.noOfTables,
        templateId: data.templateId,
        selectedInserts: generateInserts,
        staffContact: staffContact.name,
        baseCost: fin.baseCost,
        subtotalBeforeContingency: fin.subtotalBeforeContingency,
        contingency: fin.contingency,
        contingencyRate: fin.contingencyRate,
        margin: fin.margin,
        marginAmount: fin.marginAmount,
        discountPercent: fin.discountPercent,
        discountAmount: fin.discountAmount,
        commissionPercent: fin.commissionPercent,
        commissionAmount: fin.commissionAmount,
        updatedProfit: fin.updatedProfit,
        costPerGuestExc: fin.costPerGuestExc,
        costPerGuestInc: fin.costPerGuestInc,
        costToClient: fin.costToClient,
        packageCost: fin.costToClient,
        vat: fin.vat,
        vatRate: fin.vatRate,
        upgradeTotal: fin.upgradeTotal,
        grandTotal: fin.grand,
        sectionTotals: fin.sectionTotals,
      }),
    );

    setStage('generating');
    const res = await fetchWithTimeout(PROPOSAL_ENGINE_GENERATE_URL, {
      method: 'POST',
      headers: engineAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      timeoutMs: 120_000,
    });

    if (res.status === 401) {
      notifyTeamAuthExpired();
      throw new Error('Session expired. Sign in with the team PIN and try again.');
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let detail = errText.trim().slice(0, 240);
      try {
        const parsed = JSON.parse(errText) as { error?: string; validation_errors?: unknown };
        const overflow = layoutOverflowMessages(parsed?.validation_errors);
        if (overflow.length) {
          detail = overflow.join(' ');
        } else if (Array.isArray(parsed?.validation_errors) && parsed.validation_errors.length) {
          detail = parsed.validation_errors.map((item) => humanizeEngineWarning(String(item))).join('; ');
        } else if (parsed?.error) {
          detail = parsed.error;
        }
      } catch {
        /* keep raw text */
      }
      throw new Error(
        detail
          ? `Proposal engine responded ${res.status}: ${detail}`
          : `Proposal engine responded ${res.status} (empty body) from ${PROPOSAL_ENGINE_GENERATE_URL}`,
      );
    }

    const overflowNotices = layoutOverflowMessages(parseEngineWarningHeader(res.headers.get('X-Warnings')));
    if (overflowNotices.length) {
      toastError({
        key: 'layout-overflow',
        title: overflowNotices[0],
        description: overflowNotices.slice(1).join(' ') || 'The proposal PDF was still generated.',
      });
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    let pdfDataUrl = '';

    if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
      pdfDataUrl = await blobToDataUrl(await res.blob());
    } else {
      const peek = await res.clone().arrayBuffer();
      const bytes = new Uint8Array(peek.slice(0, 5));
      const isPdf =
        bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46;
      if (isPdf) {
        pdfDataUrl = await blobToDataUrl(new Blob([peek], { type: 'application/pdf' }));
      } else {
        throw new Error(
          `Proposal engine returned ${contentType || 'no Content-Type'}; expected application/pdf.`,
        );
      }
    }

    const proposalId = `proposal-${Date.now()}`;
    const fileStem = proposalFileStem({
      contactName: quoteLead?.name,
      companyName: quoteLead?.company,
      referenceCode: quoteLead?.referenceNumber,
      quoteVersion: data.quoteVersion,
    });
    const filename = proposalFilenameFromRecord({
      filename:
        res.headers.get('X-Proposal-Filename') ||
        filenameFromContentDisposition(res.headers.get('Content-Disposition')) ||
        `${fileStem}.pdf`,
      title: fileStem,
      leadName: quoteLead?.name,
      leadCompany: quoteLead?.company,
      referenceNumber: quoteLead?.referenceNumber,
    });
    const saved = await addProposal({
      id: proposalId,
      createdAt: new Date().toISOString(),
      eventDate: data.eventDate,
      title: fileStem,
      filename,
      vesselType: data.vesselType.join(', '),
      eventType: data.eventType,
      guestCount: data.guestCount,
      grandTotal: fin.grand,
      pdfDataUrl,
      leadName: quoteLead?.name,
      leadEmail: quoteLead?.email,
      leadCompany: quoteLead?.company,
      referenceNumber: quoteLead?.referenceNumber,
    });

    if (!saved) {
      throw new Error(
        'The PDF was generated but is too large to store in this browser — clear some space (e.g. delete older proposals) and try again.',
      );
    }

    const versionId = versionedQuoteId(leadNotesKey, data.quoteVersion);
    const savedQuoteId =
      pendingGenerateIdRef.current ||
      (getSavedQuote(versionId) ? versionId : null) ||
      listSavedQuotes().find((quote) => quote.leadKey === leadNotesKey)?.id ||
      null;
    if (savedQuoteId) {
      const quote = getSavedQuote(savedQuoteId);
      if (quote) {
        try {
          await persistSavedQuote({ ...quote, proposalId });
        } catch (err) {
          const localSaved = Boolean((err as { localSaved?: boolean }).localSaved);
          if (!localSaved) throw err;
          toastError({
            key: 'quote-cloud',
            title: 'Proposal is ready',
            description:
              'The PDF is saved on this device. Linking it on the shared workspace will retry automatically.',
            err,
          });
        }
      }
      pendingGenerateIdRef.current = null;
    }

    void sheetsWrite('Quote status (ready)', () =>
      writeQuoteStatus({
        referenceNumber: quoteLead?.referenceNumber,
        email: quoteLead?.email,
        leadName: quoteLead?.name,
        status: 'ready',
        version: data.quoteVersion,
        eventType: data.eventType,
        eventDate: data.eventDate,
        guestCount: data.guestCount,
        guestCountHigh: data.guestCountHigh,
        grandTotal: fin.grand,
        costToClient: fin.costToClient,
        vat: fin.vat,
        updatedProfit: fin.updatedProfit,
        costPerGuestInc: fin.costPerGuestInc,
        templateId: data.templateId,
        selectedLineLabels: (fin.lines || []).map((line) => line.label),
      }),
    );

    clearQuoteLead();
    setStage('done');
    setTimeout(() => navigate('/proposal-doc'), 400);
  } catch (err) {
    const msg = formatError(err, 'Failed to generate the proposal.');
    setErrorMessage(msg);
    setStage('error');
    toastError({
      key: 'generate',
      title: 'Proposal generation failed',
      description: msg,
    });
    void writeQuoteStatus({
      referenceNumber: quoteLead?.referenceNumber,
      email: quoteLead?.email,
      leadName: quoteLead?.name,
      status: 'failed',
      version: data.quoteVersion,
    }).catch(() => {
      /* sheet write-back is best-effort */
    });
  }
}

export { LAST_CONTENT_STEP };
