import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveMultiChannelSearch, searchOfficialHssPublicNews, searchOfficialOryorNews } from '@/lib/fda-smart-resolver';
import { consumeRateLimit } from '@/lib/rate-limit';

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  category: z.enum(['ALL', 'HEALTH_PRODUCTS', 'HEALTH_SERVICES', 'CLINICS', 'MASSAGE_SPA', 'FRAUD_ALERTS', 'COMPANIES', 'LICENSES']).default('ALL'),
  province: z.string().trim().min(2).max(100).optional().or(z.literal('')),
  healthRegion: z.string().trim().max(100).optional().or(z.literal('')),
});

function matchesProvince(result: { snippet: string; metadata?: Record<string, string> }, province: string) {
  if (!province) return true;
  const searchable = [result.snippet, ...Object.values(result.metadata || {})].join(' ').replace(/\s+/g, ' ');
  return searchable.includes(province);
}

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
  const province = searchParams.get('province') || '';
  const healthRegion = searchParams.get('healthRegion') || '';

  const parsed = searchQuerySchema.safeParse({ q, category, province, healthRegion });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'กรุณากรอกคำค้นหาอย่างน้อย 2 ตัวอักษร' },
      { status: 400 },
    );
  }

  const rawQuery = parsed.data.q.trim();

  const [registryResults, newsResults] = await Promise.all([
    parsed.data.category === 'FRAUD_ALERTS'
      ? Promise.resolve([])
      : resolveMultiChannelSearch(rawQuery, { category: parsed.data.category }),
    Promise.all([searchOfficialHssPublicNews(rawQuery), searchOfficialOryorNews(rawQuery)]).then((results) => results.flat()),
  ]);
  const combinedResults = parsed.data.category === 'FRAUD_ALERTS'
    ? newsResults
    : [...registryResults, ...newsResults];
  const results = combinedResults.filter((item) => matchesProvince(item, parsed.data.province || ''));

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
    aiSummary = parsed.data.province
      ? `ไม่พบข้อมูลที่ตรงกับ "${rawQuery}" ในพื้นที่ ${parsed.data.province} จากแหล่งที่แสดงที่อยู่ได้ กรุณาลองค้นหาทั่วประเทศหรือปรับคำค้น`
      : `ไม่พบข้อมูลที่ตรงกับ "${rawQuery}" ในแหล่งข้อมูลทางการที่เลือก กรุณาตรวจสอบการสะกดหรือรูปแบบเลขแล้วลองใหม่`;
  }

  return NextResponse.json({
    success: true,
    data: {
      query: parsed.data.q,
      category: parsed.data.category,
      province: parsed.data.province || null,
      healthRegion: parsed.data.healthRegion || null,
      aiSummary,
      citationCount: results.filter((item) => !['UNREGISTERED', 'UNAVAILABLE'].includes(item.status)).length,
      results,
    },
  }, { headers: { 'Cache-Control': 'public, max-age=0, no-store' } });
}
