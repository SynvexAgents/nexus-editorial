/**
 * seed-watchlist-batch — upsert d'une batch hardcodée de profils dans
 * profiles_watchlist. Idempotent. Sert à étendre la watchlist au-delà du seed
 * de smoke test (arthur-waller).
 *
 *   pnpm --filter @nexus/scripts seed:watchlist-batch
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

// Batch du 2026-05-14 — élargissement watchlist hors assurance pour
// stress-tester les filtres du normalizer sur cluster `autre`.
const PROFILES: ProfileSeed[] = [
  {
    profile_id: 'hugo-andrianjatovo',
    nom: 'Hugo Andrianjatovo',
    headline: 'Influence & B2B Marketing at Pennylane',
    secteur: 'saas_ops_or_finance',
    langue: 'FR',
    audience_size_estimee: 20_000,
    notes: 'Voix influence/B2B chez une fintech française unicorne.',
    is_active: true,
  },
  {
    profile_id: 'profit-led-growth',
    nom: 'Guillaume Moubeche',
    headline: 'Founder Lemlist / Lempire',
    secteur: 'sales_marketing',
    langue: 'FR',
    audience_size_estimee: 150_000,
    notes: 'Slug custom "profit-led-growth". Très haut volume, mélange FR/EN.',
    is_active: true,
  },
  {
    profile_id: 'fdouetteau',
    nom: 'Florian Douetteau',
    headline: 'CEO Dataiku',
    secteur: 'saas_ops_or_finance',
    langue: 'FR',
    audience_size_estimee: 50_000,
    notes: 'CEO unicorne data/IA, poste régulièrement en EN — test filtre non_fr.',
    is_active: true,
  },
  {
    profile_id: 'olivier-babeau',
    nom: 'Olivier Babeau',
    headline: 'Président Institut Sapiens',
    secteur: 'finance_conseil',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'Think tank économie / société. Voix éditoriale dense.',
    is_active: true,
  },
  {
    profile_id: 'amhalla',
    nom: 'Asma Mhalla',
    headline: 'Chercheuse tech & géopolitique',
    secteur: 'finance_conseil',
    langue: 'FR',
    audience_size_estimee: 50_000,
    notes: 'Géopolitique de la tech, voix très médiatique.',
    is_active: true,
  },
  {
    profile_id: 'marieekeland',
    nom: 'Marie Ekeland',
    headline: 'Founder Daphni / 2050',
    secteur: 'saas_ops_or_finance',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'VC fondatrice, sujets transition / tech / capital.',
    is_active: true,
  },
  {
    profile_id: 'domitille-de-saint-exupery',
    nom: 'Domitille de Saint-Exupéry',
    headline: 'CMO Lemlist',
    secteur: 'sales_marketing',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'CMO Lemlist, contenu growth/marketing.',
    is_active: true,
  },
  {
    profile_id: 'firmin-zocchetto',
    nom: 'Firmin Zocchetto',
    headline: 'CEO & Co-founder PayFit',
    secteur: 'saas_ops_or_finance',
    langue: 'FR',
    audience_size_estimee: 40_000,
    notes: 'CEO unicorne SaaS RH/paie FR. Test cluster autre.',
    is_active: true,
  },
];

// Note hors batch : Marc Trojanowski n'est pas un co-fondateur confirmé de
// Doctrine (les co-fondateurs publics sont Bustamante/Dusséaux/Champeimont).
// Profil exclu jusqu'à clarification.

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  let inserted = 0;
  let updated = 0;

  for (const profile of PROFILES) {
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

  // Récap final
  const { count } = await supabase
    .from('profiles_watchlist')
    .select('profile_id', { count: 'exact', head: true })
    .eq('is_active', true);

  process.stdout.write('\nBatch seed complete.\n');
  process.stdout.write(`  Inserted: ${inserted}\n`);
  process.stdout.write(`  Updated : ${updated}\n`);
  process.stdout.write(`  Active total in watchlist: ${count ?? '?'}\n\n`);
  logger.info({ inserted, updated, active_total: count }, 'seed_batch_done');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'seed_batch_failed');
  process.exit(1);
});
