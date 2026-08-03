import { describe, it, expect, vi } from 'vitest';
import { validateFileInBrowser } from './file-validator';

describe('file-validator', () => {
  it('should reject file exceeding 20MB', async () => {
    // Create mock file with large size
    const mockFile = {
      name: 'large_file.pdf',
      size: 21 * 1024 * 1024, // 21 MB
      type: 'application/pdf',
    } as unknown as File;

    const result = await validateFileInBrowser(mockFile);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('ขนาดไฟล์เกินกำหนด');
  });

  it('should reject unsupported file extension', async () => {
    const mockFile = {
      name: 'malicious.exe',
      size: 1 * 1024 * 1024,
      type: 'application/octet-stream',
    } as unknown as File;

    const result = await validateFileInBrowser(mockFile);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('รูปแบบไฟล์ไม่รองรับ');
  });
});
