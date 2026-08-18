import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
};

export const isDemoModeEnabled = () => {
  return !isSupabaseConfigured()
    && process.env.NODE_ENV !== 'production'
    && process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
};

// Browser client (for Client Components)
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
