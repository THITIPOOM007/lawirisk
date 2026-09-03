import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { getCases, getMatches } from '@/lib/demo-data';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์ดูรายการเชื่อมโยง');
  if (auth.identity.mode === 'demo') return NextResponse.json({ data: { matches: getMatches(), cases: getCases() } });
  const supabase = await createServer();
  const [matches, cases] = await Promise.all([
    supabase.from('match_candidates').select('id,source_case_id,target_case_id,entity_id,target_entity_id,confidence,status,matching_signals,review_reason,reviewed_by,reviewed_at,created_at,updated_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('cases').select('id,number,title,status,created_at').order('created_at', { ascending: false }).limit(200),
  ]);
  if (matches.error || cases.error) return apiError('MATCH_LIST_FAILED', 'โหลดรายการเชื่อมโยงไม่สำเร็จ', 503);
  const entityIds = [...new Set((matches.data || []).flatMap((item) => [item.entity_id, item.target_entity_id]).filter((id): id is string => Boolean(id)))];
  const matchIds = (matches.data || []).map((item) => item.id);
  const [entities, sources] = await Promise.all([
    entityIds.length ? supabase.from('extracted_entities').select('id,type,value').in('id', entityIds) : Promise.resolve({ data: [], error: null }),
    matchIds.length ? supabase.from('match_candidate_sources').select('match_candidate_id,evidence_id,page_number,source_text').in('match_candidate_id', matchIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (entities.error || sources.error) return apiError('MATCH_DEPENDENCY_FAILED', 'โหลดแหล่งอ้างอิงของการเชื่อมโยงไม่สำเร็จ', 503);
  const entityMap = new Map((entities.data || []).map((item) => [item.id, item]));
  const output = (matches.data || []).map((item) => {
    const sourceEntity = entityMap.get(item.entity_id);
    const targetEntity = item.target_entity_id ? entityMap.get(item.target_entity_id) : null;
    return {
      ...item,
      // Keep the legacy fields while exposing both endpoints of the automatic map.
      entity_type: sourceEntity?.type || 'UNKNOWN',
      entity_value: sourceEntity?.value || 'ไม่พบข้อมูล',
      source_entity: sourceEntity || null,
      target_entity: targetEntity || null,
      sources: (sources.data || []).filter((source) => source.match_candidate_id === item.id),
    };
  });
  return NextResponse.json({ data: { matches: output, cases: cases.data } });
}
