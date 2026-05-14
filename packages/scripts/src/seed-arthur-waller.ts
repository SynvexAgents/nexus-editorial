/**
 * seed-arthur-waller — insère un profil de test unique pour le smoke test
 * end-to-end (tâche n°2 follow-up). Idempotent via UPSERT.
 *
 *   pnpm --filter @nexus/scripts seed:arthur-waller
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

const PROFILE = {
  profile_id: 'arthur-waller-a793a611',
  nom: 'Arthur Waller',
  headline: 'Co-Founder at Pennylane',
  secteur: 'saas_ops',
  langue: 'FR',
  audience_size_estimee: 50_000,
  notes: 'Fondateur unicorne fintech FR, poste régulièrement en FR',
  is_active: true,
};

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();

  const { error: upsertError } = await supabase
    .from('profiles_watchlist')
    .upsert(PROFILE as never, { onConflict: 'profile_id' });
  if (upsertError) {
    throw new Error(`upsert_failed: ${upsertError.message}`);
  }

  const { data, error: selectError } = await supabase
    .from('profiles_watchlist')
    .select('profile_id, nom, headline, secteur, audience_size_estimee, is_active, created_at')
    .eq('profile_id', PROFILE.profile_id)
    .single();
  if (selectError) {
    throw new Error(`select_failed: ${selectError.message}`);
  }

  logger.info({ profile: data }, 'profile_seeded');
  process.stdout.write('\nProfile inserted / updated:\n');
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n\n`);
}

main().catch((err: unknown) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    'seed_arthur_waller_failed',
  );
  process.exit(1);
});
