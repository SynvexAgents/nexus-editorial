import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { Database } from './db/types.js';

export type NexusSupabaseClient = SupabaseClient<Database>;

export interface SupabaseClientOptions {
  url?: string;
  key?: string;
  role?: 'service_role' | 'anon';
}

export function createNexusSupabaseClient(
  options: SupabaseClientOptions = {},
): NexusSupabaseClient {
  const url = options.url ?? process.env.SUPABASE_URL;
  const role = options.role ?? 'service_role';
  const key =
    options.key ??
    (role === 'service_role'
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : process.env.SUPABASE_ANON_KEY);

  if (!url) {
    throw new Error('SUPABASE_URL is not set in env');
  }
  if (!key) {
    throw new Error(`Supabase ${role} key is not set in env`);
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
