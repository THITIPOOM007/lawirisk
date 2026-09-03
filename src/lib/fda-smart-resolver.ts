import 'server-only';

import { z } from 'zod';

export type PublicSearchCategory =
  | 'ALL'
  | 'HEALTH_PRODUCTS'
  | 'HEALTH_SERVICES'
  | 'CLINICS'
  | 'MASSAGE_SPA'
  | 'FRAUD_ALERTS'
  | 'COMPANIES'
  | 'LICENSES';

export interface SmartSearchResult {
  id: string;
  title: string;
  category: Exclude<PublicSearchCategory, 'ALL'>;
  productCategoryLabel: string;
  snippet: string;
  source: string;
  sourceUrl: string;
  publishedDate: string;
  confidenceScore: number;
  status: 'SAFE' | 'WARNING' | 'REVOKED' | 'UNREGISTERED' | 'UNAVAILABLE';
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
  metadata?: unknown;
};

type SearchFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ResolveSearchOptions = {
  category?: PublicSearchCategory;
  searchDb?: boolean;
  searchOfficial?: boolean;
  fetchImpl?: SearchFetch;
  now?: () => Date;
};

const FDA_SEARCH_URL = 'https://porta.fda.moph.go.th/FDA_SEARCH_CENTER_BACKEND/SEACH_ALL/GET_SEARCH';
const FDA_SOURCE_URL = 'https://porta.fda.moph.go.th/fda_search_center_new/';
const HSS_SPA_SEARCH_URL = 'https://spa-services.hss.moph.go.th/permit/spa/establishment';
const HSS_SPA_ACTION_ID = '605fc3e19abd12c740a283c912d926bbba1de06a75';
const HSS_SPA_MAX_ATTEMPTS = 3;
const HSS_CLINIC_SEARCH_ENDPOINT = 'https://hosp.hss.moph.go.th/key-searchs';
const HSS_CLINIC_SOURCE_URL = 'https://hosp.hss.moph.go.th';
const HSS_CLINIC_DIRECTORY_ENDPOINT = 'https://privatehospital.hss.moph.go.th/view_hospital.php';
const HSS_CLINIC_DIRECTORY_URL = 'https://privatehospital.hss.moph.go.th/s_view_hospital.php';
const HSS_CLINIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HSS_PUBLIC_NEWS_SEARCH_URL = 'https://hss.moph.go.th/show_topic2.php';
const ORYOR_NEWS_API_URL = 'https://api.oryor.com/media/newsUpdate?page=1&sort=last&limit=40';
const ORYOR_NEWS_DIRECTORY_URL = 'https://oryor.com/media/newsUpdate';
const NHSO_PROVIDER_SEARCH_URL = 'https://cpp.nhso.go.th/search/';
const NHSO_PROVIDER_PROFILE_URL = 'https://cpp.nhso.go.th/profile/?hcode=';

const categories = new Set<SmartSearchResult['category']>([
  'HEALTH_PRODUCTS',
  'HEALTH_SERVICES',
  'CLINICS',
  'MASSAGE_SPA',
  'FRAUD_ALERTS',
  'COMPANIES',
  'LICENSES',
]);
const statuses = new Set<SmartSearchResult['status']>([
  'SAFE',
  'WARNING',
  'REVOKED',
  'UNREGISTERED',
  'UNAVAILABLE',
]);

const fdaProductRowSchema = z.object({
  IDA: z.unknown().optional(),
  typepro: z.unknown().optional(),
  typeallow: z.unknown().optional(),
  lcnno: z.unknown().optional(),
  productha: z.unknown().optional(),
  produceng: z.unknown().optional(),
  licen: z.unknown().optional(),
  thanm: z.unknown().optional(),
  Newcode: z.unknown().optional(),
  cncnm: z.unknown().optional(),
  Addr: z.unknown().optional(),
  URLs_NEW: z.unknown().optional(),
  catalogue_no: z.unknown().optional(),
}).passthrough();

const hssSpaPayloadSchema = z.object({
  found: z.boolean(),
  query: z.object({
    mode: z.string().optional(),
    text: z.string().optional(),
  }).optional(),
  results: z.array(z.object({
    doName: z.unknown().optional(),
    shop: z.object({
      memberID: z.unknown().optional(),
      shopType: z.unknown().optional(),
      nameThai: z.unknown().optional(),
      nameEng: z.unknown().optional(),
      status: z.unknown().optional(),
      statusText: z.unknown().optional(),
      addressText: z.unknown().optional(),
      provName: z.unknown().optional(),
      shopArea: z.unknown().optional(),
    }).passthrough(),
  }).passthrough()).optional(),
}).passthrough();

type HssSpaResultRow = NonNullable<z.infer<typeof hssSpaPayloadSchema>['results']>[number];

function text(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function safeHttpsUrl(value: unknown, allowedHosts?: ReadonlySet<string>) {
  try {
    const parsed = new URL(text(value));
    if (parsed.protocol !== 'https:') return '';
    if (allowedHosts && !allowedHosts.has(parsed.hostname)) return '';
    return parsed.toString();
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
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? Object.fromEntries(
      Object.entries(row.metadata as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, value]) => [key.slice(0, 100), text(value).slice(0, 500)])
        .filter(([key, value]) => key.length > 0 && value.length > 0),
    )
    : undefined;
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
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

export function mapTrustedSourceRows(value: unknown): SmartSearchResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => mapTrustedRow(row as TrustedSourceRow))
    .filter((row): row is SmartSearchResult => row !== null);
}

function inferCategory(query: string): SmartSearchResult['category'] {
  if (/คลินิก|สถานพยาบาล/i.test(query)) return 'CLINICS';
  if (/ร้าน\s*นวด|นวดเพื่อสุขภาพ|นวดเพื่อเสริมความงาม|สปา|massage|spa/i.test(query)) return 'MASSAGE_SPA';
  if (/บริษัท|ห้างหุ้นส่วน|นิติบุคคล/.test(query)) return 'COMPANIES';
  if (/ฆพ\.|ใบอนุญาต|ทะเบียน/.test(query)) return 'LICENSES';
  if (/หลอก|โกง|เตือนภัย/.test(query)) return 'FRAUD_ALERTS';
  return 'HEALTH_PRODUCTS';
}

function isHealthServiceQuery(query: string) {
  return /คลินิก|สถานพยาบาล|ร้าน\s*นวด|นวดเพื่อสุขภาพ|นวดเพื่อเสริมความงาม|สปา|massage|spa/i.test(query);
}

function isClinicQuery(query: string) {
  return /คลินิก|สถานพยาบาล/i.test(query) && !/ร้าน\s*นวด|นวดเพื่อสุขภาพ|นวดเพื่อเสริมความงาม|สปา|massage|spa/i.test(query);
}

function isSpaQuery(query: string) {
  return /ร้าน\s*นวด|นวดเพื่อสุขภาพ|นวดเพื่อเสริมความงาม|สปา|massage|spa/i.test(query);
}

function selectOfficialSource(query: string, category: PublicSearchCategory): 'FDA' | 'HSS_CLINIC_AND_NHSO' | 'HSS_SPA' | 'HSS_BOTH_AND_NHSO' | 'ALL_REGISTRIES' | 'NONE' {
  if (category === 'HEALTH_PRODUCTS' || category === 'LICENSES') return 'FDA';
  if (category === 'CLINICS') return 'HSS_CLINIC_AND_NHSO';
  if (category === 'MASSAGE_SPA') return 'HSS_SPA';
  if (category === 'HEALTH_SERVICES') return 'HSS_BOTH_AND_NHSO';
  if (category !== 'ALL') return 'NONE';
  if (isClinicQuery(query)) return 'HSS_CLINIC_AND_NHSO';
  if (isSpaQuery(query)) return 'HSS_SPA';
  if (isHealthServiceQuery(query)) return 'HSS_BOTH_AND_NHSO';
  if (/บริษัท|ห้างหุ้นส่วน|นิติบุคคล|หลอก|โกง|เตือนภัย/.test(query)) return 'NONE';
  if (/\d/.test(query)) return 'FDA';
  return 'ALL_REGISTRIES';
}

function checkedDate(now: () => Date) {
  return now().toISOString();
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, key: string) => {
    const normalized = key.toLowerCase();
    const numeric = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : normalized.startsWith('#')
        ? Number.parseInt(normalized.slice(1), 10)
        : Number.NaN;
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff) return String.fromCodePoint(numeric);
    return named[normalized] ?? entity;
  });
}

function htmlToLines(html: string) {
  return decodeHtml(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:article|div|h[1-6]|li|p|section|span|td|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function compactHtmlText(html: string, maxLength = 600) {
  return htmlToLines(html).join(' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanHssText(value: string) {
  return value.replace(/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+/, '').trim();
}

export function buildOfficialHssClinicQueryVariants(rawQuery: string): string[] {
  const normalized = rawQuery.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const withoutGenericTerms = normalized
    .replace(/โรงพยาบาล|สถานพยาบาล|คลินิก(?:เวชกรรม|ทันตกรรม)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [...new Set([normalized, withoutGenericTerms].filter(Boolean))];
}

function unverifiedGuidance(
  query: string,
  source: 'FDA' | 'HSS' | 'HSS_CLINIC' | 'HSS_SPA' | 'INTERNAL' = 'FDA',
  now: () => Date = () => new Date(),
): SmartSearchResult {
  const cleanDigits = query.replace(/\D/g, '');
  const looksLikeRegistration = cleanDigits.length >= 10 || /^[1-3][A-N]\s*\d+/i.test(query);
  const isHss = source === 'HSS' || source === 'HSS_CLINIC' || source === 'HSS_SPA';
  const isClinic = source === 'HSS_CLINIC';
  const inspectedAt = checkedDate(now);
  return {
    id: `unverified-${source.toLowerCase()}-${encodeURIComponent(query).slice(0, 100)}`,
    title: looksLikeRegistration ? 'ไม่พบรายการทะเบียนที่ตรงกัน' : 'ยังไม่พบรายการที่ยืนยันได้',
    category: isClinic ? 'CLINICS' : isHss ? 'MASSAGE_SPA' : inferCategory(query),
    productCategoryLabel: 'ผลการตรวจสอบจากต้นทาง — ไม่ใช่ผลรับรอง',
    snippet: isHss
      ? `ไม่พบรายการที่ตรงกับ "${query}" ในผลค้นหาที่ระบบเข้าถึงได้จาก สบส. ณ เวลาตรวจสอบ การไม่พบข้อมูลไม่ใช่ข้อยืนยันว่าไม่มีใบอนุญาต`
      : `ยังไม่ได้ยืนยันรายการที่ตรงกับ "${query}" จากคำตอบล่าสุดของฐานข้อมูล อย. ณ เวลาตรวจสอบ โปรดตรวจรูปแบบเลขหรือชื่อผลิตภัณฑ์อีกครั้ง`,
    source: isHss ? 'กรมสนับสนุนบริการสุขภาพ (สบส.)' : 'ศูนย์ตรวจสอบการอนุญาต อย.',
    sourceUrl: isClinic ? HSS_CLINIC_SOURCE_URL : isHss ? HSS_SPA_SEARCH_URL : FDA_SOURCE_URL,
    publishedDate: inspectedAt,
    confidenceScore: 0,
    status: 'UNREGISTERED',
    metadata: {
      'คำค้น': query,
      'ตรวจสอบเมื่อ': inspectedAt,
    },
  };
}

function providerUnavailable(query: string, source: 'FDA' | 'HSS' | 'HSS_CLINIC' | 'HSS_SPA', now: () => Date): SmartSearchResult {
  const isHss = source === 'HSS' || source === 'HSS_CLINIC' || source === 'HSS_SPA';
  const isClinic = source === 'HSS_CLINIC';
  const inspectedAt = checkedDate(now);
  return {
    id: `unavailable-${source.toLowerCase()}-${encodeURIComponent(query).slice(0, 100)}`,
    title: `เชื่อมต่อฐานข้อมูล ${isHss ? 'สบส.' : 'อย.'} ไม่สำเร็จ`,
    category: isClinic ? 'CLINICS' : isHss ? 'MASSAGE_SPA' : 'HEALTH_PRODUCTS',
    productCategoryLabel: 'แหล่งข้อมูลทางการไม่พร้อมใช้งานชั่วคราว',
    snippet: `ระบบไม่ได้รับคำตอบที่ตรวจสอบได้จากต้นทาง จึงไม่สรุปว่า “พบ” หรือ “ไม่พบ” สำหรับ “${query}” กรุณาลองอีกครั้ง`,
    source: isHss ? 'กรมสนับสนุนบริการสุขภาพ (สบส.)' : 'ศูนย์ตรวจสอบการอนุญาต อย.',
    sourceUrl: isClinic ? HSS_CLINIC_SOURCE_URL : isHss ? HSS_SPA_SEARCH_URL : FDA_SOURCE_URL,
    publishedDate: inspectedAt,
    confidenceScore: 0,
    status: 'UNAVAILABLE',
    metadata: {
      'คำค้น': query,
      'ตรวจสอบเมื่อ': inspectedAt,
    },
  };
}

async function fetchWithTimeout(
  fetchImpl: SearchFetch,
  url: string,
  init: RequestInit,
  timeoutMs = 12_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function mapFdaProductRow(rowValue: unknown, index: number, now: () => Date): SmartSearchResult | null {
  const parsed = fdaProductRowSchema.safeParse(rowValue);
  if (!parsed.success) return null;
  const row = parsed.data;
  const productNameThai = text(row.productha);
  const productNameEnglish = text(row.produceng);
  const registrationNumber = text(row.lcnno);
  const newCode = text(row.Newcode);
  const holder = text(row.licen) || text(row.thanm);
  const officialStatus = text(row.cncnm);
  if (!productNameThai || (!registrationNumber && !newCode)) return null;

  const detailUrl = safeHttpsUrl(row.URLs_NEW, new Set(['porta.fda.moph.go.th'])) || FDA_SOURCE_URL;
  const status = /ยกเลิก|เพิกถอน|สิ้นอายุ/.test(officialStatus)
    ? 'REVOKED'
    : /คงอยู่|อนุญาต/.test(officialStatus)
      ? 'SAFE'
      : 'WARNING';
  const inspectedAt = checkedDate(now);
  return {
    id: `fda-${newCode || text(row.IDA) || `${registrationNumber}-${index}`}`,
    title: productNameThai,
    category: 'HEALTH_PRODUCTS',
    productCategoryLabel: text(row.typepro) || 'ผลิตภัณฑ์สุขภาพ',
    snippet: [
      registrationNumber && `เลขใบสำคัญ/ใบอนุญาต ${registrationNumber}`,
      holder && `ผู้รับอนุญาต ${holder}`,
      officialStatus && officialStatus.replace(/\\/g, ' · '),
    ].filter(Boolean).join(' — '),
    source: 'ศูนย์ตรวจสอบการอนุญาต อย.',
    sourceUrl: detailUrl,
    publishedDate: inspectedAt,
    confidenceScore: 1,
    status,
    metadata: {
      'ประเภทผลิตภัณฑ์': text(row.typepro) || '-',
      'เลขใบสำคัญ/ใบอนุญาต': registrationNumber || '-',
      'ชื่อผลิตภัณฑ์ภาษาไทย': productNameThai,
      'ชื่อผลิตภัณฑ์ภาษาอังกฤษ': productNameEnglish || '-',
      'ผู้รับอนุญาต': holder || '-',
      'New Code': newCode || '-',
      'Catalogue No.': text(row.catalogue_no) || '-',
      'สถานะจาก อย.': officialStatus.replace(/\\/g, ' · ') || '-',
      'ที่อยู่สถานที่': text(row.Addr) || '-',
      'ตรวจสอบเมื่อ': inspectedAt,
    },
  };
}

function normalizedFdaQueryText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FDA's public form treats equivalent drug-registration spacing as different
 * strings. Keep the expansion deliberately narrow so a formatting repair can
 * never turn into a fuzzy search for another product.
 */
export function buildOfficialFdaQueryVariants(rawQuery: string): string[] {
  const normalized = normalizedFdaQueryText(rawQuery);
  if (!normalized) return [];

  const compact = normalized.toUpperCase().replace(/\s+/g, '');
  const registration = compact.match(/^(\d{1,2}[A-Z]{1,3})(\d{1,7}\/\d{1,4})$/);
  if (!registration) return [normalized];

  const [, prefix, serial] = registration;
  return [`${prefix} ${serial}`, `${prefix}${serial}`];
}

function annotateFdaQueryVariant(
  results: SmartSearchResult[],
  originalQuery: string,
  submittedQuery: string,
) {
  return results.map((result) => ({
    ...result,
    metadata: {
      ...result.metadata,
      'คำค้นที่ผู้ใช้กรอก': originalQuery.trim(),
      'รูปแบบคำค้นที่ส่งให้ อย.': submittedQuery,
      'ปรับรูปแบบอัตโนมัติ': normalizedFdaQueryText(originalQuery) === submittedQuery ? 'ไม่ใช่' : 'ใช่',
    },
  }));
}

export async function searchOfficialFdaProducts(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  const queryVariants = buildOfficialFdaQueryVariants(query);
  if (queryVariants.length === 0) return [unverifiedGuidance(query, 'FDA', now)];

  for (const submittedQuery of queryVariants) {
    const model = {
      SEARCH_VALUE: submittedQuery,
      RADIO_TYPE: 'ผลิตภัณฑ์ทั้งหมด',
      RADIO_TYPE_ETC_FOOD: null,
      RADIO_TYPE_ETC_DRUG: null,
      RADIO_TYPE_ETC_HERB: null,
      RADIO_TYPE_ETC_TXC: null,
      RADIO_TYPE_ETC_CMT: null,
      RADIO_TYPE_ETC_NCT: null,
      RADIO_TYPE_ETC_MDC: null,
      RADIO_TYPE_ETC_ADVER: null,
      RADIO_TYPE_LOCATION: null,
    };
    const body = new FormData();
    body.set('MODEL', JSON.stringify(model));
    body.set('search_input', submittedQuery);

    try {
      const response = await fetchWithTimeout(fetchImpl, FDA_SEARCH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body,
        cache: 'no-store',
      });
      if (!response.ok) return [providerUnavailable(query, 'FDA', now)];
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) return [providerUnavailable(query, 'FDA', now)];
      const results = payload
        .slice(0, 10)
        .map((row, index) => mapFdaProductRow(row, index, now))
        .filter((row): row is SmartSearchResult => row !== null);
      if (results.length > 0) return annotateFdaQueryVariant(results, query, submittedQuery);
    } catch {
      return [providerUnavailable(query, 'FDA', now)];
    }
  }

  return [unverifiedGuidance(query, 'FDA', now)];
}

function parseHssActionPayload(raw: string) {
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    try {
      const candidate: unknown = JSON.parse(line.slice(separator + 1));
      const parsed = hssSpaPayloadSchema.safeParse(candidate);
      if (parsed.success) return parsed.data;
    } catch {
      // Continue through other React Server Component records.
    }
  }
  return null;
}

function findHssSpaActionId(script: string) {
  const match = script.match(/createServerReference\("([a-f0-9]{40,64})",[\s\S]{0,300}?"searchSpaShopDrizzle"/i);
  return match?.[1] || '';
}

async function discoverHssSpaActionId(fetchImpl: SearchFetch): Promise<string> {
  try {
    const pageResponse = await fetchWithTimeout(fetchImpl, HSS_SPA_SEARCH_URL, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      cache: 'no-store',
    }, 8_000);
    if (!pageResponse.ok) return '';

    const page = await pageResponse.text();
    const scriptUrls = Array.from(page.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js(?:\?[^\"]*)?)"/gi))
      .map((match) => {
        try {
          const url = new URL(match[1], HSS_SPA_SEARCH_URL);
          return url.origin === 'https://spa-services.hss.moph.go.th' ? url.toString() : '';
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .slice(-24);
    if (scriptUrls.length === 0) return '';

    const scripts = await Promise.all(scriptUrls.map(async (url) => {
      try {
        const response = await fetchWithTimeout(fetchImpl, url, {
          method: 'GET',
          headers: { Accept: 'application/javascript,text/javascript,*/*' },
          cache: 'no-store',
        }, 8_000);
        return response.ok ? response.text() : '';
      } catch {
        return '';
      }
    }));
    return scripts.map(findHssSpaActionId).find(Boolean) || '';
  } catch {
    return '';
  }
}

async function requestHssSpaSearch(
  query: string,
  mode: 'license' | 'name',
  actionId: string,
  fetchImpl: SearchFetch,
) {
  const response = await fetchWithTimeout(fetchImpl, HSS_SPA_SEARCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionId,
      Origin: 'https://spa-services.hss.moph.go.th',
      Referer: HSS_SPA_SEARCH_URL,
      'User-Agent': HSS_CLINIC_USER_AGENT,
    },
    body: JSON.stringify([mode, query]),
    cache: 'no-store',
  }, 25_000);
  return { response, body: await response.text() };
}

function mapHssSpaResult(value: HssSpaResultRow, index: number, now: () => Date): SmartSearchResult | null {
  const shop = value.shop;
  const licenseNumber = text(shop.memberID);
  const nameThai = text(shop.nameThai);
  if (!licenseNumber || !nameThai) return null;
  const officialStatus = text(shop.statusText);
  const numericStatus = Number(shop.status);
  const status: SmartSearchResult['status'] = numericStatus === 7 || /ได้รับอนุญาต/.test(officialStatus)
    ? 'SAFE'
    : /ยกเลิก|เพิกถอน|สิ้นอายุ/.test(officialStatus)
      ? 'REVOKED'
      : 'WARNING';
  const inspectedAt = checkedDate(now);
  return {
    id: `hss-spa-${licenseNumber || index}`,
    title: nameThai,
    category: 'MASSAGE_SPA',
    productCategoryLabel: text(shop.shopType) || 'สถานประกอบการเพื่อสุขภาพ',
    snippet: `เลขที่ใบอนุญาต ${licenseNumber} — สถานะ ${officialStatus || 'ไม่ระบุ'} — ${text(shop.addressText) || 'ไม่ระบุที่อยู่'}`,
    source: 'กรมสนับสนุนบริการสุขภาพ (สบส.)',
    sourceUrl: HSS_SPA_SEARCH_URL,
    publishedDate: inspectedAt,
    confidenceScore: 1,
    status,
    metadata: {
      'ประเภทกิจการ': text(shop.shopType) || '-',
      'เลขที่ใบอนุญาต': licenseNumber,
      'ชื่อสถานประกอบการภาษาไทย': nameThai,
      'ชื่อสถานประกอบการภาษาอังกฤษ': text(shop.nameEng) || '-',
      'สถานะจาก สบส.': officialStatus || '-',
      'ที่ตั้ง': text(shop.addressText) || '-',
      'จังหวัด': text(shop.provName) || '-',
      'พื้นที่ให้บริการ': text(shop.shopArea) ? `${text(shop.shopArea)} ตร.ม.` : '-',
      'ตรวจสอบเมื่อ': inspectedAt,
    },
  };
}

function clinicProviderState(
  query: string,
  status: 'UNREGISTERED' | 'UNAVAILABLE',
  now: () => Date,
): SmartSearchResult {
  const inspectedAt = checkedDate(now);
  const unavailable = status === 'UNAVAILABLE';
  return {
    id: `${unavailable ? 'unavailable' : 'unverified'}-hss-clinic-${encodeURIComponent(query).slice(0, 80)}`,
    title: unavailable ? 'เชื่อมต่อทะเบียนสถานพยาบาล สบส. ไม่สำเร็จ' : 'ไม่พบสถานพยาบาลที่ตรงกัน',
    category: 'CLINICS',
    productCategoryLabel: unavailable ? 'ทะเบียนสถานพยาบาลไม่พร้อมใช้งานชั่วคราว' : 'ผลค้นทะเบียนสถานพยาบาล — ไม่ใช่ผลรับรอง',
    snippet: unavailable
      ? `ระบบไม่ได้รับคำตอบที่ตรวจสอบได้จากฐานรายชื่อโรงพยาบาลและคลินิก สบส. จึงไม่สรุปว่า “พบ” หรือ “ไม่พบ” สำหรับ “${query}”`
      : `ไม่พบรายการที่ตรงกับ “${query}” ในคำตอบล่าสุดจากฐานรายชื่อโรงพยาบาลและคลินิก สบส. การไม่พบข้อมูลไม่ใช่ข้อยืนยันว่าไม่มีใบอนุญาต`,
    source: 'ทะเบียนสถานพยาบาลเอกชน กรมสนับสนุนบริการสุขภาพ (สบส.)',
    sourceUrl: HSS_CLINIC_SOURCE_URL,
    publishedDate: inspectedAt,
    confidenceScore: 0,
    status,
    metadata: { 'คำค้น': query, 'ตรวจสอบเมื่อ': inspectedAt },
  };
}

function parseHssClinicCard(cardHtml: string, index: number, query: string, now: () => Date): SmartSearchResult | null {
  const lines = htmlToLines(cardHtml);

  let name = '';
  let licenseNumber = '';
  let address = '';
  let validUntil = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/ชื่อสถานพยาบาล\s*:/.test(line)) {
      name = cleanHssText(lines[i + 1]?.trim() || line.split(':').slice(1).join(':').trim());
    } else if (/เลขที่ใบอนุญาต(?:ประกอบกิจการ)?\s*:/.test(line)) {
      licenseNumber = lines[i + 1]?.trim() || line.split(':').slice(1).join(':').trim();
    } else if (/สถานที่ตั้ง\s*:/.test(line)) {
      address = lines[i + 1]?.trim() || line.split(':').slice(1).join(':').trim();
    } else if (/ใช้ได้ถึงวันที่\s*:/.test(line)) {
      validUntil = lines[i + 1]?.trim() || line.split(':').slice(1).join(':').trim();
    }
  }

  if (!name && !licenseNumber) return null;

  const inspectedAt = checkedDate(now);
  const idSeed = licenseNumber || `${name}-${index}`;
  return {
    id: `hss-clinic-${encodeURIComponent(idSeed).slice(0, 100)}`,
    title: name || 'ไม่ระบุชื่อ',
    category: 'CLINICS',
    productCategoryLabel: 'สถานพยาบาล/คลินิก',
    snippet: `${licenseNumber ? `เลขที่ใบอนุญาต ${licenseNumber} — ` : ''}พบชื่อในบัญชีสาธารณะ สบส.${address ? ` — ${address}` : ''}${validUntil ? ` — ใช้ได้ถึง ${validUntil}` : ''}`,
    source: 'ทะเบียนสถานพยาบาลเอกชน กรมสนับสนุนบริการสุขภาพ (สบส.)',
    sourceUrl: HSS_CLINIC_SOURCE_URL,
    publishedDate: inspectedAt,
    confidenceScore: 1,
    status: 'WARNING',
    metadata: {
      'ชื่อสถานพยาบาล': name || '-',
      'เลขที่ใบอนุญาต': licenseNumber || 'ต้นทางไม่แสดงในรายการนี้',
      'ที่ตั้ง': address || '-',
      'ใช้ได้ถึง': validUntil || '-',
      'สถานะการตีความ': 'พบในบัญชีสาธารณะ สบส. — โปรดเปิดต้นฉบับเพื่อตรวจสถานะใบอนุญาตล่าสุด',
      'ตรวจสอบเมื่อ': inspectedAt,
    },
  };
}

function plainHtmlFragment(value: string) {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHssClinicDirectory(html: string, now: () => Date): SmartSearchResult[] {
  const names = Array.from(html.matchAll(/dot7\.jpg[^>]*>[\s\S]*?<b>\s*([^<]+?)\s*<\/b>/gi))
    .map((match) => cleanHssText(plainHtmlFragment(match[1] || '')));
  const addresses = Array.from(html.matchAll(/<b>\s*ที่อยู่\s*:\s*<\/b>\s*([\s\S]*?)<br\s*\/?>\s*<b>\s*เบอ/gi))
    .map((match) => plainHtmlFragment(match[1] || ''));
  const inspectedAt = checkedDate(now);

  return names.slice(0, 10).map((name, index) => {
    const address = addresses[index] || '';
    return {
      id: `hss-clinic-directory-${encodeURIComponent(`${name}-${address}`).slice(0, 100)}`,
      title: name,
      category: 'CLINICS' as const,
      productCategoryLabel: 'ผลสดจากรายชื่อโรงพยาบาลและคลินิก สบส.',
      snippet: `พบชื่อในฐานรายชื่อโรงพยาบาลและคลินิกของ สบส.${address ? ` — ${address}` : ''} — ต้นทางนี้ไม่แสดงเลขที่ใบอนุญาต โปรดเปิดต้นฉบับเพื่อตรวจรายละเอียดล่าสุด`,
      source: 'รายชื่อโรงพยาบาลและคลินิก กรมสนับสนุนบริการสุขภาพ (สบส.)',
      sourceUrl: HSS_CLINIC_DIRECTORY_URL,
      publishedDate: inspectedAt,
      confidenceScore: 1,
      status: 'WARNING' as const,
      metadata: {
        'ชื่อสถานพยาบาล': name,
        'เลขที่ใบอนุญาต': 'ต้นทางนี้ไม่แสดงในรายการค้นหา',
        'ที่ตั้ง': address || '-',
        'สถานะการตีความ': 'พบในรายชื่อสดของ สบส. — ไม่ใช่การรับรองสถานะใบอนุญาต',
        'ตรวจสอบเมื่อ': inspectedAt,
      },
    };
  });
}

async function searchHssClinicDirectory(
  query: string,
  fetchImpl: SearchFetch,
  now: () => Date,
): Promise<SmartSearchResult[]> {
  try {
    const response = await fetchWithTimeout(fetchImpl, HSS_CLINIC_DIRECTORY_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'text/html, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: HSS_CLINIC_DIRECTORY_URL,
        'User-Agent': HSS_CLINIC_USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({ s_data: 'MedicalName', q: query, post: '', type: '' }).toString(),
      cache: 'no-store',
    }, 8_000);
    if (!response.ok) return [clinicProviderState(query, 'UNAVAILABLE', now)];

    const html = await response.text();
    const results = parseHssClinicDirectory(html, now);
    if (results.length > 0) return results;
    if (/พบจำนวน\s*:\s*0\s*แห่ง/.test(html)) return [clinicProviderState(query, 'UNREGISTERED', now)];
    return [clinicProviderState(query, 'UNAVAILABLE', now)];
  } catch {
    return [clinicProviderState(query, 'UNAVAILABLE', now)];
  }
}

async function searchModernHssClinics(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  try {
    const searchType = /^\d+$/.test(query.trim()) ? 'code' : 'name';
    const body = new URLSearchParams({
      keyword: query,
      type: searchType,
      // The public HSS form exposes this value empty and accepts a direct
      // same-origin-style search. Do not manufacture a session/token: Workers
      // cannot reliably read Set-Cookie, which previously made every clinic
      // lookup fail before the actual registry request was sent.
      token: '',
    });

    const response = await fetchWithTimeout(fetchImpl, HSS_CLINIC_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: HSS_CLINIC_SOURCE_URL,
        Referer: `${HSS_CLINIC_SOURCE_URL}/`,
        'User-Agent': HSS_CLINIC_USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.warn(JSON.stringify({ event: 'HSS_CLINIC_REGISTRY_NON_SUCCESS', status: response.status }));
      return [clinicProviderState(query, 'UNAVAILABLE', now)];
    }

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) {
      return [clinicProviderState(query, 'UNAVAILABLE', now)];
    }

    const { code, data } = payload as { code?: number; data?: unknown; numRow?: string };

    if (code === 404) return [clinicProviderState(query, 'UNREGISTERED', now)];
    if (code !== 200 || !Array.isArray(data)) return [clinicProviderState(query, 'UNAVAILABLE', now)];

    const results = data
      .slice(0, 10)
      .map((cardHtml, index) => parseHssClinicCard(String(cardHtml), index, query, now))
      .filter((row): row is SmartSearchResult => row !== null);

    if (results.length > 0) return results;
    return [clinicProviderState(query, 'UNREGISTERED', now)];
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'HSS_CLINIC_REGISTRY_REQUEST_FAILED',
      error: error instanceof Error ? error.name : 'UnknownError',
    }));
    return [clinicProviderState(query, 'UNAVAILABLE', now)];
  }
}

function nhsoProviderState(
  query: string,
  status: 'UNREGISTERED' | 'UNAVAILABLE',
  now: () => Date,
): SmartSearchResult {
  const inspectedAt = checkedDate(now);
  const unavailable = status === 'UNAVAILABLE';
  return {
    id: `${unavailable ? 'unavailable' : 'unverified'}-nhso-provider-${encodeURIComponent(query).slice(0, 80)}`,
    title: unavailable ? 'เชื่อมต่อไดเรกทอรีหน่วยบริการ สปสช. ไม่สำเร็จ' : 'ไม่พบหน่วยบริการที่ตรงกันใน สปสช.',
    category: 'CLINICS',
    productCategoryLabel: unavailable ? 'ไดเรกทอรีหน่วยบริการ สปสช. ไม่พร้อมใช้งานชั่วคราว' : 'ผลค้นหาไดเรกทอรีหน่วยบริการ — ไม่ใช่ผลรับรอง',
    snippet: unavailable
      ? `ระบบไม่ได้รับคำตอบที่ตรวจสอบได้จากไดเรกทอรีหน่วยบริการ สปสช. จึงไม่สรุปว่า “พบ” หรือ “ไม่พบ” สำหรับ “${query}”`
      : `ไม่พบรายการที่ตรงกับ “${query}” ในคำตอบล่าสุดจากไดเรกทอรีหน่วยบริการ สปสช. การไม่พบข้อมูลไม่ใช่ข้อยืนยันว่าไม่มีใบอนุญาตหรือไม่ได้เข้าร่วมสิทธิการรักษา`,
    source: 'ไดเรกทอรีหน่วยบริการ สำนักงานหลักประกันสุขภาพแห่งชาติ (สปสช.)',
    sourceUrl: NHSO_PROVIDER_SEARCH_URL,
    publishedDate: inspectedAt,
    confidenceScore: 0,
    status,
    metadata: { 'คำค้น': query, 'ตรวจสอบเมื่อ': inspectedAt },
  };
}

function findNhsoField(lines: string, label: 'เบอร์โทรศัพท์' | 'เว็บไซต์' | 'ที่อยู่') {
  const match = lines.match(new RegExp(`${label}\\s*:\\s*(.+?)(?=\\s*(?:เบอร์โทรศัพท์|เว็บไซต์|ที่อยู่)\\s*:|$)`));
  return match?.[1]?.trim() || '';
}

function parseNhsoProviderDirectory(html: string, now: () => Date): SmartSearchResult[] {
  const links = Array.from(html.matchAll(/<a\s+href="\/profile\/\?hcode=([0-9]{2,10})"[^>]*class="[^"]*\bgt-result-search-info-name\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi));
  const countMatch = html.match(/พบทั้งหมด\s*(\d+)\s*ผลลัพธ์/);
  const totalResults = countMatch?.[1] || '';
  const inspectedAt = checkedDate(now);

  return links.slice(0, 10).flatMap((link, index) => {
    const hcode = link[1] || '';
    const rawName = plainHtmlFragment(link[2] || '');
    const name = rawName.replace(new RegExp(`^\\(\\s*${hcode}\\s*\\)\\s*`), '').trim();
    const nextLink = links[index + 1];
    const detailsHtml = html.slice(
      (link.index || 0) + link[0].length,
      nextLink?.index || (link.index || 0) + link[0].length + 3_000,
    );
    const details = plainHtmlFragment(detailsHtml);
    const address = findNhsoField(details, 'ที่อยู่');
    const telephone = findNhsoField(details, 'เบอร์โทรศัพท์');
    const website = findNhsoField(details, 'เว็บไซต์');

    if (!hcode || !name) return [];
    return [{
      id: `nhso-provider-${hcode}`,
      title: name,
      category: 'CLINICS' as const,
      productCategoryLabel: 'หน่วยบริการในไดเรกทอรี สปสช.',
      snippet: `พบหน่วยบริการรหัส ${hcode} ในไดเรกทอรีสาธารณะ สปสช.${address ? ` — ${address}` : ''} — โปรดเปิดต้นฉบับเพื่อตรวจรายละเอียดสิทธิและสถานะล่าสุด`,
      source: 'ไดเรกทอรีหน่วยบริการ สำนักงานหลักประกันสุขภาพแห่งชาติ (สปสช.)',
      sourceUrl: `${NHSO_PROVIDER_PROFILE_URL}${encodeURIComponent(hcode)}`,
      publishedDate: inspectedAt,
      confidenceScore: 1,
      status: 'WARNING' as const,
      metadata: {
        'รหัสหน่วยบริการ สปสช.': hcode,
        'ชื่อหน่วยบริการ': name,
        'เบอร์โทรศัพท์': telephone || '-',
        'ที่ตั้ง': address || '-',
        'เว็บไซต์': website || '-',
        ...(totalResults ? { 'ผลลัพธ์ทั้งหมดจาก สปสช.': totalResults } : {}),
        'สถานะการตีความ': 'พบในไดเรกทอรีสาธารณะ สปสช. — ไม่ใช่การรับรองสถานะใบอนุญาตหรือสิทธิบริการ',
        'ตรวจสอบเมื่อ': inspectedAt,
      },
    }];
  });
}

export async function searchOfficialNhsoProviders(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  try {
    const searchUrl = new URL(NHSO_PROVIDER_SEARCH_URL);
    searchUrl.searchParams.set('q', query);
    const response = await fetchWithTimeout(fetchImpl, searchUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': HSS_CLINIC_USER_AGENT,
      },
      cache: 'no-store',
    });
    if (!response.ok) return [nhsoProviderState(query, 'UNAVAILABLE', now)];

    const html = await response.text();
    const results = parseNhsoProviderDirectory(html, now);
    if (results.length > 0) return results;
    if (/พบทั้งหมด\s*0\s*ผลลัพธ์/.test(html)) return [nhsoProviderState(query, 'UNREGISTERED', now)];
    return [nhsoProviderState(query, 'UNAVAILABLE', now)];
  } catch {
    return [nhsoProviderState(query, 'UNAVAILABLE', now)];
  }
}

async function searchOfficialProviderDirectories(
  query: string,
  fetchImpl: SearchFetch,
  now: () => Date,
): Promise<SmartSearchResult[]> {
  const [hssResults, nhsoResults] = await Promise.all([
    searchOfficialHssClinics(query, fetchImpl, now),
    searchOfficialNhsoProviders(query, fetchImpl, now),
  ]);
  const combined = [...hssResults, ...nhsoResults];
  const confirmed = combined.filter((item) => item.status === 'SAFE' || item.status === 'WARNING' || item.status === 'REVOKED');
  return confirmed.length > 0 ? confirmed : combined;
}

export async function searchOfficialHssClinics(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  const modernResults = await searchModernHssClinics(query, fetchImpl, now);
  if (modernResults.some((item) => item.status === 'WARNING' || item.status === 'REVOKED')) return modernResults;

  const directoryAttempts: SmartSearchResult[][] = [];
  for (const submittedQuery of buildOfficialHssClinicQueryVariants(query)) {
    const directoryResults = await searchHssClinicDirectory(submittedQuery, fetchImpl, now);
    directoryAttempts.push(directoryResults);
    if (directoryResults.some((item) => item.status === 'WARNING')) {
      return directoryResults.map((item) => ({
        ...item,
        metadata: {
          ...item.metadata,
          'คำค้นที่ผู้ใช้กรอก': query,
          'รูปแบบคำค้นที่ส่งให้ สบส.': submittedQuery,
          'ปรับคำค้นอัตโนมัติ': submittedQuery === query.trim() ? 'ไม่ใช่' : 'ใช่',
        },
      }));
    }
  }

  const directoryResults = directoryAttempts.flat();
  const modernExplicitlyNotFound = modernResults.length > 0
    && modernResults.every((item) => item.status === 'UNREGISTERED');
  const directoryExplicitlyNotFound = directoryResults.length > 0
    && directoryResults.every((item) => item.status === 'UNREGISTERED');
  if (modernExplicitlyNotFound && directoryExplicitlyNotFound) {
    return [clinicProviderState(query, 'UNREGISTERED', now)];
  }
  return [clinicProviderState(query, 'UNAVAILABLE', now)];
}

export async function searchOfficialHssSpaBusinesses(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  const mode = /^\d{9}-\d{2}$/.test(query) ? 'license' : 'name';
  try {
    let actionId = HSS_SPA_ACTION_ID;
    for (let attempt = 0; attempt < HSS_SPA_MAX_ATTEMPTS; attempt += 1) {
      const result = await requestHssSpaSearch(query, mode, actionId, fetchImpl);
      if (result.response.ok) {
        const payload = parseHssActionPayload(result.body);
        if (!payload) continue;
        const results = (payload.results || [])
          .slice(0, 10)
          .map((row, index) => mapHssSpaResult(row, index, now))
          .filter((row): row is SmartSearchResult => row !== null);
        return payload.found && results.length > 0 ? results : [unverifiedGuidance(query, 'HSS_SPA', now)];
      }

      if (result.response.status === 404 && /server action not found/i.test(result.body)) {
        const currentActionId = await discoverHssSpaActionId(fetchImpl);
        if (currentActionId) actionId = currentActionId;
      }
    }
    return [providerUnavailable(query, 'HSS_SPA', now)];
  } catch {
    return [providerUnavailable(query, 'HSS_SPA', now)];
  }
}

/**
 * Searches the public HSS press-release index. News is presented as a lead for
 * citizen review, never as a finding about the searched business or product.
 */
export async function searchOfficialHssPublicNews(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  try {
    const searchUrl = new URL(HSS_PUBLIC_NEWS_SEARCH_URL);
    searchUrl.searchParams.set('id_form', '1');
    searchUrl.searchParams.set('search', query);
    const response = await fetchWithTimeout(fetchImpl, searchUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': HSS_CLINIC_USER_AGENT },
      cache: 'no-store',
    });
    if (!response.ok) return [];

    const html = (await response.text()).replace(/<!--[\s\S]*?-->/g, '');
    const entries = Array.from(html.matchAll(
      /<B[^>]*>\s*<A\s+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>\s*<\/B><br>([\s\S]*?)<B>\s*\[ลงประกาศโดย\s*:\s*([\s\S]*?)\s*วันที่\s*:\s*([^\]]+)\]/gi,
    ));
    const inspectedAt = checkedDate(now);
    return entries.slice(0, 5).flatMap((entry, index) => {
      const title = compactHtmlText(entry[2], 240);
      const summary = compactHtmlText(entry[3], 650);
      const sourceUrl = safeHttpsUrl(new URL(entry[1], HSS_PUBLIC_NEWS_SEARCH_URL).toString(), new Set(['hss.moph.go.th']));
      if (!title || !sourceUrl) return [];
      return [{
        id: `hss-public-news-${encodeURIComponent(`${title}-${index}`).slice(0, 100)}`,
        title,
        category: 'FRAUD_ALERTS' as const,
        productCategoryLabel: 'ข่าวประชาสัมพันธ์/ประกาศจากหน่วยงาน — ไม่ใช่ผลรับรอง',
        snippet: summary || `พบข่าวประชาสัมพันธ์ที่เกี่ยวข้องกับ “${query}”`,
        source: 'กรมสนับสนุนบริการสุขภาพ (สบส.) — ข่าวประชาสัมพันธ์',
        sourceUrl,
        publishedDate: compactHtmlText(entry[5], 80) || inspectedAt,
        confidenceScore: 1,
        status: /เตือนภัย|อันตราย|ห้าม|ผิดกฎหมาย|หลอกลวง|มิจฉาชีพ/i.test(`${title} ${summary}`) ? 'WARNING' : 'SAFE',
        metadata: {
          'ประเภทข้อมูล': 'ข่าวประชาสัมพันธ์จาก สบส.',
          'ผู้เผยแพร่': compactHtmlText(entry[4], 120) || 'กรมสนับสนุนบริการสุขภาพ (สบส.)',
          'คำค้น': query,
          'ข้อควรทราบ': 'ข่าวที่เกี่ยวข้องไม่ใช่ข้อยืนยันว่ารายการหรือสถานที่ที่ค้นหากระทำผิด',
          'ตรวจสอบเมื่อ': inspectedAt,
        },
      }];
    });
  } catch {
    return [];
  }
}

/** The FDA's public media API used by oryor.com; only current public entries are read. */
export async function searchOfficialOryorNews(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  try {
    const response = await fetchWithTimeout(fetchImpl, ORYOR_NEWS_API_URL, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Authorization': 'keeneye' },
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const payload: unknown = await response.json();
    const rows = payload && typeof payload === 'object' && !Array.isArray(payload)
      && Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: Array<Record<string, unknown>> }).data
      : [];
    const normalizedQuery = query.toLocaleLowerCase('th');
    const inspectedAt = checkedDate(now);
    return rows.flatMap((row, index) => {
      const title = compactHtmlText(text(row.title), 240);
      const summary = compactHtmlText(text(row.shortDescription), 650);
      if (!title || !`${title} ${summary}`.toLocaleLowerCase('th').includes(normalizedQuery)) return [];
      const table = text(row._table_name);
      const id = text(row.id);
      const sourceUrl = table && id
        ? safeHttpsUrl(`https://oryor.com/media/newsUpdate/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, new Set(['oryor.com']))
        : ORYOR_NEWS_DIRECTORY_URL;
      return [{
        id: `oryor-news-${encodeURIComponent(`${table}-${id || index}`).slice(0, 100)}`,
        title,
        category: 'FRAUD_ALERTS' as const,
        productCategoryLabel: 'ข่าว/ประกาศจาก อย. — ไม่ใช่ผลรับรอง',
        snippet: summary || `พบข่าวที่เกี่ยวข้องกับ “${query}”`,
        source: 'สำนักงานคณะกรรมการอาหารและยา (อย.) — ข่าวและประกาศ',
        sourceUrl,
        publishedDate: text(row.publishDate) || inspectedAt,
        confidenceScore: 1,
        status: /เตือนภัย|อันตราย|ห้าม|เรียกคืน|ปลอม|หลอกลวง/i.test(`${title} ${summary}`) ? 'WARNING' as const : 'SAFE' as const,
        metadata: {
          'ประเภทข้อมูล': 'ข่าวหรือประกาศจาก อย.',
          'คำค้น': query,
          'ข้อควรทราบ': 'ข่าวที่เกี่ยวข้องไม่ใช่ข้อยืนยันว่ารายการหรือสถานที่ที่ค้นหากระทำผิด',
          'ตรวจสอบเมื่อ': inspectedAt,
        },
      }];
    }).slice(0, 5);
  } catch {
    return [];
  }
}

function normalizeOptions(searchDbOrOptions: boolean | ResolveSearchOptions): Required<Omit<ResolveSearchOptions, 'fetchImpl' | 'now'>> & Pick<ResolveSearchOptions, 'fetchImpl' | 'now'> {
  if (typeof searchDbOrOptions === 'boolean') {
    return {
      category: 'ALL',
      searchDb: searchDbOrOptions,
      searchOfficial: searchDbOrOptions,
      fetchImpl: undefined,
      now: undefined,
    };
  }
  return {
    category: searchDbOrOptions.category || 'ALL',
    searchDb: searchDbOrOptions.searchDb ?? true,
    searchOfficial: searchDbOrOptions.searchOfficial ?? true,
    fetchImpl: searchDbOrOptions.fetchImpl,
    now: searchDbOrOptions.now,
  };
}

async function searchTrustedRegistry(
  query: string,
  category: PublicSearchCategory,
): Promise<SmartSearchResult[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return [];

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.rpc('search_trusted_sources', {
      search_query: query,
      max_results: 10,
    });
    if (error || !Array.isArray(data)) return [];

    const matchCategories = new Set<string>();
    if (category === 'ALL') matchCategories.add('ALL');
    else if (category === 'HEALTH_SERVICES') {
      matchCategories.add('HEALTH_SERVICES');
      matchCategories.add('CLINICS');
      matchCategories.add('MASSAGE_SPA');
    } else {
      matchCategories.add(category);
    }
    return mapTrustedSourceRows(data)
      .filter((item) => matchCategories.has('ALL') || matchCategories.has(item.category));
  } catch {
    return [];
  }
}

export async function resolveMultiChannelSearch(
  rawQuery: string,
  searchDbOrOptions: boolean | ResolveSearchOptions = true,
): Promise<SmartSearchResult[]> {
  const query = rawQuery.trim();
  const options = normalizeOptions(searchDbOrOptions);
  const now = options.now || (() => new Date());
  const fetchImpl = options.fetchImpl || fetch;
  const officialSource = selectOfficialSource(query, options.category);
  let officialFallback: SmartSearchResult[] = [];

  if (options.searchOfficial && officialSource !== 'NONE') {
    let officialResults: SmartSearchResult[];
    if (officialSource === 'HSS_CLINIC_AND_NHSO') {
      officialResults = await searchOfficialProviderDirectories(query, fetchImpl, now);
    } else if (officialSource === 'HSS_SPA') {
      officialResults = await searchOfficialHssSpaBusinesses(query, fetchImpl, now);
    } else if (officialSource === 'HSS_BOTH_AND_NHSO') {
      const [clinicResults, spaResults] = await Promise.all([
        searchOfficialProviderDirectories(query, fetchImpl, now),
        searchOfficialHssSpaBusinesses(query, fetchImpl, now),
      ]);
      const confirmed = [...clinicResults, ...spaResults]
        .filter((item) => item.status === 'SAFE' || item.status === 'WARNING' || item.status === 'REVOKED');
      if (confirmed.length > 0) return confirmed;
      officialResults = [...clinicResults, ...spaResults];
    } else if (officialSource === 'ALL_REGISTRIES') {
      const [fdaResults, clinicResults, spaResults] = await Promise.all([
        searchOfficialFdaProducts(query, fetchImpl, now),
        searchOfficialProviderDirectories(query, fetchImpl, now),
        searchOfficialHssSpaBusinesses(query, fetchImpl, now),
      ]);
      const confirmed = [...fdaResults, ...clinicResults, ...spaResults]
        .filter((item) => item.status === 'SAFE' || item.status === 'WARNING' || item.status === 'REVOKED');
      if (confirmed.length > 0) return confirmed;
      officialResults = [...fdaResults, ...clinicResults, ...spaResults];
    } else {
      officialResults = await searchOfficialFdaProducts(query, fetchImpl, now);
    }
    if (officialResults.some((item) => item.status === 'SAFE' || item.status === 'WARNING' || item.status === 'REVOKED')) {
      return officialResults;
    }
    officialFallback = officialResults;
  }

  if (options.searchDb) {
    const verified = await searchTrustedRegistry(query, options.category);
    if (verified.length > 0) return verified;
  }

  if (officialFallback.length > 0) return officialFallback;
  const fallbackSource = options.category === 'CLINICS' ? 'HSS_CLINIC'
    : options.category === 'MASSAGE_SPA' || options.category === 'HEALTH_SERVICES' ? 'HSS_SPA'
    : 'INTERNAL';
  return [unverifiedGuidance(query, fallbackSource, now)];
}
