import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveMultiChannelSearch } from '@/lib/fda-smart-resolver';
import { consumeRateLimit } from '@/lib/rate-limit';

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  category: z.enum(['ALL', 'HEALTH_PRODUCTS', 'HEALTH_SERVICES', 'CLINICS', 'MASSAGE_SPA', 'FRAUD_ALERTS', 'COMPANIES', 'LICENSES']).default('ALL'),
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

  const results = await resolveMultiChannelSearch(rawQuery, { category: parsed.data.category });

  let aiSummary = '';
  if (results.length > 0) {
    const topItem = results[0];
    const hasConfirmedResult = results.some((item) => !['UNREGISTERED', 'UNAVAILABLE'].includes(item.status));
    const hasUnavailableSource = results.some((item) => item.status === 'UNAVAILABLE');
    const confirmedSources = Array.from(new Set(
      results
        .filter((item) => !['UNREGISTERED', 'UNAVAILABLE'].includes(item.status))
        .map((item) => item.source),
    ));
    if (!hasConfirmedResult && hasUnavailableSource) {
      aiSummary = `ยังสรุปผลสำหรับ "${rawQuery}" ไม่ได้ครบถ้วน เพราะมีแหล่งข้อมูลทางการอย่างน้อยหนึ่งแหล่งไม่ตอบกลับ ระบบจึงไม่ตีความว่าไม่พบทะเบียน กรุณาลองค้นอีกครั้ง`;
    } else if (!hasConfirmedResult && topItem.status === 'UNREGISTERED') {
      aiSummary = `ไม่พบรายการที่ตรงกับ "${rawQuery}" จาก ${topItem.source} ณ เวลาตรวจสอบ การไม่พบข้อมูลไม่ใช่การรับรองว่าไม่มีทะเบียนหรือไม่มีใบอนุญาต`;
    } else if (topItem.productCategoryLabel.includes('สำเนาทะเบียน')) {
      aiSummary = `พบ ${results.length} รายการสำหรับ "${rawQuery}" ในสำเนาผลค้นหาจาก ${topItem.source} ที่บันทึกตามวันที่ตรวจสอบ โปรดเปิดต้นฉบับเพื่อตรวจสถานะใบอนุญาตล่าสุด`;
    } else if (confirmedSources.length > 1) {
      aiSummary = `พบ ${results.length} รายการที่แสดงสำหรับ "${rawQuery}" จากทะเบียนทางการ ${confirmedSources.length} แหล่ง ได้แก่ ${confirmedSources.join(' และ ')}`;
    } else {
      aiSummary = `พบ ${results.length} รายการที่แสดงตรงจาก ${topItem.source} สำหรับ "${rawQuery}" ตามคำตอบล่าสุดของต้นทาง โปรดเปิดข้อมูลต้นฉบับเพื่อตรวจรายละเอียดและสถานะใบอนุญาตล่าสุด`;
    }
  } else {
    aiSummary = `ไม่พบข้อมูลที่ตรงกับ "${rawQuery}" ในแหล่งข้อมูลทางการที่เลือก กรุณาตรวจสอบการสะกดหรือรูปแบบเลขแล้วลองใหม่`;
  }

  return NextResponse.json({
    success: true,
    data: {
      query: parsed.data.q,
      category: parsed.data.category,
      aiSummary,
      citationCount: results.filter((item) => !['UNREGISTERED', 'UNAVAILABLE'].includes(item.status)).length,
      results,
    },
  }, { headers: { 'Cache-Control': 'public, max-age=0, no-store' } });
}
