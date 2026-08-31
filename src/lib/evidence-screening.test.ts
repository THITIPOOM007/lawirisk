import { describe, expect, it } from 'vitest';
import { buildEvidenceScreeningProjection } from './evidence-screening';

describe('evidence screening projection', () => {
  it('builds a case-evidence-entity graph and excludes rejected evidence from the graph', () => {
    const data = buildEvidenceScreeningProjection({
      caseRecord: { id: 'case-1', number: 'ค.1/2569', title: 'คดีสังเคราะห์' },
      evidence: [
        { id: 'evidence-1', filename: 'one.pdf', sha256: 'a'.repeat(64) },
        { id: 'evidence-2', filename: 'two.pdf', sha256: 'b'.repeat(64) },
      ],
      entities: [{ id: 'entity-1', type: 'ORGANIZATION', value: 'องค์กรตัวอย่าง' }],
      screenings: [
        { id: 'screen-1', evidence_id: 'evidence-1', classification: 'DIRECT', summary: 'โดยตรง', reason: 'มี source', confidence: 0.9, source_trace: { entities: [{ entity_id: 'entity-1', page_number: 1 }] }, provider: 'LAWIRISK_RULE_ENGINE', model: 'source-trace-v1', status: 'SUGGESTED', updated_at: '2026-08-30T00:00:00Z' },
        { id: 'screen-2', evidence_id: 'evidence-2', classification: 'CONTEXTUAL', summary: 'ประกอบ', reason: 'ไม่มี source', confidence: 0.35, source_trace: {}, provider: 'LAWIRISK_RULE_ENGINE', model: 'source-trace-v1', status: 'REJECTED', updated_at: '2026-08-30T00:00:00Z' },
      ],
      canReview: true,
      canRefresh: true,
    });
    expect(data.assessments).toHaveLength(2);
    expect(data.graph.nodes.some((node) => node.id === 'entity:entity-1')).toBe(true);
    expect(data.graph.nodes.some((node) => node.id === 'evidence:evidence-2')).toBe(false);
    expect(data.assessments[0].canReview).toBe(true);
    expect(data.generatedBy.aiRequired).toBe(false);
    expect(data.automation.status).toBe('AUTO_ADVICE_READY');
    expect(data.automation.completedStages).toEqual(['AUTO_FOUND', 'AUTO_ANALYZED', 'AUTO_ADVICE']);
    expect(data.automaticAdvice.some((item) => item.category === 'EVIDENCE_PRIORITY')).toBe(true);
    expect(data.automaticAdvice.every((item) => item.status === 'AUTO_ADVICE')).toBe(true);
    expect(data.automaticAdvice.some((item) => item.category === 'LEGAL_RESEARCH')).toBe(true);
    expect(data.permissions.canRefresh).toBe(true);
  });

  it('returns an actionable automatic data-gap response without requiring review', () => {
    const data = buildEvidenceScreeningProjection({
      caseRecord: { id: 'case-empty', number: 'ค.2/2569', title: 'คดีสังเคราะห์ไม่มีหลักฐาน' },
      evidence: [], entities: [], screenings: [], canReview: true, canRefresh: false,
    });
    expect(data.automation.status).toBe('DATA_REQUIRED');
    expect(data.automaticAdvice).toHaveLength(1);
    expect(data.automaticAdvice[0]).toMatchObject({ category: 'DATA_GAP', officialConfirmationRequired: false });
  });
});
