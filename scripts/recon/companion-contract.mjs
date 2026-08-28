export const RECON_SOURCES = Object.freeze({
  FDA_SKYNET: Object.freeze({
    key: 'FDA_SKYNET',
    name: 'SKYNET / Privus อย.',
    startUrl: 'https://privus.fda.moph.go.th/FDA_LOGIN2/HOME/SET_STATE?STATE=3',
    secureTransport: true,
    adapterVersion: 'egov-login-2026-08-27',
    services: Object.freeze(['DBD', 'DOPA', 'FDA_PLACE_DRUG']),
  }),
  HSS_OSS: Object.freeze({
    key: 'HSS_OSS',
    name: 'OSS สบส.',
    startUrl: 'http://oss.hss.moph.go.th/auth/login',
    secureTransport: false,
    adapterVersion: 'hss-search-2026-08-28.2',
    services: Object.freeze(['HSS_FACILITY', 'HSS_PROFESSIONAL']),
  }),
  HSS_ESTA2: Object.freeze({
    key: 'HSS_ESTA2',
    name: 'ESTA2 สบส.',
    startUrl: 'https://esta2.hss.moph.go.th/login',
    secureTransport: true,
    adapterVersion: 'esta2-approved-business-2026-08-28.2',
    services: Object.freeze(['HSS_HEALTH_BUSINESS_APPROVED']),
  }),
});

export const HSS_SEARCH_FILTERS = Object.freeze({
  HSS_FACILITY: Object.freeze({
    FACILITY_NAME: 'MedicalName',
    OPERATOR_NAME: 'PermiteeName',
    OPERATOR_ID: 'PermiteeCode',
    MANAGER_NAME: 'ManagerName',
    MANAGER_ID: 'ManagerCode',
    BUSINESS_LICENSE: 'LicenseSp07Code',
    OPERATION_LICENSE: 'LicenseSp19Code',
    PHONE: 'Telphone',
    ADDRESS_NUMBER: 'Address',
  }),
  HSS_PROFESSIONAL: Object.freeze({
    CITIZEN_ID: 'CitizenID',
    PASSPORT: 'PassportNumber',
    PERSON_NAME: 'PersonsName',
    FORMER_NAME: 'PersonsOldName',
    PROFESSIONAL_LICENSE: 'CertificateCode',
    BUSINESS_LICENSE: 'LicenseSp07Code',
    OPERATION_LICENSE: 'LicenseSp19Code',
  }),
});

export function resolveHssSearchFilter(service, field) {
  const serviceFilters = HSS_SEARCH_FILTERS[service];
  const filter = serviceFilters?.[field];
  if (!filter) throw new Error('SEARCH_FIELD_NOT_ALLOWED');
  return filter;
}

export const ESTA2_SEARCH_OPTIONS = Object.freeze({
  HSS_HEALTH_BUSINESS_APPROVED: Object.freeze({
    APPLICANT_NAME: 'ชื่อผู้ยื่นคำร้อง',
    APPLICANT_ID: 'เลขที่บัตรประจำตัวประชาชนผู้ยื่น',
    FACILITY_NAME: 'ชื่อสถานประกอบการ ( ภาษาไทย )',
    FACILITY_NAME_ENGLISH: 'ชื่อสถานประกอบการ ( ภาษาอังกฤษ )',
    LICENSE_NUMBER: 'เลขที่ใบอนุญาต',
  }),
});

export function resolveEsta2SearchOption(service, field) {
  const serviceOptions = ESTA2_SEARCH_OPTIONS[service];
  const option = serviceOptions?.[field];
  if (!option) throw new Error('SEARCH_FIELD_NOT_ALLOWED');
  return option;
}

const BUSINESS_NAME_FALLBACK_FIELDS = new Set([
  'HSS_OSS:HSS_FACILITY:FACILITY_NAME',
  'HSS_ESTA2:HSS_HEALTH_BUSINESS_APPROVED:FACILITY_NAME',
  'HSS_ESTA2:HSS_HEALTH_BUSINESS_APPROVED:FACILITY_NAME_ENGLISH',
]);

const BUSINESS_NAME_NOISE_TOKENS = new Set([
  'ร้าน',
  'สถานประกอบการ',
  'สถานพยาบาล',
  'คลินิก',
  'บริษัท',
  'บริษัทจำกัด',
  'บจก',
  'ห้างหุ้นส่วน',
  'ห้างหุ้นส่วนจำกัด',
  'หจก',
  'นวด',
  'นวดเพื่อสุขภาพ',
  'สปา',
  'สปาเพื่อสุขภาพ',
  'เพื่อสุขภาพ',
  'จำกัด',
  'company',
  'limited',
  'ltd',
  'clinic',
  'spa',
]);

function compactSearchValue(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

/**
 * Builds at most three deterministic, progressively broader searches for
 * reviewed business/facility name fields. Identifiers and person-name fields
 * deliberately remain exact-only to avoid over-collection and false matches.
 */
export function buildLocalSearchCandidates(source, service, field, rawValue) {
  const exact = compactSearchValue(rawValue);
  if (!exact) return [];

  const candidates = [{ value: exact, strategy: 'EXACT' }];
  if (!BUSINESS_NAME_FALLBACK_FIELDS.has(`${source}:${service}:${field}`)) return candidates;

  const tokens = exact.split(' ').filter(Boolean);
  const meaningfulTokens = tokens.filter((token) => !BUSINESS_NAME_NOISE_TOKENS.has(token.toLocaleLowerCase('th-TH')));
  const addCandidate = (value, strategy) => {
    const normalized = compactSearchValue(value);
    if (normalized.length < 2 || candidates.some((candidate) => candidate.value === normalized)) return;
    candidates.push({ value: normalized, strategy });
  };

  if (meaningfulTokens.length > 1) addCandidate(meaningfulTokens.join(' '), 'BUSINESS_CORE');
  if (meaningfulTokens.length > 0) addCandidate(meaningfulTokens[0], 'DISTINCTIVE_TOKEN');
  return candidates.slice(0, 3);
}

function normalizeSearchText(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').toLocaleLowerCase('th-TH').replace(/[\s\-()/.]/g, '')
    : '';
}

/**
 * Allows an empty result set, but never treats a populated, unrelated result
 * table as evidence for a local automatic search. The caller deliberately
 * passes only table-row text, excluding the search input itself.
 */
export function isHssResultBoundToQuery(resultRows, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  const normalizedRows = Array.isArray(resultRows)
    ? resultRows.map(normalizeSearchText).filter(Boolean)
    : [];
  return normalizedRows.length === 0 || normalizedRows.some((row) => row.includes(normalizedQuery));
}

export function parseReconUri(rawUri) {
  const uri = new URL(rawUri);
  if (uri.protocol !== 'lawirisk-recon:') throw new Error('INVALID_RECON_PROTOCOL');
  const action = uri.hostname;
  if (action !== 'launch' && action !== 'setup') throw new Error('INVALID_RECON_ACTION');
  const sourceKey = uri.searchParams.get('source');
  const source = sourceKey ? RECON_SOURCES[sourceKey] : undefined;
  if (!source) throw new Error('SOURCE_NOT_ALLOWED');
  const caseId = uri.searchParams.get('case_id');
  if (caseId && (caseId.length > 100 || /[\r\n\0]/.test(caseId))) throw new Error('INVALID_CASE_ID');
  const service = uri.searchParams.get('service');
  if (service && !source.services.includes(service)) throw new Error('SERVICE_NOT_ALLOWED');
  const jobId = uri.searchParams.get('job_id');
  if (jobId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('INVALID_JOB_ID');
  }
  return {
    action,
    source,
    caseId: caseId || undefined,
    service: service || undefined,
    jobId: jobId || undefined,
    allowInsecureHttp: uri.searchParams.get('allow_insecure_http') === '1',
  };
}

export function assertSourceLaunchAllowed(request) {
  if (!request.source.secureTransport && !request.allowInsecureHttp) {
    throw new Error('INSECURE_HTTP_ACK_REQUIRED');
  }
}

export function safeCompanionMessage(error) {
  const code = error instanceof Error ? error.message : String(error);
  const known = {
    INVALID_RECON_PROTOCOL: 'ลิงก์ Recon Companion ไม่ถูกต้อง',
    INVALID_RECON_ACTION: 'คำสั่ง Recon Companion ไม่ถูกต้อง',
    SOURCE_NOT_ALLOWED: 'แหล่งข้อมูลนี้ไม่อยู่ใน allowlist',
    INVALID_CASE_ID: 'รหัสสำนวนในคำขอไม่ถูกต้อง',
    SERVICE_NOT_ALLOWED: 'บริการย่อยนี้ไม่อยู่ใน allowlist ของแหล่งข้อมูล',
    INVALID_JOB_ID: 'รหัสงานค้นบนเครื่องไม่ถูกต้อง',
    SEARCH_JOB_NOT_FOUND: 'งานค้นหมดอายุหรือถูกใช้งานไปแล้ว กรุณาสั่งค้นใหม่จาก LAW-i-RISK',
    SEARCH_FIELD_NOT_ALLOWED: 'ประเภทคำค้นนี้ไม่ได้รับอนุญาตสำหรับบริการที่เลือก',
    SEARCH_FORM_CHANGED: 'ฟอร์มค้นของระบบต้นทางเปลี่ยนแปลง กรุณาให้ผู้ดูแลตรวจ adapter',
    SEARCH_REQUEST_NOT_RETAINED: 'ระบบต้นทางไม่ยืนยันคำค้นที่ส่งไป จึงไม่บันทึกผลเป็นหลักฐาน',
    SEARCH_RESULT_NOT_BOUND_TO_QUERY: 'ผลลัพธ์จากระบบต้นทางไม่สัมพันธ์กับคำค้น จึงไม่บันทึกผลเป็นหลักฐาน',
    SEARCH_CAPTURE_FAILED: 'ค้นสำเร็จแต่บันทึกผลบนเครื่องไม่สำเร็จ กรุณาส่งออกผลด้วยตนเอง',
    HSS_SERVICE_SWITCH_UNAVAILABLE: 'บัญชี HSS นี้ไม่แสดงเมนูเปลี่ยนไปยังบริการย่อยที่เลือก',
    HSS_SERVICE_SWITCH_FAILED: 'เปิดบริการย่อย HSS ที่เลือกไม่สำเร็จ โปรดตรวจสิทธิ์ของบัญชีในหน้าต่างต้นทาง',
    HSS_SERVICE_PAGE_FAILED: 'บริการย่อย HSS ไม่ยอมเปิดหน้ารายการที่กำหนด',
    ESTA2_LOGIN_FAILED: 'เข้าสู่ ESTA2 ไม่สำเร็จ โปรดตรวจบัญชีหรือข้อความจากระบบต้นทาง',
    ESTA2_SERVICE_PAGE_FAILED: 'ESTA2 ไม่ยอมเปิดหน้าสถานประกอบการที่ได้รับอนุญาต',
    INSECURE_HTTP_ACK_REQUIRED: 'HSS ใช้ HTTP ต้องยืนยันความเสี่ยงจากหน้า LAW-i-RISK ก่อนทุกครั้ง',
    CREDENTIAL_NOT_CONFIGURED: 'ยังไม่ได้ตั้งบัญชีสำหรับแหล่งข้อมูลนี้',
  };
  return known[code] || 'Recon Companion ทำงานไม่สำเร็จ โปรดตรวจ adapter และหน้าล็อกอิน';
}
