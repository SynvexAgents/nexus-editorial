/**
 * seed-watchlist-batch-v3 — ajoute les 6 nouveaux profils v0.3 (FR confirmé
 * via audit langue 2026-05-14). Ne touche pas aux v0.2 actifs déjà en base.
 * Idempotent (UPSERT).
 *
 *   pnpm --filter @nexus/scripts seed:watchlist-batch-v3
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

interface ProfileSeed {
  profile_id: string;
  nom: string;
  headline: string;
  secteur: string;
  langue: 'FR';
  audience_size_estimee: number;
  notes: string;
  is_active: boolean;
}

const NEW_V03: ProfileSeed[] = [
  {
    profile_id: 'jeremygoillot',
    nom: 'Jérémy Goillot',
    headline: 'Head of Growth (Spendesk / Swan)',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes:
      'v0.3 — Cat A SaaS B2B operator. Audit langue 2026-05-14 : FR_PURE (10/10 posts FR sur 30j).',
    is_active: true,
  },
  {
    profile_id: 'julietouyarot',
    nom: 'Julie Touyarot',
    headline: 'VP Growth & Marketing Doctolib',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 20_000,
    notes:
      'v0.3 — Cat A SaaS B2B operator. Audit langue 2026-05-14 : FR_MAJORITAIRE (1 FR / 1 EN sur 30j, volume faible).',
    is_active: true,
  },
  {
    profile_id: 'olivier-gavalda',
    nom: 'Olivier Gavalda',
    headline: 'CEO Crédit Agricole SA',
    secteur: 'finance_conseil',
    langue: 'FR',
    audience_size_estimee: 100_000,
    notes:
      'v0.3 — Cat C Top Voice France 2026 (finance). Audit langue : FR_PURE (3/3 posts FR sur 30j).',
    is_active: true,
  },
  {
    profile_id: 'caroline-mignaux',
    nom: 'Caroline Mignaux',
    headline: 'LinkedIn Top Creator France (marketing B2B)',
    secteur: 'sales_marketing',
    langue: 'FR',
    audience_size_estimee: 150_000,
    notes:
      'v0.3 — Cat C Top Voice France 2026 (marketing). Audit langue : FR_PURE (10/10 posts FR sur 30j).',
    is_active: true,
  },
  {
    profile_id: 'sophie-levy-ayoun',
    nom: 'Sophie Levy Ayoun',
    headline: 'Directrice de la rédaction Maddyness',
    secteur: 'presse_b2b',
    langue: 'FR',
    audience_size_estimee: 15_000,
    notes:
      'v0.3 — Cat D presse B2B. Audit langue : FR_MAJORITAIRE (1 FR / 0 EN, volume faible mais éditorial FR).',
    is_active: true,
  },
  {
    profile_id: 'celia-seramour',
    nom: 'Célia Séramour',
    headline: "Journaliste / cheffe de rubrique L'Usine Digitale",
    secteur: 'presse_b2b',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'v0.3 — Cat D presse B2B. Audit langue : FR_PURE (3/3 posts FR sur 30j).',
    is_active: true,
  },
];

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  let inserted = 0;
  let updated = 0;

  for (const profile of NEW_V03) {
    const { data: existing } = await supabase
      .from('profiles_watchlist')
      .select('profile_id')
      .eq('profile_id', profile.profile_id)
      .maybeSingle();

    const { error } = await supabase
      .from('profiles_watchlist')
      .upsert(profile as never, { onConflict: 'profile_id' });
    if (error) {
      logger.error({ profile_id: profile.profile_id, msg: error.message }, 'upsert_failed');
      continue;
    }
    if (existing) updated += 1;
    else inserted += 1;
  }

  const { count: activeTotal } = await supabase
    .from('profiles_watchlist')
    .select('profile_id', { count: 'exact', head: true })
    .eq('is_active', true);

  process.stdout.write('\n========== Watchlist v0.3 — adds ==========\n');
  process.stdout.write(`Inserted     : ${inserted}\n`);
  process.stdout.write(`Updated      : ${updated}\n`);
  process.stdout.write(`Active total : ${activeTotal ?? '?'}\n`);
  process.stdout.write('============================================\n\n');
  logger.info({ inserted, updated, active_total: activeTotal }, 'seed_v03_done');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'seed_v03_failed');
  process.exit(1);
});
