/**
 * deactivate-anglophones — soft-delete des 6 profils v0.2 confirmés EN-only
 * suite au stress test du 2026-05-14. Idempotent.
 *
 *   pnpm --filter @nexus/scripts deactivate-anglophones
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

const TO_DEACTIVATE = [
  'florian-graillot', // astoryaVC — 4/4 posts EN confirmés
  'aprot', // Qonto — 3/3 posts EN
  'eleonorecrespo', // Pigment — 3/3 posts EN
  'thomas-clozel-408a9321', // Owkin — 8/8 posts EN
  'pierre-gaubil-6477a68', // Aircall — 5/5 posts EN
  'fdouetteau', // Dataiku — 2/2 posts EN
];

const NOTES_SUFFIX = ' [DEACTIVATED 2026-05-14: anglophone confirmé via stress test v0.2.]';

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  let updated = 0;

  for (const slug of TO_DEACTIVATE) {
    // 1. Récupérer notes pour append du flag (traçabilité).
    const { data: existing } = await supabase
      .from('profiles_watchlist')
      .select('profile_id, notes, is_active')
      .eq('profile_id', slug)
      .maybeSingle();
    if (!existing) {
      logger.warn({ slug }, 'profile_not_found');
      continue;
    }

    const currentNotes = ((existing as { notes: string | null }).notes ?? '').toString();
    const newNotes = currentNotes.includes('[DEACTIVATED')
      ? currentNotes
      : `${currentNotes}${NOTES_SUFFIX}`;

    const { error } = await supabase
      .from('profiles_watchlist')
      .update({ is_active: false, notes: newNotes } as never)
      .eq('profile_id', slug);
    if (error) {
      logger.error({ slug, msg: error.message }, 'update_failed');
      continue;
    }
    updated += 1;
    logger.info({ slug }, 'deactivated');
  }

  const { count: activeNow } = await supabase
    .from('profiles_watchlist')
    .select('profile_id', { count: 'exact', head: true })
    .eq('is_active', true);

  process.stdout.write('\n========== Anglophones deactivated ==========\n');
  process.stdout.write(`Soft-deleted        : ${updated}\n`);
  process.stdout.write(`Active total now    : ${activeNow ?? '?'}\n`);
  process.stdout.write('==============================================\n\n');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'deactivate_failed');
  process.exit(1);
});
