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
  malware_scan_status?: 'PENDING' | 'CLEAN' | 'INFECTED' | 'UNAVAILABLE' | 'ERROR';
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
  malware_scan_status: 'CLEAN' | 'PENDING' | 'INFECTED' | 'UNAVAILABLE' | 'ERROR';
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
  malware_scan_status: 'PENDING' | 'CLEAN' | 'INFECTED';
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
    id: 'env-1',
    channel_id: 'ch-kouprey',
    status: 'TRIAGE_PENDING',
    complainant_mode: 'IDENTIFIED',
    urgency: 'HIGH',
    urgency_reason: 'พบคลิปโฆษณาจำหน่ายยาและเครื่องมือแพทย์จัดฟันโดยไม่มีใบอนุญาต คาดว่ามีเหยื่อติดเชื้อในช่องปาก',
    jurisdiction_region: 'เขตสุขภาพที่ 10',
    jurisdiction_agency: 'สสจ.ศรีสะเกษ',
    malware_scan_status: 'CLEAN',
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
    malware_scan_status: 'CLEAN',
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
    id: 'msg-1',
    envelope_id: 'env-1',
    raw_payload: '{"source":"Kouprey Plus","ref_no":"KP-90223","text":"ร้องเรียนการเปิดคลินิกจัดฟันเถื่อนชื่อ ร้านเมย์ ทันตกรรม โดยโฆษณาในเพจ Sisaket ศรีสะเกษทูเดย์ ติดต่อเบอร์โทร 062-4149791"}'
  },
  {
    id: 'msg-2',
    envelope_id: 'env-2',
    raw_payload: 'Subject: แจ้งน้ำดื่มไม่สะอาด\n\nพบบ้านเลขที่ 32 หมู่ 2 อ.อุทุมพรพิสัย ผลิตน้ำดื่มไอร่าส่งตามร้านชำโดยไม่ขออย.อย่างถูกต้อง รบกวนตรวจสอบด่วน'
  }
];

export const INITIAL_INTAKE_ATTACHMENTS: IntakeAttachment[] = [
  {
    id: 'att-1',
    envelope_id: 'env-1',
    filename: 'advertisement_screenshot.png',
    file_size: 1048576,
    mime_type: 'image/png',
    sha256: '89504E47d32b509ef8c8d6263bb496a718b5774a3db0ffcb4159518e974e4600',
    storage_path: '/vault/intake/att-1.png',
    malware_scan_status: 'CLEAN'
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
    name: 'นางสาวปนัดดา คำนนท์ (คลินิกจัดฟันเถื่อน ร้านเมย์)',
    phone: '062-4149791',
    address: 'บ้านเลขที่ 192 หมู่ 3 ต.กกแดง อ.นิคมคำสร้อย จ.มุกดาหาร'
  },
  {
    id: 'part-3',
    envelope_id: 'env-2',
    role: 'ACCUSED',
    name: 'นางสาววันชนิกา สุบิน (โรงน้ำดื่มวีร่า/ไอร่า วอเตอร์)',
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
    id: 'case-1',
    number: 'ค.123/2569',
    title: 'คดีบริการจัดฟันแฟชั่นผิดกฎหมาย Sisaket',
    description: 'สืบสวนเครือข่ายลักลอบให้บริการจัดฟันแฟชั่นและจำหน่ายเครื่องมือคงสภาพฟัน (รีเทนเนอร์) โดยไม่ใช่ทันตแพทย์ผ่านสื่อออนไลน์',
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
    id: 'ev-1',
    case_id: 'case-1',
    filename: 'fb_ad_screenshot.png',
    file_path: '/vault/case-1/fb_ad_screenshot.png',
    file_size: 1542030,
    mime_type: 'image/png',
    sha256: '89504E47d32b509ef8c8d6263bb496a718b5774a3db0ffcb4159518e974e4600',
    status: 'PROCESSED',
    created_by: 'ร.ต.อ. สมชาย',
    created_at: '2026-07-25T11:15:00Z',
  }
];

export const INITIAL_ENTITIES: ExtractedEntity[] = [
  { id: 'ent-1', case_id: 'case-1', type: 'PERSON', value: 'นางสาวปนัดดา คำนนท์', created_at: '2026-07-25T12:00:00Z' },
  { id: 'ent-2', case_id: 'case-1', type: 'PHONE', value: '062-4149791', created_at: '2026-07-25T12:00:00Z' },
  { id: 'ent-3', case_id: 'case-1', type: 'LOCATION', value: 'อำเภอขุขันธ์ จังหวัดศรีสะเกษ', created_at: '2026-07-25T12:00:00Z' },
  { id: 'ent-4', case_id: 'case-2', type: 'PERSON', value: 'นางสาววันชนิกา สุบิน', created_at: '2026-07-26T10:00:00Z' },
  { id: 'ent-5', case_id: 'case-2', type: 'LOCATION', value: 'อำเภออุทุมพรพิสัย จังหวัดศรีสะเกษ', created_at: '2026-07-26T10:00:00Z' }
];

export const INITIAL_MENTIONS: EntityMention[] = [
  { id: 'm-1', entity_id: 'ent-1', filename: 'fb_ad_screenshot.png', page_number: 1, snippet: 'ตรวจพบชื่อโอนเงินคิวมัดจำ นางสาวปนัดดา คำนนท์', confidence: 0.98 },
  { id: 'm-2', entity_id: 'ent-2', filename: 'fb_ad_screenshot.png', page_number: 1, snippet: 'เบอร์ติดต่อปักหมุด 062-4149791', confidence: 0.95 }
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
    quote: 'เบอร์ติดต่อปักหมุด 062-4149791',
  },
];

export const INITIAL_MATCHES: MatchCandidate[] = [
  {
    id: 'match-1',
    source_case_id: 'case-1',
    target_case_id: 'case-2',
    entity_id: 'ent-3',
    entity_type: 'LOCATION',
    entity_value: 'จังหวัดศรีสะเกษ',
    confidence: 0.92,
    status: 'PENDING',
    created_at: '2026-07-26T12:00:00Z',
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud-1',
    profile_name: 'ร.ต.อ. สมชาย',
    action: 'CASE_CREATE',
    details: 'สร้างคดีจัดฟันเถื่อน Sisaket (ค.123/2569)',
    ip_address: '192.168.1.100',
    created_at: '2026-07-25T10:00:00Z',
  }
];

// Helper to interact with Local Storage in Browser
const isClient = typeof window !== 'undefined';

function getStored<T>(key: string, fallback: T): T {
  if (!isClient) return fallback;
  const stored = localStorage.getItem(`ev_${key}`);
  if (stored) {
    try { return JSON.parse(stored); } catch { return fallback; }
  }
  return fallback;
}

function setStored<T>(key: string, value: T): void {
  if (isClient) {
    localStorage.setItem(`ev_${key}`, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('ev-data-change', { detail: { key } }));
  }
}

// In-Memory Fallbacks for server-rendered endpoints in Demo Mode
let inMemoryCases = [...INITIAL_CASES];
let inMemoryEvidence = [...INITIAL_EVIDENCE];
let inMemoryEntities = [...INITIAL_ENTITIES];
let inMemoryMentions = [...INITIAL_MENTIONS];
let inMemoryRelationships = [...INITIAL_RELATIONSHIPS];
let inMemoryMatches = [...INITIAL_MATCHES];
let inMemoryAuditLogs = [...INITIAL_AUDIT_LOGS];

// New Intake state fallbacks
let inMemoryEnvelopes = [...INITIAL_INTAKE_ENVELOPES];
let inMemoryMessages = [...INITIAL_INTAKE_MESSAGES];
let inMemoryAttachments = [...INITIAL_INTAKE_ATTACHMENTS];
let inMemoryParticipants = [...INITIAL_INTAKE_PARTICIPANTS];
let inMemoryDuplicates = [...INITIAL_DUPLICATE_CANDIDATES];
let inMemoryTriageDecisions: TriageDecision[] = [];

// Getters & Setters
export const getCases = (): Case[] => getStored('cases', inMemoryCases);
export const saveCase = (c: Case) => {
  const cases = getCases();
  cases.push(c);
  setStored('cases', cases);
  inMemoryCases = cases;
  addAuditLog('ระบบสืบสวน', 'CASE_CREATE', `สร้างสำนวนคดีใหม่: ${c.title} (${c.number})`);
};

export const getEvidence = (): EvidenceFile[] => getStored('evidence', inMemoryEvidence);
export const saveEvidence = (e: EvidenceFile) => {
  const ev = getEvidence();
  ev.push(e);
  setStored('evidence', ev);
  inMemoryEvidence = ev;
  addAuditLog('ระบบสืบสวน', 'EVIDENCE_UPLOAD', `อัปโหลดไฟล์หลักฐาน: ${e.filename}`);
};

export const getEntities = (): ExtractedEntity[] => getStored('entities', inMemoryEntities);
export const saveEntity = (ent: ExtractedEntity) => {
  const entities = getEntities();
  entities.push(ent);
  setStored('entities', entities);
  inMemoryEntities = entities;
};

export const getMentions = (): EntityMention[] => getStored('mentions', inMemoryMentions);
export const saveMention = (m: EntityMention) => {
  const mentions = getMentions();
  mentions.push(m);
  setStored('mentions', mentions);
  inMemoryMentions = mentions;
};

export const getRelationships = (): EntityRelationship[] => getStored('relationships', inMemoryRelationships);
export const verifyRelationship = (id: string, reviewer: string) => {
  const rels = getRelationships();
  const rel = rels.find(r => r.id === id);
  if (rel) {
    rel.status = 'VERIFIED';
    rel.verified_by = reviewer;
    setStored('relationships', rels);
    inMemoryRelationships = rels;
    addAuditLog(reviewer, 'RELATION_VERIFY', `ยืนยันความสัมพันธ์ในคดีรหัส ${rel.case_id}`);
  }
};

export const getMatches = (): MatchCandidate[] => getStored('matches', inMemoryMatches);
export const updateMatchStatus = (id: string, status: 'VERIFIED' | 'DISMISSED', reviewer: string) => {
  const matches = getMatches();
  const match = matches.find(m => m.id === id);
  if (match) {
    match.status = status;
    match.reviewed_by = reviewer;
    setStored('matches', matches);
    inMemoryMatches = matches;
    addAuditLog(reviewer, 'MATCH_REVIEW', `ตรวจสอบความเชื่อมโยง (${status}) สำหรับข้อมูล: ${match.entity_value}`);
  }
};

export const getAuditLogs = (): AuditLog[] => getStored('audit', inMemoryAuditLogs);
export const addAuditLog = (profile: string, action: string, details: string) => {
  const logs = getAuditLogs();
  const newLog: AuditLog = {
    id: `aud-${Date.now()}`,
    profile_name: profile,
    action,
    details,
    ip_address: '127.0.0.1',
    created_at: new Date().toISOString(),
  };
  logs.unshift(newLog);
  setStored('audit', logs);
  inMemoryAuditLogs = logs;
};

// Intake state functions
export const getIntakeEnvelopes = (): IntakeEnvelope[] => getStored('envelopes', inMemoryEnvelopes);
export const saveIntakeEnvelope = (env: IntakeEnvelope) => {
  const envs = getIntakeEnvelopes();
  envs.push(env);
  setStored('envelopes', envs);
  inMemoryEnvelopes = envs;
};

export const updateIntakeEnvelopeStatus = (id: string, status: IntakeEnvelope['status']) => {
  const envs = getIntakeEnvelopes();
  const env = envs.find(e => e.id === id);
  if (env) {
    env.status = status;
    env.updated_at = new Date().toISOString();
    setStored('envelopes', envs);
    inMemoryEnvelopes = envs;
  }
};

export const getIntakeMessages = (): IntakeMessage[] => getStored('messages', inMemoryMessages);
export const saveIntakeMessage = (msg: IntakeMessage) => {
  const msgs = getIntakeMessages();
  msgs.push(msg);
  setStored('messages', msgs);
  inMemoryMessages = msgs;
};

export const getIntakeAttachments = (): IntakeAttachment[] => getStored('attachments', inMemoryAttachments);
export const saveIntakeAttachment = (att: IntakeAttachment) => {
  const atts = getIntakeAttachments();
  atts.push(att);
  setStored('attachments', atts);
  inMemoryAttachments = atts;
};

export const getIntakeParticipants = (): IntakeParticipant[] => getStored('participants', inMemoryParticipants);
export const saveIntakeParticipant = (part: IntakeParticipant) => {
  const parts = getIntakeParticipants();
  parts.push(part);
  setStored('participants', parts);
  inMemoryParticipants = parts;
};

export const getDuplicateCandidates = (): IntakeDuplicateCandidate[] => getStored('duplicates', inMemoryDuplicates);
export const saveDuplicateCandidate = (dup: IntakeDuplicateCandidate) => {
  const dups = getDuplicateCandidates();
  dups.push(dup);
  setStored('duplicates', dups);
  inMemoryDuplicates = dups;
};

export const getTriageDecisions = (): TriageDecision[] => getStored('triage', inMemoryTriageDecisions);
export const saveTriageDecision = (decision: TriageDecision) => {
  const decisions = getTriageDecisions();
  decisions.push(decision);
  setStored('triage', decisions);
  inMemoryTriageDecisions = decisions;

  // Log to audit
  addAuditLog(decision.created_by, 'TRIAGE_ACTION', `เจ้าหน้าที่ทำการคัดกรอง (${decision.action}) บนหมายเลขรับเรื่อง ${decision.envelope_id}`);
};

export const getSettings = (): UserSettings => getStored('settings', {
  language: 'th',
  theme: 'dark',
  autoExtraction: true,
  confidenceThreshold: 0.85
});

export const saveSettings = (s: UserSettings) => {
  setStored('settings', s);
};
