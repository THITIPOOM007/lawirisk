import { sha256 as createSha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { MAX_EVIDENCE_FILE_BYTES } from './evidence-upload-contract';

// Browser-side File Validator (Checks size, extension, SHA-256, and magic bytes)

export { MAX_EVIDENCE_FILE_BYTES } from './evidence-upload-contract';
const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sha256?: string;
  magicBytes?: string;
}

export async function validateFileInBrowser(
  file: File,
  options: { signal?: AbortSignal; onProgress?: (percentage: number) => void } = {},
): Promise<FileValidationResult> {
  // 1. Check size (limit: 200 MiB)
  if (file.size === 0 || file.size > MAX_EVIDENCE_FILE_BYTES) {
    return { isValid: false, error: 'ไฟล์ต้องมีขนาดมากกว่า 0 และไม่เกิน 200 MB' };
  }

  // 2. Check extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
  if (!extension || !allowedExtensions.includes(extension)) {
    return { isValid: false, error: 'รูปแบบไฟล์ไม่รองรับ (รองรับเฉพาะ PDF, PNG, JPG, JPEG เท่านั้น)' };
  }
  const expectedMime = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
  if (file.type !== expectedMime) {
    return { isValid: false, error: 'ชนิด MIME ของไฟล์ไม่ตรงกับนามสกุล' };
  }

  // Read only the header for magic bytes. Hashing is incremental so a 200 MB
  // file does not need a second 200 MB in browser memory.
  let headerBuffer: ArrayBuffer;
  try {
    headerBuffer = await file.slice(0, 4).arrayBuffer();
  } catch {
    return { isValid: false, error: 'ไม่สามารถอ่านเนื้อหาไฟล์ได้' };
  }

  // 3. Compute SHA-256 Hash
  let sha256 = '';
  try {
    const hasher = createSha256.create();
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunk = await file.slice(offset, Math.min(file.size, offset + HASH_CHUNK_BYTES)).arrayBuffer();
      hasher.update(new Uint8Array(chunk));
      options.onProgress?.(Math.min(100, Math.round(((offset + chunk.byteLength) / file.size) * 100)));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    sha256 = bytesToHex(hasher.digest());
  } catch {
    return { isValid: false, error: 'ไม่สามารถคำนวณรหัส Hash (SHA-256) ได้' };
  }

  // 4. Verify Magic Bytes (Signature)
  const headerBytes = new Uint8Array(headerBuffer);
  let magicBytesHex = '';
  headerBytes.forEach(b => {
    magicBytesHex += b.toString(16).toUpperCase().padStart(2, '0');
  });

  // Allowed magic byte prefixes:
  // PDF: 25504446 (%PDF)
  // PNG: 89504E47
  // JPEG/JPG: FFD8FF (starts with FFD8FF)
  const isPDF = magicBytesHex === '25504446';
  const isPNG = magicBytesHex === '89504E47';
  const isJPEG = magicBytesHex.startsWith('FFD8FF');

  if (extension === 'pdf' && !isPDF) {
    return { isValid: false, error: 'เนื้อหาไฟล์ PDF ไม่ถูกต้อง (Magic Bytes Mismatch)' };
  }
  if (extension === 'png' && !isPNG) {
    return { isValid: false, error: 'เนื้อหาไฟล์ PNG ไม่ถูกต้อง (Magic Bytes Mismatch)' };
  }
  if ((extension === 'jpg' || extension === 'jpeg') && !isJPEG) {
    return { isValid: false, error: 'เนื้อหาไฟล์ JPG/JPEG ไม่ถูกต้อง (Magic Bytes Mismatch)' };
  }

  return {
    isValid: true,
    sha256,
    magicBytes: magicBytesHex,
  };
}
