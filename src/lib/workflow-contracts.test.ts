import { describe, expect, it } from 'vitest';
import { createReportSchema, matchReviewSchema, reviewSuggestionSchema } from './workflow-contracts';

describe('human review workflow contracts', () => {
  it('requires reasons for entity and match decisions', () => {
    expect(reviewSuggestionSchema.safeParse({ decision: 'CONFIRMED', reason: '' }).success).toBe(false);
    expect(matchReviewSchema.safeParse({ decision: 'VERIFIED' }).success).toBe(false);
  });

  it('rejects client-controlled report fields', () => {
    expect(createReportSchema.safeParse({ case_id: 'case-1', report_type: 'SUMMARY', created_by: 'attacker' }).success).toBe(false);
  });
});
