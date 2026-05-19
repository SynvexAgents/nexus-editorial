// supabase/functions/_shared/env.ts
// Helpers d'accès aux variables d'environnement Edge Functions Supabase.
// Toutes les vars doivent être set via `supabase secrets set KEY=value`.

export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`env_missing: ${name}`);
  return v;
}

export function getEnv(name: string, fallback?: string): string | undefined {
  return Deno.env.get(name) ?? fallback;
}

// Liste centralisée des secrets attendus côté Supabase. Documentée pour
// l'opérateur qui exécute `supabase secrets set` lors du déploiement.
// Chaque function en consomme un sous-ensemble.
export const REQUIRED_SECRETS = [
  // Auth interne (préfix SUPABASE_ réservé par Supabase CLI → on utilise NEXUS_)
  'NEXUS_API_TOKEN',
  // Supabase
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  // LLMs
  'ANTHROPIC_API_KEY',
  'PERPLEXITY_API_KEY',
  'OPENAI_API_KEY', // embeddings voice-pack (optionnel — fallback graceful)
  // Scraping
  'APIFY_TOKEN',
  // Notifications
  'RESEND_API_KEY',
  'NOTIFY_EMAIL_TO',
  'NOTIFY_EMAIL_FROM',
  'DASHBOARD_URL',
] as const;

export type RequiredSecret = (typeof REQUIRED_SECRETS)[number];
