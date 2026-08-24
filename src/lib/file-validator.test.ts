import { describe, it, expect } from 'vitest';
import { validateFileInBrowser } from './file-validator';

describe('file-validator', () => {
  it('should reject file exceeding 200MB', async () => {
    // Create mock file with large size
    const mockFile = {
      name: 'large_file.pdf',
      size: 201 * 1024 * 1024,
      type: 'application/pdf',
    } as unknown as File;

    const result = await validateFileInBrowser(mockFile);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('ไม่เกิน 200 MB');
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

  it('rejects an empty file', async () => {
    const mockFile = { name: 'empty.pdf', size: 0, type: 'application/pdf' } as File;
    const result = await validateFileInBrowser(mockFile);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('มากกว่า 0');
  });

  it('rejects a MIME and extension mismatch before reading bytes', async () => {
    const mockFile = {
      name: 'renamed.pdf',
      size: 128,
      type: 'image/png',
    } as File;
    const result = await validateFileInBrowser(mockFile);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('MIME');
  });
});
