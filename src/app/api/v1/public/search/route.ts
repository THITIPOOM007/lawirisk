import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveMultiChannelSearch } from '@/lib/fda-smart-resolver';

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  category: z.enum(['ALL', 'HEALTH_PRODUCTS', 'FRAUD_ALERTS', 'COMPANIES', 'LICENSES']).default('ALL'),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || 'ALL';

  const parsed = searchQuerySchema.safeParse({ q, category });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'กรุณากรอกคำค้นหาอย่างน้อย 2 ตัวอักษร' },
      { status: 400 },
    );
  }

  const rawQuery = parsed.data.q.trim();

  // Intelligent Multi-Channel Resolver across all 8 government registries
  const allResults = resolveMultiChannelSearch(rawQuery);
  const results = parsed.data.category === 'ALL'
    ? allResults
    : allResults.filter((item) => item.category === parsed.data.category);

  // AI Citation Summary
  let aiSummary = '';
  if (results.length > 0) {
    const topItem = results[0];
    aiSummary = `จากการตรวจสอบระบบสืบค้นข้อมูลผลิตภัณฑ์และทะเบียนภาครัฐ (${topItem.source}) พบข้อมูลที่เกี่ยวข้องกับ "${rawQuery}": ${topItem.snippet} (อ้างอิงจาก: ${topItem.source} ณ วันที่ ${topItem.publishedDate})`;
  } else {
    aiSummary = `ไม่พบข้อมูลที่ตรงกับ "${rawQuery}" ในฐานข้อมูลเปิดหรือทะเบียนที่บันทึกไว้ กรุณาตรวจสอบการสะกดหรือลองค้นหาด้วยชื่อสามัญ/ชื่อทางการค้า`;
  }

  return NextResponse.json({
    success: true,
    data: {
      query: parsed.data.q,
      category: parsed.data.category,
      aiSummary,
      citationCount: results.length,
      results,
    },
  });
}
