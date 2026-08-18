import 'server-only';

const hasValue = (name: string) => Boolean(process.env[name]?.trim());

export function isSupabaseServerConfigured() {
  return hasValue('NEXT_PUBLIC_SUPABASE_URL') && hasValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function isDemoServerEnabled() {
  return process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_DEMO_MODE !== 'false'
    && !isSupabaseServerConfigured();
}

export type RuntimeReadiness = {
  ready: boolean;
  mode: 'production' | 'demo' | 'misconfigured';
  checks: {
    supabase: boolean;
    serviceRole: boolean;
    privateEvidenceBucket: boolean;
    malwareScanner: boolean;
    kouprey: boolean;
    partnerApi: boolean;
  };
  blockers: string[];
};

export function getRuntimeReadiness(): RuntimeReadiness {
  const supabase = isSupabaseServerConfigured();
  const checks = {
    supabase,
    serviceRole: hasValue('SUPABASE_SERVICE_ROLE_KEY'),
    privateEvidenceBucket: hasValue('PRIVATE_EVIDENCE_BUCKET'),
    malwareScanner: hasValue('MALWARE_SCANNER_URL') && hasValue('MALWARE_SCANNER_TOKEN'),
    kouprey: hasValue('KOUPREY_SECRET_KEY'),
    partnerApi: hasValue('PARTNER_API_KEYS'),
  };
  const blockers: string[] = [];
  if (!checks.supabase) blockers.push('SUPABASE_NOT_CONFIGURED');
  if (!checks.serviceRole) blockers.push('SERVICE_ROLE_NOT_CONFIGURED');
  if (!checks.privateEvidenceBucket) blockers.push('PRIVATE_BUCKET_NOT_CONFIGURED');
  if (!checks.malwareScanner) blockers.push('MALWARE_SCANNER_NOT_CONFIGURED');

  if (isDemoServerEnabled()) {
    return { ready: false, mode: 'demo', checks, blockers };
  }
  return {
    ready: blockers.length === 0,
    mode: supabase ? 'production' : 'misconfigured',
    checks,
    blockers,
  };
}
