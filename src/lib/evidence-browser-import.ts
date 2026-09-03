'use client';

import type { EvidenceUploadGrant } from './evidence-resumable-upload';
import { uploadEvidenceResumable } from './evidence-resumable-upload';
import { validateFileInBrowser } from './file-validator';

export type ImportedEvidence = {
  id: string;
  sha256: string;
  upload_state: string;
  malware_scan_status: string;
};

function responseMessage(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === 'string') return error.message;
  }
  return fallback;
}

export async function importPdfIntoEvidenceVault(input: {
  caseId: string;
  file: File;
  expectedSha256: string;
  onProgress?: (percentage: number) => void;
}): Promise<ImportedEvidence> {
  return importCapturedEvidenceIntoVault(input);
}

export async function importCapturedEvidenceIntoVault(input: {
  caseId: string;
  file: File;
  expectedSha256: string;
  onProgress?: (percentage: number) => void;
}): Promise<ImportedEvidence> {
  const validation = await validateFileInBrowser(input.file, { onProgress: input.onProgress });
  if (!validation.isValid || !validation.sha256) throw new Error(validation.error || 'ไฟล์ผลค้นไม่ผ่านการตรวจรูปแบบ');
  if (validation.sha256 !== input.expectedSha256) throw new Error('SHA-256 ของไฟล์ผลค้นไม่ตรงกับไฟล์ที่ Recon Companion ส่งกลับ');

  const reserveResponse = await fetch('/api/v1/evidence/uploads', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      case_id: input.caseId,
      filename: input.file.name,
      file_size: input.file.size,
      mime_type: input.file.type,
      sha256: validation.sha256,
    }),
  });
  const reserveBody = await reserveResponse.json().catch(() => null) as { data?: EvidenceUploadGrant } | null;
  if (!reserveResponse.ok || !reserveBody?.data) throw new Error(responseMessage(reserveBody, 'สำรองทะเบียนไฟล์ผลค้นไม่สำเร็จ'));

  const grant = reserveBody.data;
  let objectUploaded = false;
  try {
    await uploadEvidenceResumable({
      file: input.file,
      grant,
      onProgress: (percentage) => input.onProgress?.(percentage),
    });
    objectUploaded = true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const completeResponse = await fetch(`/api/v1/evidence/uploads/${grant.evidence_id}/complete`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const completeBody = await completeResponse.json().catch(() => null) as { data?: Partial<ImportedEvidence> } | null;
      if (completeResponse.ok && completeBody?.data?.id && completeBody.data.sha256 === validation.sha256) {
        return completeBody.data as ImportedEvidence;
      }
      if (completeResponse.status !== 202 || attempt === 3) {
        throw new Error(responseMessage(completeBody, 'ยืนยันไฟล์ผลค้นในคลังหลักฐานไม่สำเร็จ'));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    throw new Error('ยืนยันไฟล์ผลค้นในคลังหลักฐานไม่สำเร็จ');
  }
  catch (error) {
    if (!objectUploaded) {
      await fetch(`/api/v1/evidence/uploads/${grant.evidence_id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      }).catch(() => undefined);
    }
    throw error;
  }
}
