import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSmartFdaSearch, SmartSearchResult } from '@/lib/fda-smart-resolver';

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  category: z.enum(['ALL', 'HEALTH_PRODUCTS', 'FRAUD_ALERTS', 'COMPANIES', 'LICENSES']).default('ALL'),
});

const MOCK_PUBLIC_KNOWLEDGE: SmartSearchResult[] = [
  {
    id: 'res-fda-2a3661',
    title: 'ใบสำคัญ/ใบอนุญาต 2A 36/61: ไอ-คอร์ดิล (I-cordyl)',
    category: 'HEALTH_PRODUCTS',
    snippet: 'ประเภทยา: ยาสำเร็จรูป | ชื่อผู้รับอนุญาต: บริษัท ฟิฮาแล็บ จำกัด | New Code: U1DR2A1022610003611C | สถานะ: คงอยู่ (ACTIVE) ผ่านการขึ้นทะเบียนตำรับยาถูกต้องจากสำนักงานคณะกรรมการอาหารและยา',
    source: 'ระบบตรวจสอบการอนุญาต อย. (porta.fda.moph.go.th)',
    sourceUrl: 'https://porta.fda.moph.go.th/fda_search_center_new/',
    publishedDate: '2026-08-20',
    confidenceScore: 1.0,
    status: 'SAFE',
  },
  {
    id: 'res-hss-clinic',
    title: 'ตรวจสอบสถานพยาบาลเอกชน: คลินิกเวชกรรม/ทันตกรรมที่ได้รับอนุญาต',
    category: 'COMPANIES',
    snippet: 'สถานะใบอนุญาต: ได้รับอนุญาตประกอบกิจการและดำเนินการสถานพยาบาลถูกต้องตาม พ.ร.บ. สถานพยาบาล พ.ศ. 2541 จากกรมสนับสนุนบริการสุขภาพ (สบส.) กระทรวงสาธารณสุข',
    source: 'ระบบตรวจสอบสถานพยาบาลเอกชน (hosp.hss.moph.go.th)',
    sourceUrl: 'https://hosp.hss.moph.go.th',
    publishedDate: '2026-08-20',
    confidenceScore: 0.99,
    status: 'SAFE',
  },
  {
    id: 'res-fda-2',
    title: 'เลขสารบบอาหาร 10-1-01234-5-0001: ผลิตภัณฑ์เสริมอาหารคอลลาเจนผสมวิตามินซี',
    category: 'LICENSES',
    snippet: 'เลขสารบบอาหาร 10-1-01234-5-0001 สถานะ: คงอยู่ (ACTIVE) ผู้รับอนุญาตตั้งอยู่ในพื้นที่เขตสุขภาพที่ 10 ผ่านการตรวจประเมินสถานที่ผลิตตามเกณฑ์ GMP กฎหมาย',
    source: 'สำนักงานคณะกรรมการอาหารและยา (อย.)',
    sourceUrl: 'https://fda.moph.go.th/food/license/10-1-01234-5-0001',
    publishedDate: '2026-07-20',
    confidenceScore: 0.97,
    status: 'SAFE',
  },
  {
    id: 'res-1',
    title: 'ประกาศเตือนภัย: ตรวจพบสารปนเปื้อนในผลิตภัณฑ์จัดฟันแฟชั่นออนไลน์ (SmilePro/May Dental)',
    category: 'HEALTH_PRODUCTS',
    snippet: 'สำนักงานสาธารณสุขจังหวัดศรีสะเกษ ร่วมกับ อย. ประกาศเตือนประชาชนระวังชุดจัดฟันแฟชั่นที่จำหน่ายผ่าน Facebook และ TikTok ไม่ได้รับอนุญาตนำเข้าและมีโลหะหนักตะกั่วเกินมาตรฐาน',
    source: 'สำนักงานคณะกรรมการอาหารและยา (อย.) & สสจ.ศรีสะเกษ',
    sourceUrl: 'https://fda.moph.go.th/alert-dental-2026',
    publishedDate: '2026-08-10',
    confidenceScore: 0.98,
    status: 'REVOKED',
  },
  {
    id: 'res-2',
    title: 'ผลการตรวจสอบโรงงานผลิตน้ำดื่ม "ตรา ไอร่า (Aira)" อ.อุทุมพรพิสัย',
    category: 'LICENSES',
    snippet: 'จากการตรวจสอบสถานที่ผลิตน้ำดื่มบรรจุขวด พบว่ายังไม่ได้รับใบอนุญาตผลิตอาหาร (แบบ อ.2) และยังไม่มีเลขสารบบอาหาร (อย.) อย่างถูกต้อง เจ้าหน้าที่ได้สั่งระงับการจำหน่ายชั่วคราว',
    source: 'กลุ่มงานคุ้มครองผู้บริโภค สสจ.ศรีสะเกษ',
    sourceUrl: 'https://ssk.moph.go.th/consumer-protection/aira-water',
    publishedDate: '2026-08-15',
    confidenceScore: 0.95,
    status: 'UNREGISTERED',
  },
  {
    id: 'res-3',
    title: 'รายชื่อเพจหลอกลวงซื้อขายสินค้าไอทีและโทรศัพท์มือถือราคาต่ำกว่าจริง',
    category: 'FRAUD_ALERTS',
    snippet: 'เตือนภัยบัญชีม้าธนาคารกสิกรไทย 0892414971 (นางสาวปนัดดา คำนนท์) และพร้อมเพย์ 0624149791 เชื่อมโยงกับพฤติการณ์หลอกโอนเงินมัดจำซื้อสินค้าแล้วปิดเพจหนี มีผู้เสียหายร้องทุกข์กว่า 10 คดี',
    source: 'ศูนย์ปราบปรามอาชญากรรมทางเทคโนโลยีสารสนเทศ (PCT/AOC 1441)',
    sourceUrl: 'https://pct.police.go.th/alerts/case-panadda',
    publishedDate: '2026-08-18',
    confidenceScore: 0.99,
    status: 'WARNING',
  },
  {
    id: 'res-4',
    title: 'คลินิกทันตกรรมที่ได้รับใบอนุญาตประกอบกิจการสถานพยาบาลถูกต้อง เขต 10',
    category: 'COMPANIES',
    snippet: 'ตรวจสอบรายชื่อคลินิกทันตกรรมที่ได้รับอนุญาตและผ่านเกณฑ์มาตรฐานความปลอดภัยทางสุขอนามัยในพื้นที่จังหวัดศรีสะเกษและอุบลราชธานี',
    source: 'กรมสนับสนุนบริการสุขภาพ (สบส.)',
    sourceUrl: 'https://hss.moph.go.th/dental-clinics-list',
    publishedDate: '2026-08-01',
    confidenceScore: 0.92,
    status: 'SAFE',
  },
];

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
  const query = rawQuery.toLowerCase();
  const normalizedQuery = query.replace(/[\s\-\/\.]/g, '');
  const cat = parsed.data.category;

  // 1. Intelligent FDA & Drug pattern resolver
  const smartFdaResults = resolveSmartFdaSearch(rawQuery);

  // 2. Knowledge base filter
  const kbResults = MOCK_PUBLIC_KNOWLEDGE.filter((item) => {
    const matchesCategory = cat === 'ALL' || item.category === cat;
    const titleNormalized = item.title.toLowerCase().replace(/[\s\-\/\.]/g, '');
    const snippetNormalized = item.snippet.toLowerCase().replace(/[\s\-\/\.]/g, '');
    const matchesQuery =
      item.title.toLowerCase().includes(query) ||
      item.snippet.toLowerCase().includes(query) ||
      item.source.toLowerCase().includes(query) ||
      (normalizedQuery.length >= 3 &&
        (titleNormalized.includes(normalizedQuery) || snippetNormalized.includes(normalizedQuery)));
    return matchesCategory && matchesQuery;
  });

  // Combine and deduplicate
  const combinedMap = new Map<string, SmartSearchResult>();
  for (const item of [...smartFdaResults, ...kbResults]) {
    if (!combinedMap.has(item.id)) {
      combinedMap.set(item.id, item);
    }
  }

  const results = Array.from(combinedMap.values());

  // AI Citation Summary
  let aiSummary = '';
  if (results.length > 0) {
    const topItem = results[0];
    aiSummary = `จากการตรวจสอบระบบสืบค้นแยกรายผลิตภัณฑ์ อย. (porta.fda.moph.go.th) พบข้อมูลที่เกี่ยวข้องกับ "${rawQuery}": ${topItem.snippet} (อ้างอิงจาก: ${topItem.source} ณ วันที่ ${topItem.publishedDate})`;
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
