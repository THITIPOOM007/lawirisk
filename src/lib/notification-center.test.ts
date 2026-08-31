import { describe, expect, it } from 'vitest';
import { buildNotificationItems } from './notification-center';

describe('notification center', () => {
  it('builds actionable source-bound notifications without exposing candidate values', () => {
    const items = buildNotificationItems({
      intakes: [{ id: 'i-1', status: 'TRIAGE_PENDING', urgency: 'CRITICAL', jurisdiction_region: 'เขตสุขภาพที่ 10', created_at: '2026-08-29T01:00:00Z' }],
      suggestions: [{ id: 's-1', case_id: 'c-1', entity_type: 'PHONE', confidence: 0.91, status: 'SUGGESTED', created_at: '2026-08-29T02:00:00Z' }],
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'intake:i-1:triage', severity: 'critical', href: '/intake/i-1', read: false });
    expect(items[1].summary).toContain('ความเชื่อมั่น 91%');
    expect(JSON.stringify(items)).not.toContain('080-');
  });

  it('surfaces failures, keeps success reviewable, and moves read items after unread items', () => {
    const items = buildNotificationItems({
      jobs: [
        { id: 'failed', case_id: 'c-1', status: 'FAILED', error_code: 'PROVIDER_TIMEOUT', created_at: '2026-08-29T03:00:00Z' },
        { id: 'done', case_id: 'c-1', status: 'SUCCEEDED', result_count: 2, created_at: '2026-08-29T04:00:00Z' },
      ],
      readIds: ['automation:failed:failed'],
    });

    expect(items[0]).toMatchObject({ id: 'automation:done:succeeded', severity: 'success', read: false, href: '/review' });
    expect(items[1]).toMatchObject({ id: 'automation:failed:failed', severity: 'critical', read: true, href: '/automation' });
  });

  it('does not create decorative notifications for completed intake or safe stored evidence', () => {
    expect(buildNotificationItems({
      intakes: [{ id: 'i-2', status: 'PROMOTED', urgency: 'NORMAL', created_at: '2026-08-29T01:00:00Z' }],
      evidence: [{ id: 'e-1', case_id: 'c-1', filename: 'safe.pdf', status: 'PROCESSED', upload_state: 'STORED', malware_scan_status: 'CLEAN', created_at: '2026-08-29T01:00:00Z' }],
    })).toEqual([]);
  });
});
