import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('release security regressions', () => {
  it('keeps evidence upload behind reservation, RLS and compensation boundaries', () => {
    const route = source('src/app/api/evidence/upload/route.ts');
    expect(route).toContain("supabase.rpc('reserve_evidence_upload'");
    expect(route).toContain("supabase.rpc('finalize_evidence_upload'");
    expect(route).toContain("supabase.rpc('cancel_evidence_reservation'");
    expect(route).not.toContain("from('evidence_files').insert");
    expect(route).not.toContain('fallback proceed');
  });

  it('keeps 200 MB evidence off the Worker body and validates the stored object before finalization', () => {
    const reserve = source('src/app/api/v1/evidence/uploads/route.ts');
    const complete = source('src/app/api/v1/evidence/uploads/[id]/complete/route.ts');
    const contract = source('src/lib/evidence-upload-contract.ts');
    const migration = source('supabase/migrations/202608240002_evidence_upload_200mb.sql');
    expect(reserve).toContain('createSignedUploadUrl');
    expect(reserve).toContain('resumable_endpoint');
    expect(reserve).not.toContain('request.formData()');
    expect(complete).toContain('createSignedUrl(evidence.file_path, 300)');
    expect(complete).toContain('validateStoredFileReference');
    expect(complete).toContain("supabase.rpc('finalize_evidence_upload'");
    expect(complete).not.toContain('MALWARE_SCANNER');
    expect(contract).toContain('200 * 1024 * 1024');
    expect(migration).toContain('209715200');
    expect(migration).toContain("record.upload_state <> 'RESERVED'");
  });

  it('records unscanned files honestly and never rewrites infected legacy files', () => {
    const evidenceRoute = source('src/app/api/evidence/upload/route.ts');
    const publicRoute = source('src/app/api/v1/public/complaints/route.ts');
    const migration = source('supabase/migrations/202608240003_remove_scanner_dependency.sql');
    expect(evidenceRoute).toContain('UNSCANNED_EVIDENCE_STATUS');
    expect(publicRoute).toContain('UNSCANNED_EVIDENCE_STATUS');
    expect(migration).toContain("malware_scan_status = 'NOT_SCANNED'");
    expect(migration).toContain("malware_scan_status = 'INFECTED'");
    expect(migration).not.toContain("SET malware_scan_status = 'CLEAN'");
  });

  it('does not mutate malware verdicts from an intake GET or triage fallback', () => {
    const route = source('src/app/api/v1/intake/[id]/route.ts');
    expect(route).not.toContain('Auto-heal scan status');
    expect(route).not.toContain("update({ malware_scan_status: 'CLEAN' })");
    expect(route).not.toContain('using service client fallback');
  });

  it('hardens optional feature RLS and SECURITY DEFINER functions', () => {
    const migration = source('supabase/migrations/202608230001_release_security_hardening.sql');
    expect(migration).toContain('Users manage their own WebAuthn challenges');
    expect(migration).toContain("USING (profile_id = auth.uid())");
    expect(migration).toContain('Investigators modify tasks in their cases');
    expect(migration).toContain("SET search_path = ''");
  });

  it('never simulates a successful production passkey and enforces one-time review step-up', () => {
    const client = source('src/lib/webauthn-client.ts');
    const review = source('src/app/api/v1/review/[id]/route.ts');
    const migration = source('supabase/migrations/202608230001_release_security_hardening.sql');
    expect(client).not.toContain('sim-passkey-');
    expect(review).toContain("parsed.data.decision === 'CONFIRMED'");
    expect(review).toContain("supabase.rpc('consume_webauthn_step_up'");
    expect(migration).toContain('complete_webauthn_authentication');
    expect(migration).toContain('complete_webauthn_registration');
    expect(migration).toContain('consume_webauthn_step_up');
  });

  it('issues passwordless sessions only after server-verified WebAuthn state commits', () => {
    const options = source('src/app/api/v1/auth/passkey/login/options/route.ts');
    const verify = source('src/app/api/v1/auth/passkey/login/verify/route.ts');
    const migration = source('supabase/migrations/202608230002_passkey_login_and_devices.sql');
    expect(options).toContain("type: 'LOGIN'");
    expect(options).toContain('crypto.randomBytes(32)');
    expect(verify).toContain("service.rpc('complete_webauthn_login'");
    expect(verify).toContain('verifyAuthentication({');
    expect(verify).toContain('auth.admin.generateLink');
    expect(verify).toContain('sessionClient.auth.verifyOtp');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.complete_webauthn_login');
    expect(migration).toContain('TO service_role');
    expect(migration).toContain('remove_own_webauthn_credential');
  });

  it('protects cross-case scans with origin validation, input validation and rate limiting', () => {
    const route = source('src/app/api/v1/matches/scan/route.ts');
    expect(route).toContain('hasTrustedBrowserOrigin(request)');
    expect(route).toContain('scanSchema.safeParse');
    expect(route).toContain('consumeRateLimit');
  });
});
