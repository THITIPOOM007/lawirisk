import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { satisfactionSubmissionSchema, summarizeSatisfaction, type SatisfactionRecord } from '@/lib/satisfaction-contract';

const validPublicSubmission = {
  audience: 'PUBLIC' as const,
  context: 'PUBLIC_SEARCH' as const,
  interactionId: '8fa1d7c7-3ff5-47c7-9b77-10b88212d938',
  convenience: 5,
  speed: 4,
  accuracy: 3,
  overall: 4,
  suggestion: 'ค้นหาได้ง่าย',
};

describe('satisfaction contract', () => {
  it('accepts complete ratings and normalizes optional feedback', () => {
    expect(satisfactionSubmissionSchema.parse({ ...validPublicSubmission, suggestion: '  ใช้งานง่าย  ' })).toMatchObject({
      suggestion: 'ใช้งานง่าย',
      overall: 4,
    });
  });

  it('rejects invalid ratings, oversized suggestions, and mismatched audience context', () => {
    expect(satisfactionSubmissionSchema.safeParse({ ...validPublicSubmission, speed: 0 }).success).toBe(false);
    expect(satisfactionSubmissionSchema.safeParse({ ...validPublicSubmission, suggestion: 'ก'.repeat(1001) }).success).toBe(false);
    expect(satisfactionSubmissionSchema.safeParse({ ...validPublicSubmission, audience: 'STAFF' }).success).toBe(false);
  });

  it('calculates combined, audience, dimension, context, and recent-feedback summaries', () => {
    const records: SatisfactionRecord[] = [
      { ...validPublicSubmission, id: 'public', staffUserId: null, createdAt: '2026-08-30T08:00:00.000Z' },
      {
        ...validPublicSubmission,
        id: 'staff',
        audience: 'STAFF',
        context: 'STAFF_SESSION',
        interactionId: 'f59d5019-89c0-45a6-af74-458675502f38',
        convenience: 3,
        speed: 2,
        accuracy: 5,
        overall: 2,
        suggestion: 'เพิ่มตัวกรอง',
        staffUserId: 'staff-id',
        createdAt: '2026-08-31T08:00:00.000Z',
      },
    ];

    const summary = summarizeSatisfaction(records);
    expect(summary).toMatchObject({
      totalResponses: 2,
      averageRating: 3,
      satisfactionPercent: 60,
      audiences: {
        PUBLIC: { totalResponses: 1, averageRating: 4, satisfactionPercent: 80 },
        STAFF: { totalResponses: 1, averageRating: 2, satisfactionPercent: 40 },
      },
      dimensions: {
        convenience: { averageRating: 4, satisfactionPercent: 80 },
        speed: { averageRating: 3, satisfactionPercent: 60 },
        accuracy: { averageRating: 4, satisfactionPercent: 80 },
        overall: { averageRating: 3, satisfactionPercent: 60 },
      },
      research: {
        targetSampleSize: 30,
        baselineStatus: 'FORMING',
        positiveResponsePercent: 50,
        ratingDistribution: { '1': 0, '2': 1, '3': 0, '4': 1, '5': 0 },
        confidence95: null,
        cronbachAlpha: null,
        weakestDimension: 'speed',
      },
    });
    expect(summary.contexts).toHaveLength(2);
    expect(summary.recentSuggestions.map((entry) => entry.id)).toEqual(['staff', 'public']);
  });

  it('returns a stable zero summary when no response exists', () => {
    expect(summarizeSatisfaction([])).toMatchObject({
      totalResponses: 0,
      averageRating: 0,
      satisfactionPercent: 0,
      contexts: [],
      recentSuggestions: [],
      research: {
        baselineStatus: 'FORMING',
        positiveResponsePercent: 0,
        weakestDimension: null,
      },
    });
  });

  it('reports confidence and internal consistency only after the pilot baseline reaches 30 responses', () => {
    const records: SatisfactionRecord[] = Array.from({ length: 30 }, (_, index) => {
      const rating = (index % 5) + 1;
      return {
        ...validPublicSubmission,
        id: `response-${index}`,
        interactionId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        convenience: rating,
        speed: rating,
        accuracy: rating,
        overall: rating,
        staffUserId: null,
        createdAt: new Date(Date.UTC(2026, 7, index + 1)).toISOString(),
      };
    });

    const summary = summarizeSatisfaction(records);
    expect(summary.research).toMatchObject({
      baselineStatus: 'READY',
      targetSampleSize: 30,
      positiveResponsePercent: 40,
      cronbachAlpha: 1,
    });
    expect(summary.research?.confidence95).not.toBeNull();
  });
});

describe('satisfaction migration boundary', () => {
  const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608310004_satisfaction_feedback.sql'), 'utf8');
  const researchMigration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202609010003_satisfaction_r2r_summary.sql'), 'utf8');
  const anonymousVerification = fs.readFileSync(path.join(process.cwd(), 'scripts/verify-staging-anonymous.mjs'), 'utf8');

  it('keeps public writes behind the route and raw rows unreadable to browser roles', () => {
    expect(migration).toContain('ALTER TABLE public.satisfaction_responses ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('Direct read access is deliberately absent');
    expect(migration).toContain('REVOKE ALL ON public.satisfaction_responses FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT INSERT ON public.satisfaction_responses TO authenticated');
    expect(migration).toContain('staff_user_id = auth.uid()');
    expect(migration).toContain('CONSTRAINT satisfaction_one_response_per_interaction UNIQUE');
  });

  it('protects the summary RPC and constrains all ratings at the database layer', () => {
    expect(migration.match(/_rating BETWEEN 1 AND 5/g)).toHaveLength(4);
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_satisfaction_summary');
    expect(migration).toContain("public.current_user_role() NOT IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER')");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_satisfaction_summary() FROM PUBLIC, anon');
    expect(researchMigration).toContain("'targetSampleSize', 30");
    expect(researchMigration).toContain("'positiveResponsePercent'");
    expect(researchMigration).toContain("'cronbachAlpha'");
    expect(researchMigration).toContain('REVOKE ALL ON FUNCTION public.get_satisfaction_summary() FROM PUBLIC, anon');
  });

  it('verifies the deployed anonymous boundary for rows, writes, and the summary RPC', () => {
    expect(anonymousVerification).toContain('/rest/v1/satisfaction_responses?select=id&limit=1');
    expect(anonymousVerification).toContain('/rest/v1/satisfaction_responses`');
    expect(anonymousVerification).toContain('/rest/v1/rpc/get_satisfaction_summary');
  });
});
