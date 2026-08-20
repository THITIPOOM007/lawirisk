import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  normalizeEmail,
  normalizeBankAccount,
  normalizeCitizenId,
  normalizeEntityValue,
  isExactMatchType,
  calculateTrigramSimilarity,
  calculateLevenshteinSimilarity,
} from './entity-normalizers';

describe('normalizePhone', () => {
  it('converts Thai mobile formats', () => {
    expect(normalizePhone('062-4149791')).toBe('+66624149791');
    expect(normalizePhone('0624149791')).toBe('+66624149791');
    expect(normalizePhone('089 771 2345')).toBe('+66897712345');
  });

  it('keeps already formatted +66 numbers', () => {
    expect(normalizePhone('+66624149791')).toBe('+66624149791');
  });

  it('keeps international numbers', () => {
    expect(normalizePhone('+1 555 123 4567')).toBe('+15551234567');
  });

  it('returns null for too short numbers', () => {
    expect(normalizePhone('1234')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Admin@Example.COM  ')).toBe('admin@example.com');
  });

  it('returns null for empty string', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });
});

describe('normalizeBankAccount', () => {
  it('strips non-digits', () => {
    expect(normalizeBankAccount('123-4-56789-0')).toBe('1234567890');
    expect(normalizeBankAccount('123 456 7890')).toBe('1234567890');
  });

  it('returns null if too short', () => {
    expect(normalizeBankAccount('12345')).toBeNull();
    expect(normalizeBankAccount('')).toBeNull();
    expect(normalizeBankAccount('abcdefghij')).toBeNull();
  });
});

describe('normalizeCitizenId', () => {
  it('validates correct citizen ID', () => {
    // 1234567890121 passes the Thai citizen ID checksum
    expect(normalizeCitizenId('1-2345-67890-12-1')).toBe('1234567890121');
    expect(normalizeCitizenId('1234567890121')).toBe('1234567890121');
  });

  it('returns null for invalid checksum', () => {
    expect(normalizeCitizenId('1234567890122')).toBeNull();
  });

  it('returns null for wrong length', () => {
    expect(normalizeCitizenId('1234567890')).toBeNull();
    expect(normalizeCitizenId('12345678901234')).toBeNull();
  });

  it('returns null for non-digits', () => {
    expect(normalizeCitizenId('123456789012X')).toBeNull();
    expect(normalizeCitizenId('')).toBeNull();
  });
});

describe('normalizeEntityValue', () => {
  it('normalizes known types', () => {
    expect(normalizeEntityValue('PHONE', '0624149791')).toBe('+66624149791');
    expect(normalizeEntityValue('EMAIL', ' A@B.COM ')).toBe('a@b.com');
    expect(normalizeEntityValue('BANK_ACCOUNT', '123-456-7890')).toBe('1234567890');
    expect(normalizeEntityValue('CITIZEN_ID', '1234567890121')).toBe('1234567890121');
  });

  it('returns null for non-exact match types', () => {
    expect(normalizeEntityValue('PERSON', 'John Doe')).toBeNull();
    expect(normalizeEntityValue('ORGANIZATION', 'Acme Corp')).toBeNull();
    expect(normalizeEntityValue('LOCATION', 'Bangkok')).toBeNull();
  });
});

describe('isExactMatchType', () => {
  it('identifies exact match types correctly', () => {
    expect(isExactMatchType('PHONE')).toBe(true);
    expect(isExactMatchType('EMAIL')).toBe(true);
    expect(isExactMatchType('BANK_ACCOUNT')).toBe(true);
    expect(isExactMatchType('CITIZEN_ID')).toBe(true);
    
    expect(isExactMatchType('PERSON')).toBe(false);
    expect(isExactMatchType('UNKNOWN')).toBe(false);
  });
});

describe('calculateTrigramSimilarity', () => {
  it('gives 1.0 for identical strings', () => {
    expect(calculateTrigramSimilarity('สมชาย ใจดี', 'สมชาย ใจดี')).toBe(1.0);
  });

  it('calculates high similarity for minor typos or variations', () => {
    const score = calculateTrigramSimilarity('บริษัท วีรชัย เทรดดิ้ง จำกัด', 'บจก. วีรชัย เทรดดิ้ง');
    expect(score).toBeGreaterThan(0.4);
  });

  it('gives 0.0 for completely unrelated strings', () => {
    expect(calculateTrigramSimilarity('กรุงเทพมหานคร', 'เชียงใหม่')).toBeLessThan(0.2);
  });
});

describe('calculateLevenshteinSimilarity', () => {
  it('calculates distance accurately', () => {
    expect(calculateLevenshteinSimilarity('Somchai', 'Somchai')).toBe(1.0);
    expect(calculateLevenshteinSimilarity('Somchai', 'Somchai1')).toBeCloseTo(0.88, 1);
  });
});
