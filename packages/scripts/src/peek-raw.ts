/**
 * peek-raw — affiche les derniers raw_posts avec preview pour diagnostic.
 *   pnpm --filter @nexus/scripts peek-raw
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  const { data, error } = await supabase
    .from('raw_posts')
    .select('post_id, profile_id, source_actor, published_at, text, likes, comments, reposts')
    .order('collected_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const text = (row.text as string) ?? '';
    const preview = text.slice(0, 250).replace(/\s+/g, ' ');
    process.stdout.write(
      `\n--- ${row.profile_id} (${row.source_actor}) — ${row.published_at} ---\n`,
    );
    process.stdout.write(`likes=${row.likes} comments=${row.comments} reposts=${row.reposts}\n`);
    process.stdout.write(`${preview}\n`);
  }
  logger.info({ count: data?.length ?? 0 }, 'peek_done');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'peek_failed');
  process.exit(1);
});
