import { NextRequest, NextResponse } from 'next/server';
import { runAutomatedCaseRecon } from '@/lib/intelligence/case-recon-engine';
import { authorizeStaff } from '@/lib/api-auth';
import { STAFF_READ_ROLES } from '@/lib/roles';
import { z } from 'zod';

const reconRequestSchema = z.object({
  case_id: z.string().min(1),
  case_number: z.string().optional(),
  case_title: z.string().optional(),
  raw_text: z.string().optional(),
  accused_name: z.string().optional(),
  accused_citizen_id: z.string().optional(),
  facility_name: z.string().optional(),
  location_address: z.string().optional(),
  is_dental_context: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await authorizeStaff(request, STAFF_READ_ROLES);
  if (!auth.ok) {
    return NextResponse.json({ error: { message: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ' } }, { status: auth.status });
  }

  try {
    const json = await request.json().catch(() => ({}));
    const parsed = reconRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'ข้อมูลนำเข้าไม่ถูกต้อง', details: parsed.error.format() } },
        { status: 400 },
      );
    }

    const report = await runAutomatedCaseRecon({
      caseId: parsed.data.case_id,
      caseNumber: parsed.data.case_number,
      caseTitle: parsed.data.case_title,
      rawText: parsed.data.raw_text,
      accusedName: parsed.data.accused_name,
      accusedCitizenId: parsed.data.accused_citizen_id,
      facilityName: parsed.data.facility_name,
      locationAddress: parsed.data.location_address,
      isDentalContext: parsed.data.is_dental_context,
    });

    return NextResponse.json({
      success: true,
      data: {
        report,
      },
    });
  } catch (error: unknown) {
    console.error('Error in intelligence recon route:', error);
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : 'การสืบค้นข้อมูลเชิงลึกไม่สำเร็จ' } },
      { status: 500 },
    );
  }
}
