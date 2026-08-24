import { describe, expect, it } from 'vitest';
import { evidenceSafetyLabel, isEvidenceUsable } from './evidence-file-status';

describe('evidence file status', () => {
  it('allows stored legacy-clean and explicit unscanned files', () => {
    expect(isEvidenceUsable('STORED', 'CLEAN')).toBe(true);
    expect(isEvidenceUsable('STORED', 'NOT_SCANNED')).toBe(true);
  });

  it('keeps infected and incomplete files unavailable', () => {
    expect(isEvidenceUsable('STORED', 'INFECTED')).toBe(false);
    expect(isEvidenceUsable('RESERVED', 'NOT_SCANNED')).toBe(false);
    expect(evidenceSafetyLabel('NOT_SCANNED')).toContain('ไม่ได้สแกนมัลแวร์');
  });
});
