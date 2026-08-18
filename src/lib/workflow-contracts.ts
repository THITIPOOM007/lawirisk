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
  report_type: z.enum(['SUMMARY', 'OVERLAP']),
  title: z.string().trim().min(1).max(300).optional(),
}).strict();
