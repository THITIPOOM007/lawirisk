export const UNSCANNED_EVIDENCE_STATUS = 'NOT_SCANNED' as const;

export function isEvidenceUsable(uploadState: string | null | undefined, malwareScanStatus: string | null | undefined) {
  return uploadState === 'STORED'
    && (malwareScanStatus === 'CLEAN' || malwareScanStatus === UNSCANNED_EVIDENCE_STATUS);
}

export function evidenceSafetyLabel(malwareScanStatus: string | null | undefined) {
  if (malwareScanStatus === 'CLEAN') return 'ตรวจสอบไฟล์แล้ว';
  if (malwareScanStatus === UNSCANNED_EVIDENCE_STATUS) return 'ตรวจชนิดและโครงสร้างไฟล์แล้ว';
  if (malwareScanStatus === 'INFECTED') return 'กักกัน · พบความเสี่ยง';
  return 'ไฟล์ยังไม่พร้อมใช้งาน';
}
