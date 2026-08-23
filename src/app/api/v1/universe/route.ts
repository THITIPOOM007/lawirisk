import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { apiError } from '@/lib/api-errors';
import { createServer } from '@/lib/supabase-server';
import {
  INITIAL_CASES,
  INITIAL_ENTITIES,
  INITIAL_EVIDENCE,
  INITIAL_MATCHES,
} from '@/lib/demo-data';

type UniverseNode = {
  id: string;
  group: string;
  label: string;
  val: number;
  caseId?: string;
};

type UniverseLink = {
  source: string;
  target: string;
  label?: string;
};

function buildUniverseData(params: {
  cases: { id: string; number: string; title: string | null }[];
  entities: { id: string; case_id: string; type: string; value: string }[];
  evidence: { id: string; case_id: string; filename: string }[];
  matches: { entity_id: string; target_entity_id?: string | null }[];
}) {
  const nodes: UniverseNode[] = [];
  const links: UniverseLink[] = [];

  for (const item of params.cases) {
    nodes.push({ id: item.id, group: 'case', label: `คดี ${item.number} · ${item.title || 'ไม่ระบุชื่อคดี'}`, val: 12 });
  }
  for (const item of params.entities) {
    nodes.push({ id: item.id, group: item.type, label: `${item.type} · ${item.value}`, val: 4, caseId: item.case_id });
    links.push({ source: item.case_id, target: item.id, label: 'เกี่ยวข้องกับคดี' });
  }
  for (const item of params.evidence) {
    nodes.push({ id: item.id, group: 'evidence', label: `หลักฐาน · ${item.filename}`, val: 6, caseId: item.case_id });
    links.push({ source: item.case_id, target: item.id, label: 'หลักฐานในคดี' });
  }
  for (const item of params.matches) {
    if (item.target_entity_id) {
      links.push({ source: item.entity_id, target: item.target_entity_id, label: 'ยืนยันความเชื่อมโยง' });
    }
  }

  return { nodes, links };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return apiError(auth.code, 'ไม่มีสิทธิ์เข้าถึงผังความเชื่อมโยง', auth.status);

  if (auth.identity.mode === 'demo') {
    return NextResponse.json({
      data: buildUniverseData({
        cases: INITIAL_CASES,
        entities: INITIAL_ENTITIES,
        evidence: INITIAL_EVIDENCE,
        matches: INITIAL_MATCHES.filter((item) => item.status === 'VERIFIED'),
      }),
      meta: { mode: 'demo', source: 'ชุดข้อมูลสาธิตภายในเครื่อง' },
    });
  }

  const supabase = await createServer();
  const [caseResult, entityResult, evidenceResult, matchResult] = await Promise.all([
    supabase.from('cases').select('id, number, title'),
    supabase.from('extracted_entities').select('id, case_id, type, value'),
    supabase.from('evidence_files').select('id, case_id, filename').eq('upload_state', 'STORED'),
    supabase.from('match_candidates').select('entity_id, target_entity_id').eq('status', 'VERIFIED'),
  ]);

  const firstError = caseResult.error || entityResult.error || evidenceResult.error || matchResult.error;
  if (firstError) {
    console.error('Universe graph query failed', { code: firstError.code });
    return apiError('UNIVERSE_UNAVAILABLE', 'โหลดผังความเชื่อมโยงไม่สำเร็จ กรุณาลองใหม่', 503);
  }

  return NextResponse.json({
    data: buildUniverseData({
      cases: caseResult.data || [],
      entities: entityResult.data || [],
      evidence: evidenceResult.data || [],
      matches: matchResult.data || [],
    }),
    meta: { mode: 'live', source: 'ฐานข้อมูลตามสิทธิ์ของผู้ใช้' },
  });
}
