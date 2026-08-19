import crypto from 'node:crypto';

export function secureTokenMatches(expected: string, supplied: string | null) {
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return expectedBytes.length === suppliedBytes.length
    && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

export function isAllowedAutomationUrl(rawValue: string, production = process.env.NODE_ENV === 'production') {
  try {
    const url = new URL(rawValue);
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return !production
      && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}
