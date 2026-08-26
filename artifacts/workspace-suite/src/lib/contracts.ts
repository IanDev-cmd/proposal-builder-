/**
 * Runtime contracts for Apps Script / Gemini / Flask ↔ UI payloads.
 * Wire validation only — does not change Sheets write-back behaviour.
 * ContractSync / PayloadContractCheck n8n webhooks are deleted from the UX;
 * this Zod file is the contract.
 */
import { z } from 'zod';

export const failureEventSchema = z.object({
  type: z.literal('FailureEvent'),
  source: z.string(),
  reason: z.string(),
  httpStatus: z.number().int().optional(),
  details: z.unknown().optional(),
});
export type FailureEvent = z.infer<typeof failureEventSchema>;

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]).optional();

/** Structure-all-Leads1 row (Apps Script port). Extra sheet headers are allowed. */
export const n8nLeadRowSchema = z
  .object({
    referenceNumber: scalar,
    name: scalar,
    companyName: scalar,
    companySector: scalar,
    email: scalar,
    phone: scalar,
    jobRole: scalar,
    budget: scalar,
    repeatClient: scalar,
    preparedBy: scalar,
    assignedRep: scalar,
    status: scalar,
    liveDead: scalar,
    source: scalar,
    enquiryDate: scalar,
    eventType: scalar,
    fullEventDate: scalar,
    eventDateFlexible: scalar,
    eventDateFlexibleBool: z.union([z.boolean(), z.string()]).optional(),
    eventDateDisplay: scalar,
    requestedEventTimes: scalar,
    groupSize: scalar,
    groupSizeQuote: scalar,
    vessels: scalar,
    market: scalar,
    bestTimeToCall: scalar,
    yearOfEvent: scalar,
    progressNotes: scalar,
    quoteWeottCost: scalar,
    quotePackageCost: scalar,
    quoteMarginPercent: scalar,
    quoteWeeklyPeriod: scalar,
    quoteDayPeriod: scalar,
    quoteGroupBracket: scalar,
    id: scalar,
    row_number: scalar,
  })
  .passthrough();

export type N8nLeadRow = z.infer<typeof n8nLeadRowSchema>;

export const leadDataFetchResponseSchema = z
  .object({
    ok: z.boolean().optional(),
    count: z.number().optional(),
    leads: z.array(n8nLeadRowSchema).default([]),
    failureEvent: failureEventSchema.optional(),
  })
  .passthrough();

export type LeadDataFetchResponse = z.infer<typeof leadDataFetchResponseSchema>;

const catalogLineSchema = z.object({
  id: z.string().optional(),
  section: z.string().optional(),
  label: z.string().optional(),
  multiplier: z.string().optional(),
});

export const costRatesPayloadSchema = z
  .object({
    ok: z.boolean().optional(),
    source: z.string().optional(),
    note: z.string().optional(),
    vesselRates: z.array(z.record(z.string(), z.unknown())).optional(),
    cateringRates: z.array(z.record(z.string(), z.unknown())).optional(),
    costMother: z
      .object({
        source: z.string().optional(),
        items: z.array(
          z.object({
            row: z.number().optional(),
            label: z.string(),
            rates: z.record(z.string(), z.number()),
          }),
        ),
        margins: z
          .array(
            z.object({
              eventService: z.string(),
              market: z.string(),
              months: z.record(z.string(), z.number()),
            }),
          )
          .optional(),
      })
      .nullable()
      .optional(),
    lines: z.array(catalogLineSchema).optional(),
    vessels: z.array(z.string()).optional(),
    costMotherItems: z.array(z.record(z.string(), z.unknown())).optional(),
    quoteBuilder2026: z.array(z.record(z.string(), z.unknown())).optional(),
    margins: z.array(z.record(z.string(), z.unknown())).optional(),
    staffRatios: z.array(z.record(z.string(), z.unknown())).optional(),
    cutleryRatios: z.array(z.record(z.string(), z.unknown())).optional(),
    counts: z.record(z.string(), z.number()).optional(),
    catalogBuiltAt: z.string().optional(),
    failureEvent: failureEventSchema.optional(),
  })
  .passthrough();

export type CostRatesContract = z.infer<typeof costRatesPayloadSchema>;

export const prefillMatchSchema = z.object({
  field: z.string(),
  value: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
  evidence_span: z.string().default(''),
});

export const prefillHealerResponseSchema = z.object({
  matches: z.array(prefillMatchSchema).default([]),
  model: z.string().optional(),
  failureEvent: failureEventSchema.optional(),
});

export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function parsePrefillHealerResponse(input: unknown): PrefillMatch[] {
  const parsed = prefillHealerResponseSchema.safeParse(input);
  if (!parsed.success) return [];
  if (parsed.data.failureEvent) return [];
  return parsed.data.matches.filter((m) => m.field && (m.value || m.evidence_span));
}

export type PrefillMatch = z.infer<typeof prefillMatchSchema>;

const pointKindSchema = z.enum([
  'budget',
  'calls',
  'research',
  'logistics',
  'pipeline',
  'history',
  'guests',
  'timing',
  'catering',
  'enquiry',
  'discovery',
  'general',
]);

export const leadNotePointSchema = z.object({
  title: z.string().default('Note'),
  summary: z.string().default(''),
  kind: pointKindSchema.default('general'),
  kinds: z.array(pointKindSchema).optional(),
  when: z.string().default(''),
  evidence: z.string().default(''),
});

export const leadNotesSummaryResponseSchema = z.object({
  points: z.array(leadNotePointSchema).default([]),
  model: z.string().optional(),
  failureEvent: failureEventSchema.optional(),
});

export type LeadNotePointPayload = z.infer<typeof leadNotePointSchema>;
export type LeadNotesSummaryResponse = z.infer<typeof leadNotesSummaryResponseSchema>;

export function parseLeadNotesSummaryResponse(input: unknown): LeadNotePointPayload[] {
  const parsed = leadNotesSummaryResponseSchema.safeParse(input);
  if (!parsed.success) return [];
  if (parsed.data.failureEvent) return [];
  return parsed.data.points.filter((p) => p.title || p.summary || p.evidence);
}

export function formatZodIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function extractLeadRows(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  const o = input as Record<string, unknown>;
  if (Array.isArray(o.leads)) return o.leads;
  if (Array.isArray(o.data)) return o.data;
  if (Array.isArray(o.body)) return o.body;
  if (o.body && typeof o.body === 'object' && Array.isArray((o.body as { leads?: unknown[] }).leads)) {
    return (o.body as { leads: unknown[] }).leads;
  }
  return [];
}

export function parseLeadDataFetch(input: unknown): LeadDataFetchResponse {
  const parsed = leadDataFetchResponseSchema.safeParse(input);
  if (parsed.success) {
    if (parsed.data.failureEvent) {
      throw new Error(
        parsed.data.failureEvent.reason || `LeadDataFetch FailureEvent from ${parsed.data.failureEvent.source}`,
      );
    }
    return parsed.data;
  }
  const rows = extractLeadRows(input).filter((row) => row && typeof row === 'object');
  if (rows.length) {
    return { ok: true, leads: rows as N8nLeadRow[] };
  }
  throw new Error(`LeadDataFetch contract failed: ${formatZodIssues(parsed.error)}`);
}

export function parseCostRatesPayload(input: unknown): CostRatesContract {
  const parsed = costRatesPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`CostRatesFetch contract failed: ${formatZodIssues(parsed.error)}`);
  }
  if (parsed.data.failureEvent) {
    throw new Error(
      parsed.data.failureEvent.reason || `CostRatesFetch FailureEvent from ${parsed.data.failureEvent.source}`,
    );
  }
  return parsed.data;
}
