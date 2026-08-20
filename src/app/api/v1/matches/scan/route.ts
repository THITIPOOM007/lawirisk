import { NextRequest, NextResponse } from 'next/server';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { REVIEW_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

const SCAN_ROLES = new Set([...REVIEW_ROLES, 'INVESTIGATOR'] as const);

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, SCAN_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์สั่งสแกนความเชื่อมโยงข้ามคดี');

  if (auth.identity.mode === 'demo') {
    // In demo mode, simulate scanning results gracefully
    return NextResponse.json({
      data: {
        scanned_entities: 14,
        exact_matches_found: 3,
        fuzzy_matches_found: 2,
        total_matches: 5,
        mode: 'demo',
        message: 'จำลองการสแกนความเชื่อมโยงสำเร็จ (Demo Mode)',
      },
    });
  }

  const body = await request.json().catch(() => ({}));
  const caseId = typeof body.case_id === 'string' ? body.case_id : null;

  const supabase = await createServer();
  const { data, error } = await supabase.rpc('scan_cross_case_matches', {
    p_case_id: caseId,
  });

  if (error) {
    return apiError('MATCH_SCAN_FAILED', error.message || 'การสแกนความเชื่อมโยงล้มเหลว', 500);
  }

  return NextResponse.json({
    data: {
      ...(data as Record<string, unknown>),
      mode: 'production',
    },
  });
}
