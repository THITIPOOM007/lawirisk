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

export const FUZZY_MATCH_TYPES = ['PERSON', 'ORGANIZATION', 'LOCATION'] as const;
export type FuzzyMatchType = typeof FUZZY_MATCH_TYPES[number];

export function isFuzzyMatchType(type: string): type is FuzzyMatchType {
  return (FUZZY_MATCH_TYPES as readonly string[]).includes(type);
}

/**
 * Calculates trigram similarity (similar to PostgreSQL pg_trgm similarity)
 */
export function calculateTrigramSimilarity(a: string, b: string): number {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA === cleanB) return 1.0;
  if (!cleanA || !cleanB) return 0.0;

  const getTrigrams = (str: string): Set<string> => {
    const padded = `  ${str} `;
    const trigrams = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.add(padded.substring(i, i + 3));
    }
    return trigrams;
  };

  const setA = getTrigrams(cleanA);
  const setB = getTrigrams(cleanB);

  let intersection = 0;
  for (const tri of setA) {
    if (setB.has(tri)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : Number((intersection / union).toFixed(2));
}

/**
 * Calculates Levenshtein Distance similarity
 */
export function calculateLevenshteinSimilarity(a: string, b: string): number {
  const str1 = a.trim().toLowerCase();
  const str2 = b.trim().toLowerCase();
  if (str1 === str2) return 1.0;
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[str1.length][str2.length];
  return Number((1 - distance / maxLen).toFixed(2));
}
