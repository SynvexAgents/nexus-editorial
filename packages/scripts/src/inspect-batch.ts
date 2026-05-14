/**
 * inspect-batch — bilan multi-profils du dernier run du test-collector.
 *   pnpm --filter @nexus/scripts inspect-batch
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

interface ClusterDistribution {
  pilotage: number;
  commercial: number;
  reglementaire: number;
  operationnel: number;
  tech_ia: number;
  marche_assurance: number;
  autre: number;
}

interface CountsByProfile {
  raw: number;
  clean: number;
}

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();

  // Watchlist active
  const { data: profiles } = await supabase
    .from('profiles_watchlist')
    .select('profile_id, nom')
    .eq('is_active', true);

  // raw_posts groupés par profil
  const { data: rawRows } = await supabase
    .from('raw_posts')
    .select('post_id, profile_id, published_at, text, likes, comments, reposts, media_type')
    .order('published_at', { ascending: false });

  // clean_posts groupés par cluster
  const { data: cleanRows } = await supabase
    .from('clean_posts')
    .select('post_id, engagement_score_normalized, topic_cluster_pre, filter_reason')
    .order('engagement_score_normalized', { ascending: false });

  // DLQ
  const { data: dlqRows, count: dlqCount } = await supabase
    .from('raw_posts_dlq')
    .select('id, error_reason, source_actor', { count: 'exact' });

  // Aggregations
  type Raw = {
    post_id: string;
    profile_id: string | null;
    text: string | null;
    published_at: string;
    likes: number | null;
    comments: number | null;
    reposts: number | null;
    media_type: string | null;
  };
  type Clean = {
    post_id: string;
    engagement_score_normalized: number;
    topic_cluster_pre: string;
  };
  const rawArr = (rawRows ?? []) as Raw[];
  const cleanArr = (cleanRows ?? []) as Clean[];

  const cleanByPostId = new Map(cleanArr.map((c) => [c.post_id, c]));
  const rawByPostId = new Map(rawArr.map((r) => [r.post_id, r]));

  const byProfile = new Map<string, CountsByProfile>();
  for (const r of rawArr) {
    const k = r.profile_id ?? 'unknown';
    if (!byProfile.has(k)) byProfile.set(k, { raw: 0, clean: 0 });
    byProfile.get(k)!.raw += 1;
    if (cleanByPostId.has(r.post_id)) byProfile.get(k)!.clean += 1;
  }

  const clusters: ClusterDistribution = {
    pilotage: 0,
    commercial: 0,
    reglementaire: 0,
    operationnel: 0,
    tech_ia: 0,
    marche_assurance: 0,
    autre: 0,
  };
  for (const c of cleanArr) {
    const k = c.topic_cluster_pre as keyof ClusterDistribution;
    if (k in clusters) clusters[k] += 1;
  }

  // Top 5
  const top5 = cleanArr.slice(0, 5).map((c) => {
    const r = rawByPostId.get(c.post_id);
    return {
      post_id: c.post_id,
      score: Number(c.engagement_score_normalized.toFixed(3)),
      cluster: c.topic_cluster_pre,
      profile_id: r?.profile_id,
      published_at: r?.published_at,
      likes: r?.likes,
      comments: r?.comments,
      reposts: r?.reposts,
      preview: (r?.text ?? '').slice(0, 200),
    };
  });

  // Per-profile counts table
  const perProfile = (profiles ?? [])
    .map((p: { profile_id: string; nom: string }) => {
      const c = byProfile.get(p.profile_id) ?? { raw: 0, clean: 0 };
      return { profile_id: p.profile_id, nom: p.nom, raw: c.raw, clean: c.clean };
    })
    .sort((a, b) => b.raw - a.raw);

  process.stdout.write(
    `${JSON.stringify(
      {
        watchlist_active: profiles?.length ?? 0,
        totals: {
          raw_posts: rawArr.length,
          clean_posts: cleanArr.length,
          dlq_entries: dlqCount ?? 0,
        },
        per_profile: perProfile,
        cluster_distribution: clusters,
        dlq_breakdown: dlqRows,
        top_5_clean_posts: top5,
      },
      null,
      2,
    )}\n`,
  );

  logger.info(
    {
      raw: rawArr.length,
      clean: cleanArr.length,
      dlq: dlqCount,
    },
    'inspect_batch_done',
  );
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'inspect_batch_failed');
  process.exit(1);
});
