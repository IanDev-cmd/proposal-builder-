import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lead } from '@/components/LeadPanel';
import { getQuoteLead } from '@/lib/quoteLeadStore';
import { FRESH_QUOTE_BUILDER_EVENT } from '@/lib/quoteBuilderSession';

interface ActiveLeadContextValue {
  activeLead: Lead | null;
  setActiveLead: (lead: Lead | null) => void;
}

const ActiveLeadContext = createContext<ActiveLeadContextValue>({
  activeLead: null,
  setActiveLead: () => {},
});

function leadFromQuoteStore(): Lead | null {
  const q = getQuoteLead();
  if (!q?.name) return null;
  return {
    id: q.id,
    name: q.name,
    email: q.email,
    code: q.referenceNumber,
    designation: q.designation,
    phone: q.phone,
    joined: q.enquiryDate || '—',
    color: q.color || '#FF5A45',
    initials: q.initials,
    sector: q.companySector || '—',
    referenceNumber: q.referenceNumber,
    source: q.source || '—',
    company: q.company,
    status: q.status,
    budget: q.budget,
    repeatClient: typeof q.repeatClient === 'boolean' ? (q.repeatClient ? 'YES' : 'NO') : q.repeatClient,
    preparedBy: q.preparedBy,
    assignedRep: q.assignedRep,
    liveDead: q.liveDead,
    eventType: q.eventType,
    fullEventDate: q.fullEventDate,
    eventDateFlexible: q.eventDateFlexible,
    eventDateFlexibleBool: q.eventDateFlexibleBool,
    eventDateDisplay: q.eventDateDisplay,
    requestedEventTimes: q.requestedEventTimes,
    groupSize: q.groupSize,
    groupSizeQuote: q.groupSizeQuote,
    vessels: q.vessels,
    market: q.market,
    bestTimeToCall: q.bestTimeToCall,
    yearOfEvent: q.yearOfEvent,
    progressNotes: q.progressNotes,
    quoteWeottCost: q.quoteWeottCost,
    quotePackageCost: q.quotePackageCost,
    quoteMarginPercent: q.quoteMarginPercent,
    quoteWeeklyPeriod: q.quoteWeeklyPeriod,
    quoteDayPeriod: q.quoteDayPeriod,
    quoteGroupBracket: q.quoteGroupBracket,
    sapphire: q.sapphire,
  };
}

export function ActiveLeadProvider({ children }: { children: ReactNode }) {
  const [activeLead, setActiveLead] = useState<Lead | null>(() => leadFromQuoteStore());
  useEffect(() => {
    const onFresh = () => setActiveLead(null);
    window.addEventListener(FRESH_QUOTE_BUILDER_EVENT, onFresh);
    return () => window.removeEventListener(FRESH_QUOTE_BUILDER_EVENT, onFresh);
  }, []);
  return (
    <ActiveLeadContext.Provider value={{ activeLead, setActiveLead }}>
      {children}
    </ActiveLeadContext.Provider>
  );
}

export function useActiveLead() {
  return useContext(ActiveLeadContext);
}
