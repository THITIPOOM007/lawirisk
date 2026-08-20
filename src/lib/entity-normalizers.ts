export const EXACT_MATCH_TYPES = ['PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID'] as const;
export type ExactMatchType = typeof EXACT_MATCH_TYPES[number];

export function isExactMatchType(type: string): type is ExactMatchType {
  return (EXACT_MATCH_TYPES as readonly string[]).includes(type);
}

export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const isPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  
  if (digits.length === 0) return null;
  
  let cleaned = digits;
  if (isPlus) {
    cleaned = '+' + digits;
  } else if (digits.startsWith('0')) {
    cleaned = '+66' + digits.slice(1);
  }
  
  // Count only digits for length validation
  const digitCount = cleaned.replace(/\D/g, '').length;
  if (digitCount < 8) {
    return null;
  }
  
  return cleaned;
}

export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  return cleaned;
}

export function normalizeBankAccount(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d]/g, '');
  if (cleaned.length < 10) return null;
  return cleaned;
}

export function normalizeCitizenId(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d]/g, '');
  if (cleaned.length !== 13) return null;
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i], 10) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  
  if (checkDigit !== parseInt(cleaned[12], 10)) {
    return null;
  }
  
  return cleaned;
}

export function normalizeEntityValue(type: string, value: string): string | null {
  if (!isExactMatchType(type)) {
    return null;
  }
  
  switch (type) {
    case 'PHONE':
      return normalizePhone(value);
    case 'EMAIL':
      return normalizeEmail(value);
    case 'BANK_ACCOUNT':
      return normalizeBankAccount(value);
    case 'CITIZEN_ID':
      return normalizeCitizenId(value);
    default:
      return null;
  }
}
