export type NotificationSeverity = 'critical' | 'warning' | 'info' | 'success';
export type NotificationKind = 'intake' | 'review' | 'automation' | 'evidence';

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  summary: string;
  href: string;
  source: string;
  occurred_at: string;
  read: boolean;
};

type IntakeRow = {
  id: string;
  status: string;
  urgency: string;
  jurisdiction_region?: string | null;
  updated_at?: string | null;
  created_at: string;
};

type SuggestionRow = {
  id: string;
  case_id: string;
  entity_type: string;
  confidence?: number | null;
  status: string;
  created_at: string;
};

type AutomationRow = {
  id: string;
  case_id: string;
  status: string;
  error_code?: string | null;
  result_count?: number | null;
  updated_at?: string | null;
  created_at: string;
};

type EvidenceRow = {
  id: string;
  case_id: string;
  filename: string;
  status: string;
  upload_state?: string | null;
  malware_scan_status?: string | null;
  created_at: string;
};

type BuildNotificationInput = {
  intakes?: IntakeRow[];
  suggestions?: SuggestionRow[];
  jobs?: AutomationRow[];
  evidence?: EvidenceRow[];
  readIds?: Iterable<string>;
};

const entityLabels: Record<string, string> = {
  PERSON: 'บุคคล',
  ORGANIZATION: 'นิติบุคคล/องค์กร',
  PHONE: 'หมายเลขโทรศัพท์',
  EMAIL: 'อีเมล',
  BANK_ACCOUNT: 'บัญชีธนาคาร',
  CITIZEN_ID: 'เลขประจำตัวประชาชน',
  LOCATION: 'สถานที่',
};

const priority: Record<NotificationSeverity, number> = {
  critical: 4,
  warning: 3,
  info: 2,
  success: 1,
};

export function buildNotificationItems(input: BuildNotificationInput): NotificationItem[] {
  const readIds = new Set(input.readIds || []);
  const items: NotificationItem[] = [];
  const push = (item: Omit<NotificationItem, 'read'>) => items.push({ ...item, read: readIds.has(item.id) });

  for (const intake of input.intakes || []) {
    if (!['TRIAGE_PENDING', 'QUARANTINED', 'NEEDS_INFO'].includes(intake.status)) continue;
    const occurredAt = intake.updated_at || intake.created_at;
    if (intake.status === 'QUARANTINED') {
      push({
        id: `intake:${intake.id}:quarantined`, kind: 'intake', severity: 'critical',
        title: 'พบรายการรับเรื่องที่ถูกกักกัน',
        summary: 'ต้องตรวจสอบความเสี่ยงของไฟล์และความเป็นส่วนตัวก่อนดำเนินการต่อ',
        href: `/intake/${intake.id}`, source: 'ระบบรับเรื่อง', occurred_at: occurredAt,
      });
      continue;
    }
    if (intake.status === 'NEEDS_INFO') {
      push({
        id: `intake:${intake.id}:needs-info`, kind: 'intake', severity: 'warning',
        title: 'รายการรับเรื่องรอข้อมูลเพิ่มเติม',
        summary: `ยังไม่พร้อมเข้าสู่การคัดกรอง${intake.jurisdiction_region ? ` · ${intake.jurisdiction_region}` : ''}`,
        href: `/intake/${intake.id}`, source: 'ระบบรับเรื่อง', occurred_at: occurredAt,
      });
      continue;
    }
    const urgent = intake.urgency === 'CRITICAL' || intake.urgency === 'HIGH';
    push({
      id: `intake:${intake.id}:triage`, kind: 'intake', severity: urgent ? 'critical' : 'info',
      title: urgent ? 'เบาะแสเร่งด่วนรอคัดกรอง' : 'มีเบาะแสใหม่รอคัดกรอง',
      summary: `ระดับ ${intake.urgency}${intake.jurisdiction_region ? ` · ${intake.jurisdiction_region}` : ''}`,
      href: `/intake/${intake.id}`, source: 'ระบบรับเรื่อง', occurred_at: occurredAt,
    });
  }

  for (const suggestion of input.suggestions || []) {
    if (suggestion.status !== 'SUGGESTED') continue;
    const confidence = suggestion.confidence == null ? 'เจ้าหน้าที่บันทึกเอง' : `ความเชื่อมั่น ${Math.round(suggestion.confidence * 100)}%`;
    push({
      id: `review:${suggestion.id}:suggested`, kind: 'review', severity: 'warning',
      title: 'ข้อเสนอแนะใหม่รอการตรวจทาน',
      summary: `${entityLabels[suggestion.entity_type] || suggestion.entity_type} · ${confidence} · ต้องยืนยันจากหลักฐานต้นทาง`,
      href: '/review', source: 'Human Review Queue', occurred_at: suggestion.created_at,
    });
  }

  for (const job of input.jobs || []) {
    const occurredAt = job.updated_at || job.created_at;
    if (job.status === 'FAILED') {
      push({
        id: `automation:${job.id}:failed`, kind: 'automation', severity: 'critical',
        title: 'งานอัตโนมัติทำงานไม่สำเร็จ',
        summary: `${job.error_code || 'PROVIDER_ERROR'} · เปิดศูนย์งานอัตโนมัติเพื่อตรวจสอบและลองใหม่`,
        href: '/automation', source: 'Automation Engine', occurred_at: occurredAt,
      });
    } else if (job.status === 'SUCCEEDED') {
      push({
        id: `automation:${job.id}:succeeded`, kind: 'automation', severity: 'success',
        title: 'งานอัตโนมัติประมวลผลเสร็จแล้ว',
        summary: `สร้างข้อเสนอแนะ ${job.result_count || 0} รายการ · รอการตรวจทานโดยเจ้าหน้าที่`,
        href: '/review', source: 'Automation Engine', occurred_at: occurredAt,
      });
    }
  }

  for (const file of input.evidence || []) {
    const unsafe = ['INFECTED', 'ERROR', 'UNAVAILABLE'].includes(file.malware_scan_status || '');
    const incomplete = file.upload_state === 'RESERVED' || file.status === 'FAILED';
    if (!unsafe && !incomplete) continue;
    push({
      id: `evidence:${file.id}:${unsafe ? file.malware_scan_status?.toLowerCase() : 'incomplete'}`,
      kind: 'evidence', severity: unsafe ? 'critical' : 'warning',
      title: unsafe ? 'หลักฐานต้องตรวจสอบความปลอดภัย' : 'การนำเข้าหลักฐานยังไม่สมบูรณ์',
      summary: `${file.filename} · ${unsafe ? `สถานะ ${file.malware_scan_status}` : 'กรุณาตรวจสอบหรือนำเข้าใหม่'}`,
      href: '/evidence', source: 'Evidence Vault', occurred_at: file.created_at,
    });
  }

  return items.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1;
    if (priority[a.severity] !== priority[b.severity]) return priority[b.severity] - priority[a.severity];
    return Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
  });
}
