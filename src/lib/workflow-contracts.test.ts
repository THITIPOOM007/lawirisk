import { describe, expect, it } from 'vitest';
import {
  aiExtractionProviderResultSchema,
  aiExtractionRequestSchema,
  automationJobCreateSchema,
  automationRunRequestSchema,
  createReportSchema,
  evidenceScreeningRequestSchema,
  evidenceScreeningReviewSchema,
  matchReviewSchema,
  reviewSuggestionSchema,
} from './workflow-contracts';

describe('human review workflow contracts', () => {
  it('requires reasons for entity and match decisions', () => {
    expect(reviewSuggestionSchema.safeParse({ decision: 'CONFIRMED', reason: '' }).success).toBe(false);
    expect(matchReviewSchema.safeParse({ decision: 'VERIFIED' }).success).toBe(false);
  });

  it('rejects client-controlled report fields', () => {
    expect(createReportSchema.safeParse({ case_id: 'case-1', report_type: 'SUMMARY', created_by: 'attacker' }).success).toBe(false);
    expect(createReportSchema.safeParse({ case_id: 'case-1', report_type: 'PREDICTION_FORM' }).success).toBe(true);
  });

  it('requires a UUID and review reason for evidence screening', () => {
    const caseId = '11111111-1111-4111-8111-111111111111';
    expect(evidenceScreeningRequestSchema.safeParse({ case_id: caseId }).success).toBe(true);
    expect(evidenceScreeningReviewSchema.safeParse({ decision: 'CONFIRMED', reason: 'ตรวจต้นฉบับและ hash แล้ว' }).success).toBe(true);
    expect(evidenceScreeningReviewSchema.safeParse({ decision: 'CONFIRMED', reason: '' }).success).toBe(false);
  });

  it('bounds AI extraction input and validates provider output', () => {
    const request = {
      case_id: '11111111-1111-4111-8111-111111111111',
      evidence_id: '22222222-2222-4222-8222-222222222222',
      page_number: 1,
      source_text: 'บริษัทตัวอย่าง จำกัด โทร 0123456789',
      source_location: {},
    };
    expect(aiExtractionRequestSchema.safeParse(request).success).toBe(true);
    expect(automationJobCreateSchema.safeParse(request).success).toBe(true);
    const blankSource = aiExtractionRequestSchema.parse({ ...request, source_text: '   ' });
    expect(blankSource.source_text).toBeUndefined();
    expect(aiExtractionRequestSchema.safeParse({ ...request, source_text: 'x'.repeat(4001) }).success).toBe(false);
    expect(aiExtractionProviderResultSchema.safeParse({ candidates: [{
      entity_type: 'ORGANIZATION',
      candidate_value: 'บริษัทตัวอย่าง จำกัด',
      confidence: 0.91,
      reason: 'ปรากฏชื่อองค์กรในข้อความต้นทาง',
    }] }).success).toBe(true);
    expect(aiExtractionProviderResultSchema.safeParse({ candidates: [{
      entity_type: 'GUILT',
      candidate_value: 'ผิด',
      confidence: 1,
      reason: 'model decision',
    }] }).success).toBe(false);
  });

  it('accepts only bounded n8n callback metadata', () => {
    expect(automationRunRequestSchema.safeParse({
      dispatch_id: '33333333-3333-4333-8333-333333333333',
      external_execution_id: 'n8n-execution-42',
    }).success).toBe(true);
    expect(automationRunRequestSchema.safeParse({
      dispatch_id: 'not-a-uuid',
      source_text: 'must never arrive from n8n',
    }).success).toBe(false);
  });
});
