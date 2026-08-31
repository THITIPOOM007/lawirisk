import 'server-only';

import { z } from 'zod';

export type PublicSearchCategory =
  | 'ALL'
  | 'HEALTH_PRODUCTS'
  | 'HEALTH_SERVICES'
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
const HSS_SPA_ACTION_ID = '601acbd1bcff0922b9334e2874b456922f1f6977bd';
const HSS_CLINIC_SOURCE_URL = 'https://privatehospital.hss.moph.go.th/s_view_hospital.php';
const HSS_CLINIC_SEARCH_URL = 'https://privatehospital.hss.moph.go.th/Search_View.php';

const categories = new Set<SmartSearchResult['category']>([
  'HEALTH_PRODUCTS',
  'HEALTH_SERVICES',
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

export function mapTrustedSourceRows(value: unknown): SmartSearchResult[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => mapTrustedRow(row as TrustedSourceRow))
    .filter((row): row is SmartSearchResult => row !== null);
}

function inferCategory(query: string): SmartSearchResult['category'] {
  if (/คลินิก|สถานพยาบาล|ร้าน\s*นวด|นวดเพื่อสุขภาพ|สปา|massage|spa/i.test(query)) return 'HEALTH_SERVICES';
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

function selectOfficialSource(query: string, category: PublicSearchCategory): 'FDA' | 'HSS' | 'NONE' {
  if (category === 'HEALTH_PRODUCTS' || category === 'LICENSES') return 'FDA';
  if (category === 'HEALTH_SERVICES') return 'HSS';
  if (category !== 'ALL') return 'NONE';
  if (isHealthServiceQuery(query)) return 'HSS';
  if (/บริษัท|ห้างหุ้นส่วน|นิติบุคคล|หลอก|โกง|เตือนภัย/.test(query)) return 'NONE';
  return 'FDA';
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

function unverifiedGuidance(
  query: string,
  source: 'FDA' | 'HSS' | 'INTERNAL' = 'FDA',
  now: () => Date = () => new Date(),
): SmartSearchResult {
  const cleanDigits = query.replace(/\D/g, '');
  const looksLikeRegistration = cleanDigits.length >= 10 || /^[1-3][A-N]\s*\d+/i.test(query);
  const isHss = source === 'HSS';
  const inspectedAt = checkedDate(now);
  return {
    id: `unverified-${source.toLowerCase()}-${encodeURIComponent(query).slice(0, 100)}`,
    title: looksLikeRegistration ? 'ไม่พบรายการทะเบียนที่ตรงกัน' : 'ยังไม่พบรายการที่ยืนยันได้',
    category: isHss ? 'HEALTH_SERVICES' : inferCategory(query),
    productCategoryLabel: 'ผลการตรวจสอบจากต้นทาง — ไม่ใช่ผลรับรอง',
    snippet: isHss
      ? `ไม่พบรายการที่ตรงกับ “${query}” ในผลค้นหาที่ระบบเข้าถึงได้จาก สบส. ณ เวลาตรวจสอบ การไม่พบข้อมูลไม่ใช่ข้อยืนยันว่าไม่มีใบอนุญาต`
      : `ยังไม่ได้ยืนยันรายการที่ตรงกับ “${query}” จากคำตอบล่าสุดของฐานข้อมูล อย. ณ เวลาตรวจสอบ โปรดตรวจรูปแบบเลขหรือชื่อผลิตภัณฑ์อีกครั้ง`,
    source: isHss ? 'กรมสนับสนุนบริการสุขภาพ (สบส.)' : 'ศูนย์ตรวจสอบการอนุญาต อย.',
    sourceUrl: isHss ? HSS_SPA_SEARCH_URL : FDA_SOURCE_URL,
    publishedDate: inspectedAt,
    confidenceScore: 0,
    status: 'UNREGISTERED',
    metadata: {
      'คำค้น': query,
      'ตรวจสอบเมื่อ': inspectedAt,
    },
  };
}

function providerUnavailable(query: string, source: 'FDA' | 'HSS', now: () => Date): SmartSearchResult {
  const isHss = source === 'HSS';
  const inspectedAt = checkedDate(now);
  return {
    id: `unavailable-${source.toLowerCase()}-${encodeURIComponent(query).slice(0, 100)}`,
    title: `เชื่อมต่อฐานข้อมูล ${isHss ? 'สบส.' : 'อย.'} ไม่สำเร็จ`,
    category: isHss ? 'HEALTH_SERVICES' : 'HEALTH_PRODUCTS',
    productCategoryLabel: 'แหล่งข้อมูลทางการไม่พร้อมใช้งานชั่วคราว',
    snippet: `ระบบไม่ได้รับคำตอบที่ตรวจสอบได้จากต้นทาง จึงไม่สรุปว่า “พบ” หรือ “ไม่พบ” สำหรับ “${query}” กรุณาลองอีกครั้ง`,
    source: isHss ? 'กรมสนับสนุนบริการสุขภาพ (สบส.)' : 'ศูนย์ตรวจสอบการอนุญาต อย.',
    sourceUrl: isHss ? HSS_SPA_SEARCH_URL : FDA_SOURCE_URL,
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

export async function searchOfficialFdaProducts(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  const model = {
    SEARCH_VALUE: query,
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
  body.set('search_input', query);

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
    return results.length > 0 ? results : [unverifiedGuidance(query, 'FDA', now)];
  } catch {
    return [providerUnavailable(query, 'FDA', now)];
  }
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
    category: 'HEALTH_SERVICES',
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
    category: 'HEALTH_SERVICES',
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

function parseHssClinicHtml(html: string, query: string, now: () => Date): SmartSearchResult[] {
  const lines = htmlToLines(html);
  const totalLine = lines.find((line) => /ค้นพบทั้งหมด|ผลลัพธ์จากการ.*หา/.test(line));
  const totalMatch = totalLine?.match(/([\d,]+)\s*(?:รายการ|แห่ง)/);
  const inspectedAt = checkedDate(now);
  const results: SmartSearchResult[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/เลขที่ใบอนุญาต\s*:/.test(line)) continue;

    const licenseNumber = line.split(':').slice(1).join(':').trim();
    const name = [...lines.slice(Math.max(0, index - 4), index)].reverse().find((candidate) => (
      !/ค้นพบทั้งหมด|ผลลัพธ์|Hospital List|รายชื่อโรงพยาบาล|คำค้นหา/.test(candidate)
      && candidate.length >= 3
    ));
    if (!name) continue;

    const addressLine = lines.slice(index + 1, index + 5).find((candidate) => /(?:ที่ตั้ง|ที่อยู่)\s*:/.test(candidate));
    const phoneLine = lines.slice(index + 1, index + 7).find((candidate) => /(?:เบอร์โทรศัพท์|โทรศัพท์)\s*:/.test(candidate));
    const address = addressLine?.split(':').slice(1).join(':').trim() || '-';
    const phone = phoneLine?.split(':').slice(1).join(':').trim() || '-';
    const idSeed = licenseNumber || `${name}-${index}`;
    results.push({
      id: `hss-clinic-${encodeURIComponent(idSeed).slice(0, 100)}`,
      title: name,
      category: 'HEALTH_SERVICES',
      productCategoryLabel: 'สถานพยาบาล/คลินิก',
      snippet: `${licenseNumber ? `เลขที่ใบอนุญาต ${licenseNumber} — ` : ''}พบชื่อในบัญชีสาธารณะ สบส.${address !== '-' ? ` — ${address}` : ''}`,
      source: 'ทะเบียนสถานพยาบาลเอกชน กรมสนับสนุนบริการสุขภาพ (สบส.)',
      sourceUrl: `${HSS_CLINIC_SEARCH_URL}?q=${encodeURIComponent(query)}&s_data=MedicalName`,
      publishedDate: inspectedAt,
      confidenceScore: 1,
      status: 'WARNING',
      metadata: {
        'ชื่อสถานพยาบาล': name,
        'เลขที่ใบอนุญาต': licenseNumber || 'ต้นทางไม่แสดงในรายการนี้',
        'ที่ตั้ง': address,
        'โทรศัพท์': phone,
        'จำนวนผลจากต้นทาง': totalMatch?.[1] || '-',
        'สถานะการตีความ': 'พบในบัญชีสาธารณะ สบส. — โปรดเปิดต้นฉบับเพื่อตรวจสถานะใบอนุญาตล่าสุด',
        'ตรวจสอบเมื่อ': inspectedAt,
      },
    });
    if (results.length >= 10) break;
  }

  return results;
}

export async function searchOfficialHssClinics(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  const url = new URL(HSS_CLINIC_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('s_data', 'MedicalName');
  try {
    const response = await fetchWithTimeout(fetchImpl, url.toString(), {
      method: 'GET',
      headers: { Accept: 'text/html;charset=UTF-8' },
      cache: 'no-store',
    });
    if (!response.ok) return [clinicProviderState(query, 'UNAVAILABLE', now)];
    const html = await response.text();
    const results = parseHssClinicHtml(html, query, now);
    if (results.length > 0) return results;
    if (/ค้นพบทั้งหมด\s*:\s*0|ไม่พบข้อมูล|ไม่พบรายการ/.test(decodeHtml(html))) {
      return [clinicProviderState(query, 'UNREGISTERED', now)];
    }
    return [clinicProviderState(query, 'UNAVAILABLE', now)];
  } catch {
    return [clinicProviderState(query, 'UNAVAILABLE', now)];
  }
}

export async function searchOfficialHssSpaBusinesses(
  query: string,
  fetchImpl: SearchFetch = fetch,
  now: () => Date = () => new Date(),
): Promise<SmartSearchResult[]> {
  if (isClinicQuery(query)) return searchOfficialHssClinics(query, fetchImpl, now);
  const mode = /^\d{9}-\d{2}$/.test(query) ? 'license' : 'name';
  try {
    const response = await fetchWithTimeout(fetchImpl, HSS_SPA_SEARCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': HSS_SPA_ACTION_ID,
        Origin: 'https://spa-services.hss.moph.go.th',
        Referer: HSS_SPA_SEARCH_URL,
      },
      body: JSON.stringify([mode, query]),
      cache: 'no-store',
    });
    if (!response.ok) return [providerUnavailable(query, 'HSS', now)];
    const payload = parseHssActionPayload(await response.text());
    if (!payload) return [providerUnavailable(query, 'HSS', now)];
    const results = (payload.results || [])
      .slice(0, 10)
      .map((row, index) => mapHssSpaResult(row, index, now))
      .filter((row): row is SmartSearchResult => row !== null);
    return payload.found && results.length > 0 ? results : [unverifiedGuidance(query, 'HSS', now)];
  } catch {
    return [providerUnavailable(query, 'HSS', now)];
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
    const officialResults = officialSource === 'HSS'
      ? await searchOfficialHssSpaBusinesses(query, fetchImpl, now)
      : await searchOfficialFdaProducts(query, fetchImpl, now);
    if (officialResults.some((item) => item.status === 'SAFE' || item.status === 'WARNING' || item.status === 'REVOKED')) {
      return officialResults;
    }
    officialFallback = officialResults;
  }

  if (options.searchDb) {
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
          const verified = mapTrustedSourceRows(data)
            .filter((item) => options.category === 'ALL' || item.category === options.category);
          if (verified.length > 0) return verified;
        }
      } catch {
        // Preserve the explicit official-source state below.
      }
    }
  }

  if (officialFallback.length > 0) return officialFallback;
  return [unverifiedGuidance(query, options.category === 'HEALTH_SERVICES' ? 'HSS' : 'INTERNAL', now)];
}
