// Browser-side File Validator (Checks size, extension, SHA-256, and magic bytes)

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sha256?: string;
  magicBytes?: string;
}

export async function validateFileInBrowser(file: File): Promise<FileValidationResult> {
  // 1. Check size (limit: 20MB)
  const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_SIZE) {
    return { isValid: false, error: 'ขนาดไฟล์เกินกำหนด (สูงสุด 20 MB)' };
  }

  // 2. Check extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
  if (!extension || !allowedExtensions.includes(extension)) {
    return { isValid: false, error: 'รูปแบบไฟล์ไม่รองรับ (รองรับเฉพาะ PDF, PNG, JPG, JPEG เท่านั้น)' };
  }

  // Read array buffer for magic bytes and hash
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err) {
    return { isValid: false, error: 'ไม่สามารถอ่านเนื้อหาไฟล์ได้' };
  }

  // 3. Compute SHA-256 Hash
  let sha256 = '';
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    return { isValid: false, error: 'ไม่สามารถคำนวณรหัส Hash (SHA-256) ได้' };
  }

  // 4. Verify Magic Bytes (Signature)
  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 4));
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
