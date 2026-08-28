/**
 * QuoteLead — handed from Lead panel → Quote Builder.
 * Fields mirror Structure all Leads1 Sapphire aliases.
 * Dual-written to sessionStorage + localStorage so a refresh still restores the lead.
 */

const STORAGE_KEY = 'nexus.quoteLead';
const PERSIST_KEY = 'nexus.quoteLead.persistent';

export type QuoteLead = {
  id: number;
  name: string;
  email: string;
  phone: string;
  designation: string;
  company: string;
  referenceNumber: string;
  initials: string;
  color: string;
  /** Raw Source tag from Enquiry */
  source?: string;
  companySector?: string;
  budget?: string;
  /** YES/NO/blank from "Repeat Client: … booked with us?" */
  repeatClient?: string | boolean;
  preparedBy?: string;
  assignedRep?: string;
  status?: string;
  liveDead?: string;
  enquiryDate?: string;
  eventType?: string;
  fullEventDate?: string;
  eventDateFlexible?: string;
  eventDateFlexibleBool?: boolean;
  /** "Date TBC" when flexible, else fullEventDate */
  eventDateDisplay?: string;
  requestedEventTimes?: string;
  groupSize?: string;
  /** Lower bound of group size range */
  groupSizeQuote?: number | string;
  vessels?: string;
  market?: string;
  bestTimeToCall?: string;
  yearOfEvent?: string;
  /** Concatenated Progress 1…N */
  progressNotes?: string;
  /** Optional Quote Sheet columns — authoritative for financial cross-check */
  quoteWeottCost?: number | string;
  quotePackageCost?: number | string;
  quoteMarginPercent?: number | string;
  quoteWeeklyPeriod?: string;
  quoteDayPeriod?: string;
  quoteGroupBracket?: string;
  /** Full Sapphire alias bag — pass through as nexusLead without re-mapping. */
  sapphire?: import('@/lib/sapphireLead').SapphireLead;
};

export function setQuoteLead(lead: QuoteLead): boolean {
  try {
    const raw = JSON.stringify(lead);
    sessionStorage.setItem(STORAGE_KEY, raw);
    try {
      localStorage.setItem(PERSIST_KEY, raw);
    } catch {
      /* quota — session copy still works this tab */
    }
    return true;
  } catch {
    return false;
  }
}

export function getQuoteLead(): QuoteLead | null {
  try {
    const session = sessionStorage.getItem(STORAGE_KEY);
    if (session) return JSON.parse(session) as QuoteLead;
  } catch {
    /* fall through */
  }
  try {
    const persisted = localStorage.getItem(PERSIST_KEY);
    if (persisted) {
      const lead = JSON.parse(persisted) as QuoteLead;
      try {
        sessionStorage.setItem(STORAGE_KEY, persisted);
      } catch {
        /* ignore */
      }
      return lead;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearQuoteLead(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* no-op */
  }
}

const START_STEP_KEY = 'nexus.quoteBuilder.startStep';

export function markQuoteBuilderStartAt(step: number): void {
  try {
    sessionStorage.setItem(START_STEP_KEY, String(step));
  } catch {
    /* ignore */
  }
}

export function consumeQuoteBuilderStartStep(): number | null {
  try {
    const raw = sessionStorage.getItem(START_STEP_KEY);
    sessionStorage.removeItem(START_STEP_KEY);
    const n = Number(raw);
    return n >= 1 && n <= 7 ? n : null;
  } catch {
    return null;
  }
}
