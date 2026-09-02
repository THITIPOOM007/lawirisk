import 'server-only';

import type { SatisfactionRecord, SatisfactionSubmission } from '@/lib/satisfaction-contract';
import { summarizeSatisfaction } from '@/lib/satisfaction-contract';

const demoResponses: SatisfactionRecord[] = [
  {
    id: 'demo-satisfaction-public-search',
    audience: 'PUBLIC',
    context: 'PUBLIC_SEARCH',
    interactionId: '11111111-1111-4111-8111-111111111111',
    convenience: 5,
    speed: 4,
    accuracy: 5,
    overall: 5,
    suggestion: 'อยากให้แสดงตัวอย่างเลขทะเบียนที่ค้นหาได้ใต้ช่องค้นหา',
    staffUserId: null,
    createdAt: '2026-08-30T08:30:00.000Z',
  },
  {
    id: 'demo-satisfaction-public-complaint',
    audience: 'PUBLIC',
    context: 'PUBLIC_COMPLAINT',
    interactionId: '22222222-2222-4222-8222-222222222222',
    convenience: 4,
    speed: 5,
    accuracy: 4,
    overall: 4,
    suggestion: 'ขั้นตอนแจ้งเรื่องชัดเจนและรหัสติดตามมองเห็นง่าย',
    staffUserId: null,
    createdAt: '2026-08-30T09:15:00.000Z',
  },
  {
    id: 'demo-satisfaction-staff',
    audience: 'STAFF',
    context: 'STAFF_SESSION',
    interactionId: '33333333-3333-4333-8333-333333333333',
    convenience: 4,
    speed: 4,
    accuracy: 5,
    overall: 4,
    suggestion: 'ควรจำตัวกรองล่าสุดในหน้ารายการรับเรื่อง',
    staffUserId: 'demo-user',
    createdAt: '2026-08-30T10:00:00.000Z',
  },
];

export function saveDemoSatisfactionResponse(input: SatisfactionSubmission, staffUserId: string | null) {
  const existing = demoResponses.find((record) => record.audience === input.audience && record.interactionId === input.interactionId);
  if (existing) return { record: existing, duplicate: true };

  const record: SatisfactionRecord = {
    ...input,
    id: crypto.randomUUID(),
    staffUserId,
    createdAt: new Date().toISOString(),
  };
  demoResponses.push(record);
  return { record, duplicate: false };
}

export function getDemoSatisfactionSummary() {
  return summarizeSatisfaction(demoResponses);
}
