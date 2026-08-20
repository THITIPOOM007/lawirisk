import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  category: z.enum(['ALL', 'HEALTH_PRODUCTS', 'FRAUD_ALERTS', 'COMPANIES', 'LICENSES']).default('ALL'),
});

interface SearchResultItem {
  id: string;
  title: string;
  category: string;
  snippet: string;
  source: string;
  sourceUrl: string;
  publishedDate: string;
  confidenceScore: number;
  status: 'SAFE' | 'WARNING' | 'REVOKED' | 'UNREGISTERED';
}

const MOCK_PUBLIC_KNOWLEDGE: SearchResultItem[] = [
  {
    id: 'res-fda-1',
    title: 'ทะเบียนยา 2A 36/61: ยาเม็ดพาราเซตามอล 500 มก. (Paracetamol Tablets 500 mg)',
    category: 'HEALTH_PRODUCTS',
    snippet: 'เลขทะเบียนตำรับยา 2A 36/61 สถานะ: ได้รับอนุญาตถูกต้องตามกฎหมาย (ACTIVE) ผลิตโดยโรงงานผลิตยามาตรฐาน GMP ได้รับการรับรองจากสำนักงานคณะกรรมการอาหารและยา (อย.)',
    source: 'ฐานข้อมูลตรวจสอบการอนุญาต สำนักงานคณะกรรมการอาหารและยา (อย.)',
    sourceUrl: 'https://fda.moph.go.th/drug/license/2A-36-61',
    publishedDate: '2026-08-01',
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

  const query = parsed.data.q.toLowerCase().trim();
  const normalizedQuery = query.replace(/[\s\-\/\.]/g, '');
  const cat = parsed.data.category;

  const results = MOCK_PUBLIC_KNOWLEDGE.filter((item) => {
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

  // AI Citation Summary
  let aiSummary = '';
  if (results.length > 0) {
    const topItem = results[0];
    aiSummary = `จากการตรวจสอบฐานข้อมูลสาธารณะและการอนุญาต อย. พบข้อมูลที่เกี่ยวข้องกับ "${parsed.data.q}": ${topItem.snippet} (อ้างอิงจาก: ${topItem.source} ณ วันที่ ${topItem.publishedDate})`;
  } else {
    aiSummary = `ไม่พบประวัติการแจ้งเตือนหรือข้อมูลที่เป็นภัยคุกคามโดยตรงเกี่ยวกับ "${parsed.data.q}" ในฐานข้อมูลเปิดของหน่วยงาน กรุณาตรวจสอบความถูกต้องของชื่อและเอกสารสิทธิ์เพิ่มเติม`;
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
