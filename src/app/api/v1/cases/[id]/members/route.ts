import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeStaff } from '@/lib/api-auth';
import { apiError, authError, requestId } from '@/lib/api-errors';
import { consumeRateLimit } from '@/lib/rate-limit';
import { CASE_WRITE_ROLES, ADMIN_ROLES } from '@/lib/roles';
import { createServer } from '@/lib/supabase-server';
import { hasTrustedBrowserOrigin } from '@/lib/request-security';
import { isDemoServerEnabled } from '@/lib/runtime-config';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const addMemberSchema = z.object({
  profile_id: z.string().uuid(),
  role: z.enum(['OWNER', 'MEMBER']).default('MEMBER'),
}).strict();

const removeMemberSchema = z.object({
  profile_id: z.string().uuid(),
}).strict();

export async function GET(req: NextRequest, { params }: RouteParams) {
  const traceId = requestId();
  try {
    const auth = await authorizeStaff(req, CASE_WRITE_ROLES);
    if (!auth.ok) {
      return authError(auth, 'ไม่มีสิทธิ์เข้าถึงรายชื่อสมาชิกสำนวนคดี');
    }

    const { id: caseId } = await params;

    if (auth.identity.mode === 'demo' || isDemoServerEnabled()) {
      return NextResponse.json({
        data: [
          {
            id: 'mem-1',
            case_id: caseId,
            profile_id: 'user-1',
            role: 'OWNER',
            created_at: new Date().toISOString(),
            profile: {
              id: 'user-1',
              name: 'พล.ต.ต. สุรศักดิ์ (Admin)',
              email: 'admin@evidenceverse.go.th',
              role: 'ADMIN',
            },
          },
          {
            id: 'mem-2',
            case_id: caseId,
            profile_id: 'user-2',
            role: 'MEMBER',
            created_at: new Date().toISOString(),
            profile: {
              id: 'user-2',
              name: 'ร.ต.อ. สมชาย (Investigator)',
              email: 'investigator@evidenceverse.go.th',
              role: 'INVESTIGATOR',
            },
          },
        ],
      }, { headers: { 'X-Request-ID': traceId } });
    }

    const supabase = await createServer();
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `case-members-get:${auth.identity.id}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return apiError('RATE_LIMITED', 'ส่งคำขอถี่เกินไป', 429, traceId);
    }

    if (auth.identity.role !== 'ADMIN') {
      const { data: memberData } = await supabase
        .from('case_members')
        .select('id')
        .eq('case_id', caseId)
        .eq('profile_id', auth.identity.id)
        .maybeSingle();

      if (!memberData) {
        return apiError('FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงคดีนี้', 403, traceId);
      }
    }

    const { data, error } = await supabase
      .from('case_members')
      .select(`
        id,
        case_id,
        profile_id,
        role,
        created_at,
        profiles (
          id,
          name,
          email,
          role
        )
      `)
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('List case members error:', error);
      return apiError('DATABASE_ERROR', 'ไม่สามารถดึงข้อมูลสมาชิกคดีได้', 500, traceId);
    }

    type MemberRow = {
      id: string;
      case_id: string;
      profile_id: string;
      role: 'OWNER' | 'MEMBER';
      created_at: string;
      profiles?: {
        id: string;
        name: string;
        email: string;
        role: string;
      } | null;
    };

    const formatted = ((data || []) as unknown as MemberRow[]).map((item) => ({
      id: item.id,
      case_id: item.case_id,
      profile_id: item.profile_id,
      role: item.role,
      created_at: item.created_at,
      profile: item.profiles ? {
        id: item.profiles.id,
        name: item.profiles.name,
        email: item.profiles.email,
        role: item.profiles.role,
      } : undefined,
    }));

    return NextResponse.json({ data: formatted }, { headers: { 'X-Request-ID': traceId } });
  } catch (error) {
    console.error('List case members unexpected error:', error);
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดในการดึงข้อมูลสมาชิกคดี', 500, traceId);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const traceId = requestId();
  try {
    if (!hasTrustedBrowserOrigin(req)) {
      return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);
    }

    const auth = await authorizeStaff(req, CASE_WRITE_ROLES);
    if (!auth.ok) {
      return authError(auth, 'ไม่มีสิทธิ์เพิ่มสมาชิกในสำนวนคดี');
    }

    const { id: caseId } = await params;

    if (auth.identity.mode === 'demo' || isDemoServerEnabled()) {
      return NextResponse.json({ success: true, message: 'เพิ่มสมาชิกสำเร็จ (โหมดสาธิต)' }, { headers: { 'X-Request-ID': traceId } });
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = addMemberSchema.safeParse(body);
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', 'ข้อมูลสมาชิกไม่ถูกต้อง', 400, traceId, parseResult.error.flatten().fieldErrors);
    }

    const { profile_id, role } = parseResult.data;
    const supabase = await createServer();

    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `case-members-write:${auth.identity.id}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return apiError('RATE_LIMITED', 'ส่งคำขอถี่เกินไป', 429, traceId);
    }

    // Only case OWNER or ADMIN can add members
    if (!ADMIN_ROLES.has(auth.identity.role)) {
      const { data: membership } = await supabase
        .from('case_members')
        .select('role')
        .eq('case_id', caseId)
        .eq('profile_id', auth.identity.id)
        .maybeSingle();

      if (!membership || membership.role !== 'OWNER') {
        return apiError('FORBIDDEN', 'เฉพาะหัวหน้าสำนวน (OWNER) หรือ ADMIN เท่านั้นที่เพิ่มสมาชิกได้', 403, traceId);
      }
    }

    // Check target profile
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, name')
      .eq('id', profile_id)
      .maybeSingle();

    if (profileError || !targetProfile) {
      return apiError('NOT_FOUND', 'ไม่พบข้อมูลเจ้าหน้าที่เป้าหมาย', 404, traceId);
    }

    if (!['ADMIN', 'INVESTIGATOR'].includes(targetProfile.role)) {
      return apiError('INVALID_ROLE', 'เจ้าหน้าที่ต้องมีบทบาท ADMIN หรือ INVESTIGATOR เท่านั้นในการร่วมสำนวน', 400, traceId);
    }

    const { error: insertError } = await supabase
      .from('case_members')
      .upsert({
        case_id: caseId,
        profile_id,
        role,
      }, { onConflict: 'case_id, profile_id' });

    if (insertError) {
      console.error('Add case member error:', insertError);
      return apiError('DATABASE_ERROR', 'ไม่สามารถเพิ่มสมาชิกได้', 500, traceId);
    }

    await supabase.from('audit_logs').insert({
      action: 'CASE_MEMBER_ADDED',
      profile_id: auth.identity.id,
      details: { case_id: caseId, target_profile_id: profile_id, assigned_role: role },
    });

    return NextResponse.json({ success: true, message: 'เพิ่มสมาชิกสำเร็จ' }, { headers: { 'X-Request-ID': traceId } });
  } catch (error) {
    console.error('Add case member unexpected error:', error);
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดในการเพิ่มสมาชิก', 500, traceId);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const traceId = requestId();
  try {
    if (!hasTrustedBrowserOrigin(req)) {
      return apiError('UNTRUSTED_ORIGIN', 'คำขอไม่ได้มาจากระบบที่อนุญาต', 403, traceId);
    }

    const auth = await authorizeStaff(req, CASE_WRITE_ROLES);
    if (!auth.ok) {
      return authError(auth, 'ไม่มีสิทธิ์ลบสมาชิกในสำนวนคดี');
    }

    const { id: caseId } = await params;

    if (auth.identity.mode === 'demo' || isDemoServerEnabled()) {
      return NextResponse.json({ success: true, message: 'ลบสมาชิกสำเร็จ (โหมดสาธิต)' }, { headers: { 'X-Request-ID': traceId } });
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = removeMemberSchema.safeParse(body);
    if (!parseResult.success) {
      return apiError('VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', 400, traceId, parseResult.error.flatten().fieldErrors);
    }

    const { profile_id } = parseResult.data;

    if (profile_id === auth.identity.id) {
      return apiError('SELF_REMOVAL_BLOCKED', 'ไม่สามารถลบตนเองออกจากสำนวนได้', 400, traceId);
    }

    const supabase = await createServer();
    const rateLimit = await consumeRateLimit({
      client: supabase,
      key: `case-members-write:${auth.identity.id}`,
      limit: 20,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return apiError('RATE_LIMITED', 'ส่งคำขอถี่เกินไป', 429, traceId);
    }

    // Only case OWNER or ADMIN can remove members
    if (!ADMIN_ROLES.has(auth.identity.role)) {
      const { data: membership } = await supabase
        .from('case_members')
        .select('role')
        .eq('case_id', caseId)
        .eq('profile_id', auth.identity.id)
        .maybeSingle();

      if (!membership || membership.role !== 'OWNER') {
        return apiError('FORBIDDEN', 'เฉพาะหัวหน้าสำนวน (OWNER) หรือ ADMIN เท่านั้นที่ลบสมาชิกได้', 403, traceId);
      }
    }

    // Check if target is last owner
    const { data: targetMembership } = await supabase
      .from('case_members')
      .select('role')
      .eq('case_id', caseId)
      .eq('profile_id', profile_id)
      .maybeSingle();

    if (targetMembership?.role === 'OWNER') {
      const { count } = await supabase
        .from('case_members')
        .select('*', { count: 'exact', head: true })
        .eq('case_id', caseId)
        .eq('role', 'OWNER');

      if (count && count <= 1) {
        return apiError('LAST_OWNER_PROTECTED', 'ไม่สามารถลบหัวหน้าสำนวน (OWNER) คนสุดท้ายได้', 400, traceId);
      }
    }

    const { error: deleteError } = await supabase
      .from('case_members')
      .delete()
      .eq('case_id', caseId)
      .eq('profile_id', profile_id);

    if (deleteError) {
      console.error('Remove case member error:', deleteError);
      return apiError('DATABASE_ERROR', 'ไม่สามารถลบสมาชิกได้', 500, traceId);
    }

    await supabase.from('audit_logs').insert({
      action: 'CASE_MEMBER_REMOVED',
      profile_id: auth.identity.id,
      details: { case_id: caseId, removed_profile_id: profile_id },
    });

    return NextResponse.json({ success: true, message: 'ลบสมาชิกสำเร็จ' }, { headers: { 'X-Request-ID': traceId } });
  } catch (error) {
    console.error('Remove case member unexpected error:', error);
    return apiError('INTERNAL_ERROR', 'เกิดข้อผิดพลาดในการลบสมาชิก', 500, traceId);
  }
}

