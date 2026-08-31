import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicPage = readFileSync('src/app/public/page.tsx', 'utf8');
const publicRoute = readFileSync('src/app/api/v1/public/complaints/route.ts', 'utf8');
const staffPage = readFileSync('src/app/intake/[id]/page.tsx', 'utf8');

describe('multi-attachment UX contract', () => {
  it('accepts and validates at most five public complaint attachments as one batch', () => {
    expect(publicPage).toContain('multiple');
    expect(publicPage).toContain("formData.append('files'");
    expect(publicRoute).toContain('const MAX_FILE_COUNT = 5');
    expect(publicRoute).toContain("formData.getAll('files')");
    expect(publicRoute).toContain('remove(uploadedPaths)');
  });

  it('lets staff choose five files once and uploads them in bounded requests', () => {
    expect(staffPage).toContain('files.length > 5');
    expect(staffPage).toContain('multiple');
    expect(staffPage).toContain('กำลังจัดเก็บไฟล์');
  });
});
