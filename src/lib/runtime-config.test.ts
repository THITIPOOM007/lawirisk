import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isSupabaseServerConfigured, isDemoServerEnabled, getRuntimeReadiness } from './runtime-config';

vi.mock('server-only', () => ({}));

describe('runtime-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear out relevant env vars to test isolation
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.PRIVATE_EVIDENCE_BUCKET;
    delete process.env.MALWARE_SCANNER_URL;
    delete process.env.MALWARE_SCANNER_TOKEN;
    delete process.env.GEMINI_API_KEY;
    delete process.env.N8N_AUTOMATION_WEBHOOK_URL;
    delete process.env.N8N_DISPATCH_TOKEN;
    delete process.env.N8N_CALLBACK_TOKEN;
    delete process.env.KOUPREY_SECRET_KEY;
    delete process.env.PARTNER_API_KEYS;
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllEnvs();
  });

  it('isSupabaseServerConfigured returns false when env vars are missing', () => {
    expect(isSupabaseServerConfigured()).toBe(false);
  });

  it('isSupabaseServerConfigured returns true when url and anon key are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'ey-anon-key';
    expect(isSupabaseServerConfigured()).toBe(true);
  });

  it('isDemoServerEnabled returns true by default in non-production', () => {
    expect(isDemoServerEnabled()).toBe(true);
  });

  it('isDemoServerEnabled returns false if explicitly disabled', () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    expect(isDemoServerEnabled()).toBe(false);
  });

  it('isDemoServerEnabled returns false in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isDemoServerEnabled()).toBe(false);
  });

  it('isDemoServerEnabled returns false if Supabase is configured', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'ey-anon-key';
    expect(isDemoServerEnabled()).toBe(false);
  });

  it('getRuntimeReadiness returns demo mode properly', () => {
    const readiness = getRuntimeReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.mode).toBe('demo');
    expect(readiness.blockers).toContain('SUPABASE_NOT_CONFIGURED');
  });

  it('getRuntimeReadiness flags misconfigured when only Supabase is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'ey-anon-key';
    const readiness = getRuntimeReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.mode).toBe('production'); // URL is present
    expect(readiness.blockers).toContain('SERVICE_ROLE_NOT_CONFIGURED');
  });
});
