import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { apiError } from '@/lib/api-errors';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return apiError('UNAUTHORIZED', 'ไม่มีสิทธิ์', 403);

  const supabase = await createServer();
  
  // Fetch cases
  const { data: cases } = await supabase.from('cases').select('id, number, title');
  
  // Fetch entities
  const { data: entities } = await supabase.from('extracted_entities').select('id, case_id, type, value, normalized_value');
  
  // Fetch matches to create cross-case links
  const { data: matches } = await supabase.from('match_candidates').select('source_case_id, target_case_id, entity_id, target_entity_id').eq('status', 'VERIFIED');
  
  const nodes: Record<string, unknown>[] = [];
  const links: Record<string, unknown>[] = [];
  
  if (cases) {
    cases.forEach(c => {
      nodes.push({ id: c.id, group: 'case', label: `[Case] ${c.title || c.number}`, val: 10 });
    });
  }
  
  if (entities) {
    entities.forEach(e => {
      nodes.push({ id: e.id, group: e.type, label: `[${e.type}] ${e.value}`, val: 3 });
      links.push({ source: e.case_id, target: e.id });
    });
  }
  
  if (matches) {
    matches.forEach(m => {
      links.push({ source: m.entity_id, target: m.target_entity_id, label: 'MATCH' });
    });
  }

  return NextResponse.json({ data: { nodes, links } });
}
