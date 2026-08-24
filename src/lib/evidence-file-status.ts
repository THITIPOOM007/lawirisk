export const UNSCANNED_EVIDENCE_STATUS = 'NOT_SCANNED' as const;

export function isEvidenceUsable(uploadState: string | null | undefined, malwareScanStatus: string | null | undefined) {
  return uploadState === 'STORED'
    && (malwareScanStatus === 'CLEAN' || malwareScanStatus === UNSCANNED_EVIDENCE_STATUS);
}

export function evidenceSafetyLabel(malwareScanStatus: string | null | undefined) {
  if (malwareScanStatus === 'CLEAN') return 'สแกนมัลแวร์แล้ว';
  if (malwareScanStatus === UNSCANNED_EVIDENCE_STATUS) return 'ตรวจรูปแบบไฟล์แล้ว · ไม่ได้สแกนมัลแวร์';
  if (malwareScanStatus === 'INFECTED') return 'กักกัน · พบความเสี่ยง';
  return 'ไฟล์ยังไม่พร้อมใช้งาน';
}
