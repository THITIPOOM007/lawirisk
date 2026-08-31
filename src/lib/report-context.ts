import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).optional().nullable();

const complaintPayloadSchema = z.object({
  trackingToken: text(80),
  topic: text(200),
  description: text(4000),
  category: text(80),
  region: text(120),
  incidentDate: text(20),
  incidentTime: text(20),
  incidentLocation: text(500),
  productName: text(300),
  registrationNumber: text(120),
  businessName: text(300),
  businessAddress: text(500),
  purchaseDetails: text(1000),
  desiredAction: text(1000),
  source: text(100),
}).strip();

export type ReportParticipant = {
  role: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  citizen_id?: string | null;
  address?: string | null;
};

export type ReportOfficialCheck = {
  sourceLabel: string;
  sourceUrl: string;
  query: string;
  status: string;
  classification: string;
  summary: string;
  checkedAt: string;
  resultCount: number;
  results: Array<{ title: string; snippet?: string; metadata?: Record<string, string> }>;
};

export type ReportIntakeContext = {
  envelopeId: string;
  receivedAt: string;
  complainantMode: string;
  urgency?: string | null;
  trackingToken?: string | null;
  topic?: string | null;
  description?: string | null;
  category?: string | null;
  region?: string | null;
  incidentDate?: string | null;
  incidentTime?: string | null;
  incidentLocation?: string | null;
  productName?: string | null;
  registrationNumber?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  purchaseDetails?: string | null;
  desiredAction?: string | null;
  triageReason?: string | null;
  participants: ReportParticipant[];
  officialChecks: ReportOfficialCheck[];
};

type RawContextInput = {
  envelope: { id: string; created_at: string; complainant_mode: string; urgency?: string | null; jurisdiction_region?: string | null };
  message?: { raw_payload?: string | null } | null;
  triageReason?: string | null;
  participants?: ReportParticipant[] | null;
  officialChecks?: Array<{
    source_label: string; source_url: string; query_text: string; status: string; classification: string;
    summary: string; checked_at: string; result_count?: number | null; results?: unknown;
  }> | null;
};

function parseResults(value: unknown): ReportOfficialCheck['results'] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim().slice(0, 240) : '';
    if (!title) return [];
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? Object.fromEntries(Object.entries(row.metadata as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .slice(0, 2)
        .map(([key, entry]) => [key.slice(0, 80), entry.slice(0, 80)]))
      : undefined;
    return [{ title, snippet: typeof row.snippet === 'string' ? row.snippet.slice(0, 200) : undefined, metadata }];
  });
}

export function buildReportIntakeContext(input: RawContextInput): ReportIntakeContext {
  let payload: z.infer<typeof complaintPayloadSchema> = {};
  try {
    const parsed = complaintPayloadSchema.safeParse(JSON.parse(input.message?.raw_payload || '{}'));
    if (parsed.success) payload = parsed.data;
  } catch {
    // Non-JSON intake messages are intentionally not copied into a report without review.
  }
  return {
    envelopeId: input.envelope.id,
    receivedAt: input.envelope.created_at,
    complainantMode: input.envelope.complainant_mode,
    urgency: input.envelope.urgency,
    trackingToken: payload.trackingToken,
    topic: payload.topic,
    description: payload.description,
    category: payload.category,
    region: payload.region || input.envelope.jurisdiction_region,
    incidentDate: payload.incidentDate,
    incidentTime: payload.incidentTime,
    incidentLocation: payload.incidentLocation,
    productName: payload.productName,
    registrationNumber: payload.registrationNumber,
    businessName: payload.businessName,
    businessAddress: payload.businessAddress,
    purchaseDetails: payload.purchaseDetails,
    desiredAction: payload.desiredAction,
    triageReason: input.triageReason,
    participants: (input.participants || []).slice(0, 20),
    officialChecks: (input.officialChecks || []).slice(0, 10).map((check) => ({
      sourceLabel: check.source_label,
      sourceUrl: check.source_url,
      query: check.query_text,
      status: check.status,
      classification: check.classification,
      summary: check.summary,
      checkedAt: check.checked_at,
      resultCount: check.result_count || 0,
      results: parseResults(check.results),
    })),
  };
}
