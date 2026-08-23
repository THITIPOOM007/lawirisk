import 'server-only';

const hasValue = (name: string) => Boolean(process.env[name]?.trim());
const hasStrongSecret = (name: string) => (process.env[name]?.trim().length || 0) >= 32;

const hasSecureHttpsUrl = (name: string) => {
  try {
    const url = new URL(process.env[name]?.trim() || '');
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

export function isSupabaseServerConfigured() {
  return hasValue('NEXT_PUBLIC_SUPABASE_URL') && hasValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function isSupabaseServiceConfigured() {
  return isSupabaseServerConfigured() && hasValue('SUPABASE_SERVICE_ROLE_KEY');
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
    gemini: boolean;
    n8nAutomation: boolean;
    kouprey: boolean;
    partnerApi: boolean;
  };
  blockers: string[];
};

export function getRuntimeReadiness(): RuntimeReadiness {
  const supabase = isSupabaseServerConfigured();
  const checks = {
    supabase,
    serviceRole: isSupabaseServiceConfigured(),
    privateEvidenceBucket: hasValue('PRIVATE_EVIDENCE_BUCKET'),
    malwareScanner: hasSecureHttpsUrl('MALWARE_SCANNER_URL') && hasStrongSecret('MALWARE_SCANNER_TOKEN'),
    gemini: hasValue('GEMINI_API_KEY'),
    n8nAutomation: hasSecureHttpsUrl('N8N_AUTOMATION_WEBHOOK_URL')
      && hasStrongSecret('N8N_DISPATCH_TOKEN')
      && hasStrongSecret('N8N_CALLBACK_TOKEN')
      && process.env.N8N_DISPATCH_TOKEN?.trim() !== process.env.N8N_CALLBACK_TOKEN?.trim(),
    kouprey: hasValue('KOUPREY_SECRET_KEY'),
    partnerApi: hasValue('PARTNER_API_KEYS'),
  };
  const blockers: string[] = [];
  if (!checks.supabase) blockers.push('SUPABASE_NOT_CONFIGURED');
  if (!checks.serviceRole) blockers.push('SERVICE_ROLE_NOT_CONFIGURED');
  if (!checks.privateEvidenceBucket) blockers.push('PRIVATE_BUCKET_NOT_CONFIGURED');
  if (!checks.malwareScanner) blockers.push('MALWARE_SCANNER_NOT_CONFIGURED');
  if (!checks.n8nAutomation) blockers.push('N8N_AUTOMATION_NOT_CONFIGURED');
  if (!checks.gemini) blockers.push('GEMINI_NOT_CONFIGURED');

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
