/**
 * QuoteLead — handed from Lead panel → Quote Builder.
 * Fields mirror n8n Structure all Leads1 Sapphire aliases.
 */

const STORAGE_KEY = 'nexus.quoteLead';

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
  /** Full n8n alias bag — pass through as nexusLead without re-mapping. */
  sapphire?: import('@/lib/sapphireLead').N8nSapphireLead;
};

export function setQuoteLead(lead: QuoteLead): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(lead));
  } catch {
    /* ignore */
  }
}

export function getQuoteLead(): QuoteLead | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QuoteLead) : null;
  } catch {
    return null;
  }
}

export function clearQuoteLead(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* no-op */
  }
}
