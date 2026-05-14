/**
 * inspect-results — bilan post-run du test-collector pour un profil donné.
 *   pnpm --filter @nexus/scripts inspect-results
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

const PROFILE_ID = process.env.PROFILE_ID ?? 'arthur-waller-a793a611';

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();

  // 1. raw_posts pour ce profil
  const { data: rawPosts, error: e1 } = await supabase
    .from('raw_posts')
    .select('post_id, published_at, text, likes, comments, reposts, media_type, source_actor, url')
    .eq('profile_id', PROFILE_ID)
    .order('published_at', { ascending: false });
  if (e1) throw new Error(`raw_posts_fetch_failed: ${e1.message}`);

  // 2. clean_posts (jointure manuelle via post_id)
  const postIds = (rawPosts ?? []).map((r: { post_id: string }) => r.post_id);
  const { data: cleanPosts, error: e2 } =
    postIds.length > 0
      ? await supabase
          .from('clean_posts')
          .select(
            'post_id, engagement_score_normalized, topic_cluster_pre, is_relevant, filter_reason',
          )
          .in('post_id', postIds)
      : { data: [], error: null };
  if (e2) throw new Error(`clean_posts_fetch_failed: ${e2.message}`);

  // 3. temporal_analysis
  const { data: temporal, error: e3 } = await supabase
    .from('temporal_analysis')
    .select('week_id, day_of_week, hour_bucket, posts_count, avg_engagement_norm, top_format')
    .order('week_id', { ascending: false })
    .limit(20);
  if (e3) throw new Error(`temporal_fetch_failed: ${e3.message}`);

  // 4. DLQ
  const { data: dlq, error: e4 } = await supabase
    .from('raw_posts_dlq')
    .select('id, error_reason, source_actor, collected_at, raw_payload')
    .order('collected_at', { ascending: false })
    .limit(20);
  if (e4) throw new Error(`dlq_fetch_failed: ${e4.message}`);

  // Top 3 par score
  type Clean = { post_id: string; engagement_score_normalized: number; topic_cluster_pre: string };
  type Raw = { post_id: string; text: string | null; published_at: string };
  const cleanArr = (cleanPosts ?? []) as Clean[];
  const rawArr = (rawPosts ?? []) as Raw[];
  const rawByPostId = new Map(rawArr.map((r) => [r.post_id, r]));
  const top3 = [...cleanArr]
    .sort((a, b) => b.engagement_score_normalized - a.engagement_score_normalized)
    .slice(0, 3)
    .map((c) => {
      const r = rawByPostId.get(c.post_id);
      return {
        post_id: c.post_id,
        score: c.engagement_score_normalized,
        cluster: c.topic_cluster_pre,
        date: r?.published_at ?? null,
        preview: (r?.text ?? '').slice(0, 200),
      };
    });

  const report = {
    profile_id: PROFILE_ID,
    counts: {
      raw_posts: rawArr.length,
      clean_posts: cleanArr.length,
      temporal_rows: temporal?.length ?? 0,
      dlq: dlq?.length ?? 0,
    },
    raw_posts_summary: rawArr.map((r) => ({
      post_id: r.post_id,
      published_at: r.published_at,
      preview: (r.text ?? '').slice(0, 100),
    })),
    temporal_rows: temporal,
    top_3_clean: top3,
    dlq_entries: dlq?.map((d: Record<string, unknown>) => ({
      id: d.id,
      error_reason: d.error_reason,
      source_actor: d.source_actor,
      payload_keys: Object.keys((d.raw_payload as object) ?? {}),
      payload_excerpt: JSON.stringify(d.raw_payload).slice(0, 300),
    })),
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  logger.info({ counts: report.counts }, 'inspect_done');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'inspect_failed');
  process.exit(1);
});
