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
    adapterVersion: 'hss-login-2026-08-27',
    services: Object.freeze(['HSS_FACILITY', 'HSS_PROFESSIONAL']),
  }),
});

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
  return {
    action,
    source,
    caseId: caseId || undefined,
    service: service || undefined,
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
    HSS_SERVICE_SWITCH_UNAVAILABLE: 'บัญชี HSS นี้ไม่แสดงเมนูเปลี่ยนไปยังบริการย่อยที่เลือก',
    HSS_SERVICE_SWITCH_FAILED: 'เปิดบริการย่อย HSS ที่เลือกไม่สำเร็จ โปรดตรวจสิทธิ์ของบัญชีในหน้าต่างต้นทาง',
    HSS_SERVICE_PAGE_FAILED: 'บริการย่อย HSS ไม่ยอมเปิดหน้ารายการที่กำหนด',
    INSECURE_HTTP_ACK_REQUIRED: 'HSS ใช้ HTTP ต้องยืนยันความเสี่ยงจากหน้า LAW-i-RISK ก่อนทุกครั้ง',
    CREDENTIAL_NOT_CONFIGURED: 'ยังไม่ได้ตั้งบัญชีสำหรับแหล่งข้อมูลนี้',
  };
  return known[code] || 'Recon Companion ทำงานไม่สำเร็จ โปรดตรวจ adapter และหน้าล็อกอิน';
}
