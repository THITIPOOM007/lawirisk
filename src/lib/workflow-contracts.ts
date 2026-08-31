import { z } from 'zod';

export const entityTypeSchema = z.enum([
  'PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION',
]);

export const manualSuggestionSchema = z.object({
  case_id: z.string().uuid(),
  evidence_id: z.string().uuid(),
  page_number: z.number().int().min(1).max(100_000),
  source_text: z.string().trim().min(1).max(4000),
  source_location: z.record(z.string(), z.unknown()).default({}),
  entity_type: entityTypeSchema,
  candidate_value: z.string().trim().min(1).max(1000),
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const aiExtractionRequestSchema = z.object({
  case_id: z.string().uuid(),
  evidence_id: z.string().uuid(),
  page_number: z.number().int().min(1).max(100_000),
  source_text: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(1).max(4000).optional(),
  ),
  source_location: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const automationJobCreateSchema = aiExtractionRequestSchema;

export const automationRunRequestSchema = z.object({
  dispatch_id: z.string().uuid(),
  external_execution_id: z.string().trim().min(1).max(200).optional(),
}).strict();

export const aiExtractionCandidateSchema = z.object({
  entity_type: entityTypeSchema,
  candidate_value: z.string().trim().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const aiExtractionProviderResultSchema = z.object({
  candidates: z.array(aiExtractionCandidateSchema).max(20),
}).strict();

export type AiExtractionCandidate = z.infer<typeof aiExtractionCandidateSchema>;

export const reviewSuggestionSchema = z.object({
  decision: z.enum(['CONFIRMED', 'REJECTED', 'UNCERTAIN']),
  reason: z.string().trim().min(1).max(2000),
  edited_value: z.string().trim().min(1).max(1000).optional(),
}).strict();

export const matchReviewSchema = z.object({
  decision: z.enum(['VERIFIED', 'DISMISSED']),
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const createReportSchema = z.object({
  case_id: z.string().trim().min(1).max(100),
  report_type: z.enum(['SUMMARY', 'OVERLAP', 'PREDICTION_FORM']),
  title: z.string().trim().min(1).max(300).optional(),
}).strict();

export const batchReviewSuggestionsSchema = z.object({
  items: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    reason: z.string().trim().min(1).max(2000),
    edited_value: z.string().trim().min(1).max(1000).optional(),
  }).strict()).min(2).max(50),
}).strict();

export const evidenceScreeningRequestSchema = z.object({
  case_id: z.string().trim().min(1).max(100),
}).strict();

export const evidenceScreeningReviewSchema = z.object({
  decision: z.enum(['CONFIRMED', 'REJECTED', 'UNCERTAIN']),
  reason: z.string().trim().min(1).max(2000),
}).strict();
