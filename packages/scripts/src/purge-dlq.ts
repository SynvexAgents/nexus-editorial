/**
 * purge-dlq — supprime toutes les entrées DLQ liées à un acteur Apify.
 * À utiliser après avoir corrigé un mapper qui aurait produit des faux positifs.
 *   pnpm --filter @nexus/scripts purge-dlq
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

const SOURCE_ACTOR = process.env.SOURCE_ACTOR ?? 'harvestapi/linkedin-profile-posts';

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  const { error, count } = await supabase
    .from('raw_posts_dlq')
    .delete({ count: 'exact' })
    .eq('source_actor', SOURCE_ACTOR);
  if (error) throw new Error(`purge_failed: ${error.message}`);
  logger.info({ source_actor: SOURCE_ACTOR, deleted: count ?? 0 }, 'dlq_purged');
  process.stdout.write(`Deleted ${count ?? 0} DLQ entries for actor ${SOURCE_ACTOR}\n`);
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'purge_dlq_failed');
  process.exit(1);
});
