// supabase/functions/_shared/supabase.ts
// Client Supabase pour les Edge Functions. Service role (RLS bypass) car
// on a besoin d'accès complet aux 8 tables (raw_posts, clean_posts,
// post_analysis, weekly_reports, etc.).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireEnv } from './env.ts';

export type SbClient = ReturnType<typeof createClient>;

let cached: SbClient | null = null;

export function getSupabase(): SbClient {
  if (cached) return cached;
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
