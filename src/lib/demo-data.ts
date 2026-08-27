// Stateful Mock Database for EvidenceVerse National Case Intelligence (Omnichannel & Demo Mode)

import type { StaffRole } from '@/lib/roles';

export interface Case {
  id: string;
  number: string;
  title: string;
  description: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'CLOSED';
  jurisdiction_region?: string;
  jurisdiction_agency?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EvidenceFile {
  id: string;
  case_id: string;
  filename: string;
  file_path?: string;
  file_size: number;
  mime_type: string;
  sha256: string;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  upload_state?: 'RESERVED' | 'STORED' | 'FAILED';
  malware_scan_status?: 'PENDING' | 'CLEAN' | 'NOT_SCANNED' | 'INFECTED' | 'UNAVAILABLE' | 'ERROR';
  created_by: string | null;
  created_at: string;
}

export interface ExtractedEntity {
  id: string;
  case_id: string;
  type: 'PERSON' | 'ORGANIZATION' | 'PHONE' | 'EMAIL' | 'BANK_ACCOUNT' | 'CITIZEN_ID' | 'LOCATION';
  value: string;
  created_at: string;
}

export interface EntityMention {
  id: string;
  entity_id: string;
  filename: string;
  page_number: number;
  snippet: string;
  confidence: number;
}

export interface EntityRelationship {
  id: string;
  case_id: string;
  source_entity_id: string;
  target_entity_id: string;
  type: string;
  status: 'PROPOSED' | 'VERIFIED' | 'REJECTED';
  verified_by?: string;
  created_at: string;
}

export interface RelationshipReference {
  id: string;
  relationship_id: string;
  evidence_id: string;
  page_number: number;
  quote: string;
}

export interface MatchCandidate {
  id: string;
  source_case_id: string;
  target_case_id: string;
  entity_id: string;
  target_entity_id?: string;
  entity_type: string;
  entity_value: string;
  confidence: number;
  status: 'PENDING' | 'VERIFIED' | 'DISMISSED';
  reviewed_by?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  profile_name: string;
  action: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface UserSettings {
  language: string;
  theme: 'dark' | 'light';
  autoExtraction: boolean;
  confidenceThreshold: number;
}

// User Profiles supporting National & Case Roles
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  agency?: string;
}

// Omnichannel Intake Interfaces
export interface IntakeChannel {
  id: string;
  name: string;
  type: 'KOUPREY_PLUS' | 'PARTNER_API' | 'MAIL' | 'MANUAL_PHONE' | 'MANUAL_WALKIN' | 'MANUAL_POST' | 'FILE_IMPORT';
  credentials?: Record<string, unknown>;
}

export interface IntakeEnvelope {
  id: string;
  channel_id: string;
  status: 'RECEIVED' | 'NORMALIZING' | 'TRIAGE_PENDING' | 'PROMOTED' | 'MERGED' | 'NEEDS_INFO' | 'REJECTED' | 'QUARANTINED';
  complainant_mode: 'IDENTIFIED' | 'INCOMPLETE' | 'ANONYMOUS';
  urgency: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  urgency_reason?: string;
  jurisdiction_region?: string;
  jurisdiction_agency?: string;
  malware_scan_status: 'CLEAN' | 'NOT_SCANNED' | 'PENDING' | 'INFECTED' | 'UNAVAILABLE' | 'ERROR';
  privacy_risk_status: 'PENDING' | 'LOW' | 'MEDIUM' | 'HIGH';
  idempotency_key?: string;
  created_at: string;
  updated_at: string;
}

export interface IntakeMessage {
  id: string;
  envelope_id: string;
  headers?: Record<string, string>;
  raw_payload: string;
  message_id?: string;
}

export interface IntakeAttachment {
  id: string;
  envelope_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  sha256: string;
  storage_path: string;
  malware_scan_status: 'PENDING' | 'CLEAN' | 'NOT_SCANNED' | 'INFECTED' | 'UNAVAILABLE' | 'ERROR';
  malware_scan_details?: string;
}

export interface IntakeParticipant {
  id: string;
  envelope_id: string;
  role: 'SENDER' | 'COMPLAINANT' | 'WITNESS' | 'ACCUSED';
  name?: string;
  email?: string;
  phone?: string;
  citizen_id?: string;
  address?: string;
  metadata?: Record<string, unknown>;
}

export interface IntakeDuplicateCandidate {
  id: string;
  source_envelope_id: string;
  target_envelope_id?: string;
  target_case_id?: string;
  duplicate_score: number;
  matching_signals: {
    phone?: boolean;
    email?: boolean;
    hash?: string[];
    name_similarity?: boolean;
    license_number?: boolean;
  };
}

export interface TriageDecision {
  id: string;
  envelope_id: string;
  action: 'CREATE_CASE' | 'MERGE_INTAKE' | 'REQUEST_MORE_INFO' | 'ROUTE' | 'REJECT_SPAM';
  reason: string;
  destination_case_id?: string;
  destination_agency?: string;
  created_by: string;
  created_at: string;
}

// Initial Mock Data Setup
export const INITIAL_USERS: UserProfile[] = [
  { id: 'user-1', email: 'admin@evidenceverse.go.th', name: 'พล.ต.ต. สุรศักดิ์ (Admin)', role: 'ADMIN', agency: 'CENTRAL' },
  { id: 'user-2', email: 'investigator@evidenceverse.go.th', name: 'ร.ต.อ. สมชาย (Investigator)', role: 'INVESTIGATOR', agency: 'HEALTH_REGION_1' },
  { id: 'user-3', email: 'reviewer@evidenceverse.go.th', name: 'นางสาวจิราภรณ์ (Reviewer)', role: 'REVIEWER', agency: 'CENTRAL' },
  { id: 'user-4', email: 'viewer@evidenceverse.go.th', name: 'เจ้าหน้าที่สังเกตการณ์', role: 'VIEWER', agency: 'PROVINCE_SISAKET' },
];

export const INITIAL_INTAKE_CHANNELS: IntakeChannel[] = [
  { id: 'ch-kouprey', name: 'Kouprey Plus Webhook', type: 'KOUPREY_PLUS' },
  { id: 'ch-partner', name: 'API หน่วยงานสาธารณสุขจังหวัด', type: 'PARTNER_API' },
  { id: 'ch-email', name: 'อีเมลร้องเรียนกลาง (OAuth2)', type: 'MAIL' },
  { id: 'ch-walkin', name: 'แบบร้องเรียนมาด้วยตนเอง', type: 'MANUAL_WALKIN' },
  { id: 'ch-phone', name: 'บันทึกร้องเรียนทางโทรศัพท์', type: 'MANUAL_PHONE' }
];

export const INITIAL_INTAKE_ENVELOPES: IntakeEnvelope[] = [
  {
    id: 'env-kitima',
    channel_id: 'ch-walkin',
    status: 'TRIAGE_PENDING',
    complainant_mode: 'IDENTIFIED',
    urgency: 'CRITICAL',
    urgency_reason: 'ข้อมูลสังเคราะห์: ร้องเรียนสถานพยาบาลตัวอย่างและมีเหตุผู้ป่วยฉุกเฉิน',
    jurisdiction_region: 'เขตสุขภาพที่ 10',
    jurisdiction_agency: 'สสจ.ศรีสะเกษ',
    malware_scan_status: 'CLEAN',
    privacy_risk_status: 'HIGH',
    created_at: '2026-07-31T00:30:00Z',
    updated_at: '2026-07-31T01:00:00Z'
  },
  {
    id: 'env-1',
    channel_id: 'ch-kouprey',
    status: 'TRIAGE_PENDING',
    complainant_mode: 'IDENTIFIED',
    urgency: 'HIGH',
    urgency_reason: 'พบคลิปโฆษณาจำหน่ายยาและเครื่องมือแพทย์จัดฟันโดยไม่มีใบอนุญาต คาดว่ามีเหยื่อติดเชื้อในช่องปาก อ.ขุขันธ์',
    jurisdiction_region: 'เขตสุขภาพที่ 10',
    jurisdiction_agency: 'สสจ.ศรีสะเกษ',
    malware_scan_status: 'NOT_SCANNED',
    privacy_risk_status: 'MEDIUM',
    created_at: '2026-07-31T01:00:00Z',
    updated_at: '2026-07-31T01:10:00Z'
  },
  {
    id: 'env-2',
    channel_id: 'ch-email',
    status: 'TRIAGE_PENDING',
    complainant_mode: 'ANONYMOUS',
    urgency: 'NORMAL',
    urgency_reason: 'แจ้งเบาะแสน้ำดื่มยี่ห้อ ไอร่า (Aira) ผลิตในพื้นที่ไม่ผ่านเกณฑ์ความสะอาด',
    jurisdiction_region: 'เขตสุขภาพที่ 10',
    jurisdiction_agency: 'สสจ.ศรีสะเกษ',
    malware_scan_status: 'NOT_SCANNED',
    privacy_risk_status: 'LOW',
    created_at: '2026-07-31T02:30:00Z',
    updated_at: '2026-07-31T02:35:00Z'
  },
  {
    id: 'env-3',
    channel_id: 'ch-email',
    status: 'QUARANTINED',
    complainant_mode: 'INCOMPLETE',
    urgency: 'LOW',
    malware_scan_status: 'INFECTED',
    privacy_risk_status: 'HIGH',
    created_at: '2026-07-31T03:00:00Z',
    updated_at: '2026-07-31T03:02:00Z'
  }
];

export const INITIAL_INTAKE_MESSAGES: IntakeMessage[] = [
  {
    id: 'msg-kitima',
    envelope_id: 'env-kitima',
    raw_payload: JSON.stringify({
      topic: 'ข้อมูลสังเคราะห์: ร้องเรียนสถานพยาบาลตัวอย่างและเหตุผู้ป่วยฉุกเฉิน',
      description: 'ข้อมูลสังเคราะห์สำหรับทดสอบ workflow เท่านั้น: ผู้ร้องตัวอย่างแจ้งเหตุเกี่ยวกับสถานประกอบการตัวอย่างในจังหวัดศรีสะเกษและขอให้เจ้าหน้าที่ตรวจสอบข้อเท็จจริง',
      category: 'สถานพยาบาลและวิชาชีพเวชกรรมเถื่อน',
      region: 'ต.ตัวอย่าง อ.เมือง จ.ศรีสะเกษ',
      complainantName: 'ผู้ร้องตัวอย่าง ก',
      complainantContact: '088-1049377',
      accusedName: 'บุคคลตัวอย่าง ก / บุคคลตัวอย่าง ข',
      source: 'แบบคำร้องเรียน สสจ.ศรีสะเกษ'
    })
  },
  {
    id: 'msg-1',
    envelope_id: 'env-1',
    raw_payload: '{"source":"Kouprey Plus","ref_no":"KP-DEMO-001","text":"ข้อมูลสังเคราะห์: ร้องเรียนบริการสุขภาพของบุคคลตัวอย่าง ค ติดต่อเบอร์ 080-000-0000"}'
  },
  {
    id: 'msg-2',
    envelope_id: 'env-2',
    raw_payload: 'Subject: แจ้งน้ำดื่มไม่สะอาด\n\nพบบ้านเลขที่ 32 หมู่ 2 อ.อุทุมพรพิสัย ผลิตน้ำดื่มไอร่าส่งตามร้านชำโดยไม่ขออย.อย่างถูกต้อง รบกวนตรวจสอบด่วน'
  }
];

export const INITIAL_INTAKE_ATTACHMENTS: IntakeAttachment[] = [
  {
    id: 'att-kitima-1',
    envelope_id: 'env-kitima',
    filename: 'แบบคำร้องเรียน_ข้อมูลสังเคราะห์.pdf',
    file_size: 2457600,
    mime_type: 'application/pdf',
    sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    storage_path: '/vault/intake/att-kitima-1.pdf',
    malware_scan_status: 'CLEAN'
  },
  {
    id: 'att-1',
    envelope_id: 'env-1',
    filename: 'advertisement_screenshot.png',
    file_size: 1048576,
    mime_type: 'image/png',
    sha256: '89504E47d32b509ef8c8d6263bb496a718b5774a3db0ffcb4159518e974e4600',
    storage_path: '/vault/intake/att-1.png',
    malware_scan_status: 'NOT_SCANNED'
  },
  {
    id: 'att-2',
    envelope_id: 'env-3',
    filename: 'malicious_invoice.zip',
    file_size: 512000,
    mime_type: 'application/zip',
    sha256: '99e69c10d32b509ef8c8d6263bb496a718b5774a3db0ffcb4159518e974e4633',
    storage_path: '/vault/quarantine/malicious_invoice.zip',
    malware_scan_status: 'INFECTED',
    malware_scan_details: 'Win32.Trojan.Downloader detected'
  }
];

export const INITIAL_INTAKE_PARTICIPANTS: IntakeParticipant[] = [
  {
    id: 'part-kitima-1',
    envelope_id: 'env-kitima',
    role: 'COMPLAINANT',
    name: 'ผู้ร้องตัวอย่าง ก',
    phone: '088-1049377',
    citizen_id: '1339900023752',
    address: '1 หมู่ที่ 1 ต.ตัวอย่าง อ.เมืองศรีสะเกษ จ.ศรีสะเกษ'
  },
  {
    id: 'part-kitima-2',
    envelope_id: 'env-kitima',
    role: 'ACCUSED',
    name: 'บุคคลตัวอย่าง ก / บุคคลตัวอย่าง ข (สถานพยาบาลตัวอย่าง)',
    phone: '081-9988776',
    citizen_id: '0000000000000',
    address: '99 ม.9 ต.ตัวอย่าง อ.เมือง จ.ศรีสะเกษ 33000'
  },
  {
    id: 'part-1',
    envelope_id: 'env-1',
    role: 'COMPLAINANT',
    name: 'นายอดิสรณ์ อบอุ่น',
    phone: '089-7712345',
    email: 'adisorn@outlook.com'
  },
  {
    id: 'part-2',
    envelope_id: 'env-1',
    role: 'ACCUSED',
    name: 'บุคคลตัวอย่าง ค (บริการสุขภาพตัวอย่าง)',
    phone: '080-000-0000',
    address: '45/2 หมู่ที่ 5 ต.ห้วยเหนือ อ.ขุขันธ์ จ.ศรีสะเกษ 33140'
  },
  {
    id: 'part-3',
    envelope_id: 'env-2',
    role: 'ACCUSED',
    name: 'บุคคลตัวอย่าง ง (ผลิตภัณฑ์ตัวอย่าง)',
    phone: '082-1904178',
    address: 'บ้านเลขที่ 32 หมู่ 2 ต.หัวช้าง อ.อุทุมพรพิสัย จ.ศรีสะเกษ'
  }
];

export const INITIAL_DUPLICATE_CANDIDATES: IntakeDuplicateCandidate[] = [
  {
    id: 'dup-1',
    source_envelope_id: 'env-1',
    target_case_id: 'case-1',
    duplicate_score: 0.88,
    matching_signals: {
      phone: true,
      name_similarity: true
    }
  }
];

export const INITIAL_CASES: Case[] = [
  {
    id: 'case-3',
    number: 'ค.789/2569',
    title: 'ข้อมูลสังเคราะห์: ตรวจสอบสถานพยาบาลตัวอย่าง',
    description: 'สำนวนสาธิตสำหรับทดสอบการรับเรื่อง หลักฐาน การตรวจทาน และการสร้างรายงาน โดยไม่อ้างถึงบุคคลหรือสถานประกอบการจริง',
    status: 'ACTIVE',
    jurisdiction_region: 'เขตสุขภาพที่ 10',
    jurisdiction_agency: 'สสจ.ศรีสะเกษ',
    created_by: 'นพ.สสจ. ศรีสะเกษ',
    created_at: '2026-07-31T09:00:00Z',
    updated_at: '2026-07-31T15:00:00Z',
  },
  {
    id: 'case-1',
    number: 'ค.123/2569',
    title: 'คดีบริการจัดฟันแฟชั่นผิดกฎหมาย อ.ขุขันธ์',
    description: 'ข้อมูลสังเคราะห์สำหรับทดสอบ workflow การตรวจบริการสุขภาพและการเชื่อมโยงหลักฐาน',
    status: 'ACTIVE',
    jurisdiction_region: 'เขตสุขภาพที่ 10',
    jurisdiction_agency: 'สสจ.ศรีสะเกษ',
    created_by: 'ร.ต.อ. สมชาย',
    created_at: '2026-07-25T10:00:00Z',
    updated_at: '2026-07-30T14:30:00Z',
  },
  {
    id: 'case-2',
    number: 'ค.456/2569',
    title: 'คดีโรงน้ำดื่มเถื่อน Aira Water',
    description: 'การสืบสวนลักลอบผลิตและจำหน่ายน้ำดื่มบรรจุขวดพลาสติกไม่ปลอดภัยส่งร้านชำในพื้นที่โดยไม่ได้รับอนุญาต',
    status: 'ACTIVE',
    jurisdiction_region: 'เขตสุขภาพที่ 10',
    jurisdiction_agency: 'สสจ.ศรีสะเกษ',
    created_by: 'ร.ต.อ. สมชาย',
    created_at: '2026-07-26T09:00:00Z',
    updated_at: '2026-07-29T11:00:00Z',
  }
];

export const INITIAL_EVIDENCE: EvidenceFile[] = [
  {
    id: 'ev-kitima-1',
    case_id: 'case-3',
    filename: 'แบบคำร้องเรียน_ข้อมูลสังเคราะห์.pdf',
    file_path: '/vault/case-3/แบบคำร้องเรียน_ข้อมูลสังเคราะห์.pdf',
    file_size: 2457600,
    mime_type: 'application/pdf',
    sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    status: 'PROCESSED',
    upload_state: 'STORED',
    malware_scan_status: 'CLEAN',
    created_by: 'นพ.สสจ. ศรีสะเกษ',
    created_at: '2026-07-31T09:15:00Z',
  },
  {
    id: 'ev-1',
    case_id: 'case-1',
    filename: 'fb_ad_screenshot.png',
    file_path: '/vault/case-1/fb_ad_screenshot.png',
    file_size: 1542030,
    mime_type: 'image/png',
    sha256: '89504E47d32b509ef8c8d6263bb496a718b5774a3db0ffcb4159518e974e4600',
    status: 'PROCESSED',
    upload_state: 'STORED',
    // Synthetic demo fixture retained to exercise the legacy CLEAN state.
    malware_scan_status: 'CLEAN',
    created_by: 'ร.ต.อ. สมชาย',
    created_at: '2026-07-25T11:15:00Z',
  }
];

export const INITIAL_ENTITIES: ExtractedEntity[] = [
  { id: 'ent-kitima-1', case_id: 'case-3', type: 'PERSON', value: 'บุคคลตัวอย่าง ก', created_at: '2026-07-31T09:30:00Z' },
  { id: 'ent-kitima-2', case_id: 'case-3', type: 'CITIZEN_ID', value: '0000000000000', created_at: '2026-07-31T09:30:00Z' },
  { id: 'ent-kitima-3', case_id: 'case-3', type: 'LOCATION', value: 'ต.ตัวอย่าง อ.เมือง จ.ศรีสะเกษ', created_at: '2026-07-31T09:30:00Z' },
  { id: 'ent-1', case_id: 'case-1', type: 'PERSON', value: 'บุคคลตัวอย่าง ค', created_at: '2026-07-25T12:00:00Z' },
  { id: 'ent-2', case_id: 'case-1', type: 'PHONE', value: '080-000-0000', created_at: '2026-07-25T12:00:00Z' },
  { id: 'ent-3', case_id: 'case-1', type: 'LOCATION', value: 'อำเภอขุขันธ์ จังหวัดศรีสะเกษ', created_at: '2026-07-25T12:00:00Z' },
  { id: 'ent-4', case_id: 'case-2', type: 'PERSON', value: 'บุคคลตัวอย่าง ง', created_at: '2026-07-26T10:00:00Z' },
  { id: 'ent-5', case_id: 'case-2', type: 'LOCATION', value: 'อำเภออุทุมพรพิสัย จังหวัดศรีสะเกษ', created_at: '2026-07-26T10:00:00Z' }
];

export const INITIAL_MENTIONS: EntityMention[] = [
  { id: 'm-1', entity_id: 'ent-1', filename: 'fb_ad_screenshot.png', page_number: 1, snippet: 'ข้อมูลสังเคราะห์: พบบุคคลตัวอย่าง ค', confidence: 0.98 },
  { id: 'm-2', entity_id: 'ent-2', filename: 'fb_ad_screenshot.png', page_number: 1, snippet: 'ข้อมูลสังเคราะห์: เบอร์ 080-000-0000', confidence: 0.95 }
];

export const INITIAL_RELATIONSHIPS: EntityRelationship[] = [
  {
    id: 'rel-1',
    case_id: 'case-1',
    source_entity_id: 'ent-1',
    target_entity_id: 'ent-2',
    type: 'USES_PHONE',
    status: 'VERIFIED',
    verified_by: 'ร.ต.อ. สมชาย',
    created_at: '2026-07-25T12:30:00Z',
  }
];

export const INITIAL_RELATIONSHIP_REFERENCES: RelationshipReference[] = [
  {
    id: 'ref-1',
    relationship_id: 'rel-1',
    evidence_id: 'ev-1',
    page_number: 1,
    quote: 'ข้อมูลสังเคราะห์: เบอร์ 080-000-0000',
  },
];

export const INITIAL_MATCHES: MatchCandidate[] = [
  {
    id: 'match-1',
    source_case_id: 'case-1',
    target_case_id: 'case-2',
    entity_id: 'ent-3',
    target_entity_id: 'ent-5',
    entity_type: 'LOCATION',
    entity_value: 'ศรีสะเกษ',
    confidence: 0.82,
    status: 'PENDING',
    created_at: '2026-07-26T14:00:00Z',
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    profile_name: 'พล.ต.ต. สุรศักดิ์',
    action: 'CREATE_CASE',
    details: 'สร้างสำนวนคดีสังเคราะห์ ค.789/2569',
    ip_address: '192.168.1.10',
    created_at: '2026-07-31T09:00:00Z',
  }
];

export const INITIAL_SETTINGS: UserSettings = {
  language: 'th',
  theme: 'dark',
  autoExtraction: true,
  confidenceThreshold: 0.75,
};

// Stateful in-memory stores for demo mode
const casesStore: Case[] = [...INITIAL_CASES];
const evidenceStore: EvidenceFile[] = [...INITIAL_EVIDENCE];
const entitiesStore: ExtractedEntity[] = [...INITIAL_ENTITIES];
const relationshipsStore: EntityRelationship[] = [...INITIAL_RELATIONSHIPS];
const matchesStore: MatchCandidate[] = [...INITIAL_MATCHES];
const auditLogsStore: AuditLog[] = [...INITIAL_AUDIT_LOGS];
let settingsStore: UserSettings = { ...INITIAL_SETTINGS };
const intakeEnvelopesStore: IntakeEnvelope[] = [...INITIAL_INTAKE_ENVELOPES];
const intakeMessagesStore: IntakeMessage[] = [...INITIAL_INTAKE_MESSAGES];
const intakeAttachmentsStore: IntakeAttachment[] = [...INITIAL_INTAKE_ATTACHMENTS];
const intakeParticipantsStore: IntakeParticipant[] = [...INITIAL_INTAKE_PARTICIPANTS];
const duplicateCandidatesStore: IntakeDuplicateCandidate[] = [...INITIAL_DUPLICATE_CANDIDATES];

// Getters and Setters
export function getCases(): Case[] { return casesStore; }
export function saveCase(item: Case): Case {
  const idx = casesStore.findIndex((c) => c.id === item.id);
  if (idx >= 0) casesStore[idx] = item;
  else casesStore.unshift(item);
  return item;
}

export function getEvidence(): EvidenceFile[] { return evidenceStore; }
export function saveEvidence(item: EvidenceFile): EvidenceFile {
  const idx = evidenceStore.findIndex((e) => e.id === item.id);
  if (idx >= 0) evidenceStore[idx] = item;
  else evidenceStore.unshift(item);
  return item;
}

export function getEntities(): ExtractedEntity[] { return entitiesStore; }
export function saveEntity(item: ExtractedEntity): ExtractedEntity {
  const idx = entitiesStore.findIndex((e) => e.id === item.id);
  if (idx >= 0) entitiesStore[idx] = item;
  else entitiesStore.unshift(item);
  return item;
}

export function getRelationships(): EntityRelationship[] { return relationshipsStore; }
export function saveRelationship(item: EntityRelationship): EntityRelationship {
  const idx = relationshipsStore.findIndex((r) => r.id === item.id);
  if (idx >= 0) relationshipsStore[idx] = item;
  else relationshipsStore.unshift(item);
  return item;
}

export function getMatches(): MatchCandidate[] { return matchesStore; }
export function saveMatch(item: MatchCandidate): MatchCandidate {
  const idx = matchesStore.findIndex((m) => m.id === item.id);
  if (idx >= 0) matchesStore[idx] = item;
  else matchesStore.unshift(item);
  return item;
}

export function getAuditLogs(): AuditLog[] { return auditLogsStore; }
const triageDecisionsStore: TriageDecision[] = [];

export function saveTriageDecision(item: TriageDecision): TriageDecision {
  triageDecisionsStore.unshift(item);
  return item;
}

export function updateIntakeEnvelopeStatus(
  id: string,
  status: IntakeEnvelope['status'],
  urgency_reason?: string,
): IntakeEnvelope | null {
  const idx = intakeEnvelopesStore.findIndex((e) => e.id === id);
  if (idx >= 0) {
    intakeEnvelopesStore[idx] = {
      ...intakeEnvelopesStore[idx],
      status,
      ...(urgency_reason ? { urgency_reason } : {}),
      updated_at: new Date().toISOString(),
    };
    return intakeEnvelopesStore[idx];
  }
  return null;
}

export function addAuditLog(
  profileOrEntry:
    | string
    | {
        action: string;
        details: string;
        profile_name?: string;
        ip_address?: string;
      },
  actionParam?: string,
  detailsParam?: string,
): AuditLog {
  let profile_name = 'เจ้าหน้าที่ สสจ.';
  let action = 'AUDIT';
  let details = '';
  let ip_address = '127.0.0.1';

  if (typeof profileOrEntry === 'string') {
    profile_name = profileOrEntry;
    action = actionParam || 'AUDIT';
    details = detailsParam || '';
  } else if (typeof profileOrEntry === 'object' && profileOrEntry !== null) {
    profile_name = profileOrEntry.profile_name || 'เจ้าหน้าที่ สสจ.';
    action = profileOrEntry.action;
    details = profileOrEntry.details;
    ip_address = profileOrEntry.ip_address || '127.0.0.1';
  }

  const log: AuditLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    profile_name,
    action,
    details,
    ip_address,
    created_at: new Date().toISOString(),
  };
  auditLogsStore.unshift(log);
  return log;
}

export function getSettings(): UserSettings { return settingsStore; }
export function saveSettings(item: UserSettings): UserSettings {
  settingsStore = { ...item };
  return settingsStore;
}

export function getIntakeEnvelopes(): IntakeEnvelope[] { return intakeEnvelopesStore; }
export function saveIntakeEnvelope(item: IntakeEnvelope): IntakeEnvelope {
  const idx = intakeEnvelopesStore.findIndex((e) => e.id === item.id);
  if (idx >= 0) intakeEnvelopesStore[idx] = item;
  else intakeEnvelopesStore.unshift(item);
  return item;
}

export function getIntakeMessages(): IntakeMessage[] { return intakeMessagesStore; }
export function saveIntakeMessage(item: IntakeMessage): IntakeMessage {
  const idx = intakeMessagesStore.findIndex((m) => m.id === item.id);
  if (idx >= 0) intakeMessagesStore[idx] = item;
  else intakeMessagesStore.unshift(item);
  return item;
}

export function getIntakeAttachments(): IntakeAttachment[] { return intakeAttachmentsStore; }
export function saveIntakeAttachment(item: IntakeAttachment): IntakeAttachment {
  const idx = intakeAttachmentsStore.findIndex((a) => a.id === item.id);
  if (idx >= 0) intakeAttachmentsStore[idx] = item;
  else intakeAttachmentsStore.unshift(item);
  return item;
}

export function getIntakeParticipants(): IntakeParticipant[] { return intakeParticipantsStore; }
export function saveIntakeParticipant(item: IntakeParticipant): IntakeParticipant {
  const idx = intakeParticipantsStore.findIndex((p) => p.id === item.id);
  if (idx >= 0) intakeParticipantsStore[idx] = item;
  else intakeParticipantsStore.unshift(item);
  return item;
}

export function getDuplicateCandidates(): IntakeDuplicateCandidate[] { return duplicateCandidatesStore; }
export function saveDuplicateCandidate(item: IntakeDuplicateCandidate): IntakeDuplicateCandidate {
  const idx = duplicateCandidatesStore.findIndex((d) => d.id === item.id);
  if (idx >= 0) duplicateCandidatesStore[idx] = item;
  else duplicateCandidatesStore.unshift(item);
  return item;
}
