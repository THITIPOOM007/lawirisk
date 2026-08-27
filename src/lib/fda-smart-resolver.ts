import 'server-only';

export interface SmartSearchResult {
  id: string;
  title: string;
  category: 'HEALTH_PRODUCTS' | 'FRAUD_ALERTS' | 'COMPANIES' | 'LICENSES';
  productCategoryLabel: string;
  snippet: string;
  source: string;
  sourceUrl: string;
  publishedDate: string;
  confidenceScore: number;
  status: 'SAFE' | 'WARNING' | 'REVOKED' | 'UNREGISTERED';
  metadata?: Record<string, string>;
}

type TrustedSourceRow = {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  product_category_label?: unknown;
  snippet?: unknown;
  source?: unknown;
  source_url?: unknown;
  published_date?: unknown;
  status?: unknown;
};

const categories = new Set<SmartSearchResult['category']>([
  'HEALTH_PRODUCTS',
  'FRAUD_ALERTS',
  'COMPANIES',
  'LICENSES',
]);
const statuses = new Set<SmartSearchResult['status']>([
  'SAFE',
  'WARNING',
  'REVOKED',
  'UNREGISTERED',
]);

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeHttpsUrl(value: unknown) {
  try {
    const parsed = new URL(text(value));
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function mapTrustedRow(row: TrustedSourceRow): SmartSearchResult | null {
  const id = text(row.id);
  const title = text(row.title);
  const snippet = text(row.snippet);
  const source = text(row.source);
  const sourceUrl = safeHttpsUrl(row.source_url);
  const category = text(row.category) as SmartSearchResult['category'];
  const status = text(row.status) as SmartSearchResult['status'];
  if (!id || !title || !snippet || !source || !sourceUrl || !categories.has(category) || !statuses.has(status)) {
    return null;
  }
  return {
    id,
    title,
    category,
    productCategoryLabel: text(row.product_category_label) || 'ทะเบียนจากแหล่งข้อมูลที่อนุมัติ',
    snippet,
    source,
    sourceUrl,
    publishedDate: text(row.published_date) || 'ไม่ระบุ',
    confidenceScore: 1,
    status,
  };
}

function inferCategory(query: string): SmartSearchResult['category'] {
  if (/บริษัท|ห้างหุ้นส่วน|นิติบุคคล/.test(query)) return 'COMPANIES';
  if (/ฆพ\.|ใบอนุญาต|ทะเบียน/.test(query)) return 'LICENSES';
  if (/หลอก|โกง|เตือนภัย/.test(query)) return 'FRAUD_ALERTS';
  return 'HEALTH_PRODUCTS';
}

function unverifiedGuidance(query: string): SmartSearchResult {
  const cleanDigits = query.replace(/\D/g, '');
  const looksLikeRegistration = cleanDigits.length >= 10 || /^[1-3][A-N]\s*\d+/i.test(query);
  return {
    id: `unverified-${encodeURIComponent(query).slice(0, 120)}`,
    title: looksLikeRegistration ? 'รูปแบบเลขทะเบียนที่ต้องตรวจสอบ' : 'ยังไม่พบรายการที่ยืนยันได้',
    category: inferCategory(query),
    productCategoryLabel: 'คำแนะนำการตรวจสอบ — ไม่ใช่ผลรับรอง',
    snippet: `ยังไม่ได้ยืนยัน “${query}” กับฐานข้อมูลทางการ โปรดเปิดลิงก์ต้นทางและตรวจสอบเลขทะเบียน ชื่อผลิตภัณฑ์ ผู้รับอนุญาต และสถานะให้ตรงกันก่อนนำไปใช้`,
    source: 'ศูนย์ค้นหาข้อมูลผลิตภัณฑ์สุขภาพ อย.',
    sourceUrl: 'https://porta.fda.moph.go.th/fda_search_center_new/',
    publishedDate: 'ไม่ระบุ',
    confidenceScore: 0,
    status: 'UNREGISTERED',
  };
}

export async function resolveMultiChannelSearch(rawQuery: string, searchDb = true): Promise<SmartSearchResult[]> {
  const query = rawQuery.trim();
  if (searchDb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (url && anonKey) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await supabase.rpc('search_trusted_sources', {
          search_query: query,
          max_results: 10,
        });
        if (!error && Array.isArray(data)) {
          const verified = data.map((row) => mapTrustedRow(row as TrustedSourceRow)).filter((row): row is SmartSearchResult => row !== null);
          if (verified.length > 0) return verified;
        }
      } catch {
        // Fall through to an explicitly unverified result. Do not convert provider failure into success.
      }
    }
  }
  return [unverifiedGuidance(query)];
}
