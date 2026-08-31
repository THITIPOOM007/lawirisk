import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError } from '@/lib/api-errors';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) return authError(auth, 'ไม่มีสิทธิ์เปิดหลักฐานสังเคราะห์');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError('NOT_FOUND', 'ไม่พบหลักฐาน', 404);
  if (auth.identity.mode === 'demo') return apiError('NOT_FOUND', 'ไม่พบหลักฐาน', 404);
  const supabase = await createServer();
  const { data: evidence, error } = await supabase
    .from('evidence_files')
    .select('id,filename,file_path,sha256,upload_state,malware_scan_status')
    .eq('id', id)
    .maybeSingle();
  if (error || !evidence || !evidence.file_path.startsWith('synthetic-demo/')) return apiError('NOT_FOUND', 'ไม่พบหลักฐานสังเคราะห์หรือไม่มีสิทธิ์เข้าถึง', 404);
  const pages = await supabase.from('evidence_pages').select('page_number,text_content').eq('evidence_id', id).order('page_number');
  if (pages.error || !pages.data?.length) return apiError('SYNTHETIC_EVIDENCE_INCOMPLETE', 'ข้อมูลทดสอบไม่สมบูรณ์', 409);
  const content = pages.data.map((page) => page.text_content || '').join('\n\n');
  const digest = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  if (digest !== evidence.sha256) return apiError('SYNTHETIC_EVIDENCE_HASH_MISMATCH', 'SHA-256 ของข้อมูลทดสอบไม่ตรงกับทะเบียน', 409);
  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${encodeURIComponent(evidence.filename)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-LawiRisk-Synthetic-Test-Data': 'true',
      'X-LawiRisk-SHA256': digest,
    },
  });
}
