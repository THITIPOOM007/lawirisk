import { z } from 'zod';

export const MAX_EVIDENCE_FILE_BYTES = 200 * 1024 * 1024;

export const evidenceFileTypes = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
} as const;

export const reserveEvidenceUploadSchema = z.object({
  case_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  file_size: z.number().int().min(1).max(MAX_EVIDENCE_FILE_BYTES),
  mime_type: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export function normalizedEvidenceExtension(filename: string): 'pdf' | 'png' | 'jpg' | null {
  const extension = filename.split('.').pop()?.toLowerCase() as keyof typeof evidenceFileTypes | undefined;
  if (!extension || !(extension in evidenceFileTypes)) return null;
  return extension === 'jpeg' ? 'jpg' : extension;
}
export function evidenceMimeMatchesFilename(filename: string, mimeType: string): boolean {
  const extension = filename.split('.').pop()?.toLowerCase() as keyof typeof evidenceFileTypes | undefined;
  return Boolean(extension && extension in evidenceFileTypes && evidenceFileTypes[extension] === mimeType);
}
