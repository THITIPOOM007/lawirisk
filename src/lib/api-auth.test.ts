import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const getUser = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('@/lib/supabase-server', () => ({
  createServer: vi.fn(async () => ({ auth: { getUser }, from })),
}));

import { authorizeStaff } from './api-auth';

function requestWithCookies(values: Record<string, string> = {}) {
  return {
    cookies: {
      get(name: string) {
        const value = values[name];
        return value === undefined ? undefined : { value };
      },
    },
  } as never;
}

describe('authorizeStaff production boundary', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      NEXT_PUBLIC_DEMO_MODE: 'false',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects forged demo cookies when the Supabase session is invalid', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid session') });

    const result = await authorizeStaff(
      requestWithCookies({ 'mock-auth-logged-in': 'true', 'mock-auth-role': 'ADMIN' }),
      new Set(['ADMIN']),
    );

    expect(result).toEqual({ ok: false, status: 401, code: 'UNAUTHENTICATED' });
    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed when the authenticated user has no valid profile role', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { name: 'Unknown', role: null }, error: null });

    const result = await authorizeStaff(requestWithCookies(), new Set(['INVESTIGATOR']));

    expect(result).toEqual({ ok: false, status: 403, code: 'FORBIDDEN' });
  });

  it('enforces the exact role set requested by the route', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { name: 'Investigator', role: 'INVESTIGATOR' }, error: null });

    const result = await authorizeStaff(requestWithCookies(), new Set(['REVIEWER']));

    expect(result).toEqual({ ok: false, status: 403, code: 'FORBIDDEN' });
  });

  it('returns the database-backed identity for an allowed role', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null });
    maybeSingle.mockResolvedValue({ data: { name: 'Reviewer', role: 'REVIEWER' }, error: null });

    const result = await authorizeStaff(requestWithCookies(), new Set(['REVIEWER']));

    expect(result).toEqual({
      ok: true,
      identity: { id: 'user-1', name: 'Reviewer', email: 'user@example.test', role: 'REVIEWER', mode: 'supabase' },
    });
  });
});
