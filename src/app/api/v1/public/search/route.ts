import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveMultiChannelSearch } from '@/lib/fda-smart-resolver';
import { consumeRateLimit } from '@/lib/rate-limit';

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  category: z.enum(['ALL', 'HEALTH_PRODUCTS', 'FRAUD_ALERTS', 'COMPANIES', 'LICENSES']).default('ALL'),
});

export async function GET(request: NextRequest) {
  const clientAddress = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const limit = await consumeRateLimit({ key: `public-search:${clientAddress}`, limit: 30, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: 'ค้นหาถี่เกินไป กรุณารอสักครู่' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }
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

  const allResults = await resolveMultiChannelSearch(rawQuery);
  const results = parsed.data.category === 'ALL'
    ? allResults
    : allResults.filter((item) => item.category === parsed.data.category);

  let aiSummary = '';
  if (results.length > 0) {
    const topItem = results[0];
    aiSummary = topItem.status === 'UNREGISTERED'
      ? `ยังไม่มีผลจากทะเบียนที่ยืนยันได้สำหรับ "${rawQuery}" ข้อมูลด้านล่างเป็นคำแนะนำให้ตรวจสอบกับต้นทาง ไม่ใช่การรับรองว่าปลอดภัยหรือถูกกฎหมาย`
      : `พบรายการที่บันทึกในแหล่งข้อมูลที่อนุมัติ (${topItem.source}) สำหรับ "${rawQuery}": ${topItem.snippet}`;
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
  }, { headers: { 'Cache-Control': 'public, max-age=0, no-store' } });
}
