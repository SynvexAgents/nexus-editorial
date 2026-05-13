/**
 * test-collector
 *
 * CLI de validation manuelle de la chaîne Collect + Normalize.
 *
 *   pnpm --filter @nexus/scripts test-collector [-- --limit N] [-- --dry-run]
 *
 * Étapes :
 *   1. Lit les N premiers profils actifs de `profiles_watchlist`
 *      (N=5 par défaut, override via `--limit`).
 *   2. Appelle l'acteur Apify principal (`harvestapi/linkedin-profile-posts`)
 *      avec rotation vers les fallbacks en cas d'erreur.
 *   3. Map vers `raw_posts` (UPSERT idempotent par post_id).
 *   4. Lance `normalize()` sur les posts collectés.
 *   5. UPSERT dans `clean_posts` et `temporal_analysis`.
 *   6. Affiche le rapport synthétique : N collectés / M conservés / K rejetés
 *      avec breakdown des raisons + 3 top posts par engagement_score_normalized.
 *
 * Variables d'env requises :
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - APIFY_TOKEN
 *
 * Variables optionnelles :
 *   - APIFY_MAX_POSTS_PER_RUN (default 500)
 *   - LOG_LEVEL (default 'info')
 */

import { getMapperFor, toHourBucket, toParisDateParts } from '@nexus/n8n-nodes';
import { normalize } from '@nexus/n8n-nodes';
import {
  type ApifyPostNormalized,
  type RawPost,
  createNexusSupabaseClient,
  logger,
} from '@nexus/shared';

interface Args {
  limit: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number.parseInt(argv[limitIdx + 1] ?? '5', 10) : 5;
  const dryRun = argv.includes('--dry-run');
  return { limit, dryRun };
}

interface WatchlistProfile {
  profile_id: string;
  nom: string;
  audience_size_estimee: number | null;
}

interface ApifyRunResult {
  actor_id: string;
  raw_items: unknown[];
}

const ACTOR_CHAIN = [
  'harvestapi/linkedin-profile-posts',
  'harvestapi/linkedin-post-search',
  'apimaestro/linkedin-posts-search-scraper-no-cookies',
] as const;

const apifyActorPath = (actorId: string): string => actorId.replace('/', '~');

async function callApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
): Promise<unknown[]> {
  const url = `https://api.apify.com/v2/acts/${apifyActorPath(actorId)}/run-sync-get-dataset-items?token=${token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`apify_http_${res.status}`);
    }
    const data = (await res.json()) as unknown[];
    if (!Array.isArray(data)) throw new Error('apify_response_not_array');
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function runApifyWithFallback(
  profiles: WatchlistProfile[],
  token: string,
): Promise<ApifyRunResult> {
  const targetUrls = profiles.map((p) =>
    p.profile_id.startsWith('http') ? p.profile_id : `https://www.linkedin.com/in/${p.profile_id}/`,
  );
  const sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const inputByActor: Record<string, Record<string, unknown>> = {
    'harvestapi/linkedin-profile-posts': {
      targetUrls,
      maxPosts: 10,
      scrapeReactions: false,
      scrapeComments: true,
      maxComments: 5,
      postedLimitDate: sinceIso,
      includeQuotePosts: false,
      includeReposts: false,
    },
    'harvestapi/linkedin-post-search': {
      targetUrls,
      searchQueries: ['*'],
      maxPosts: 10,
      postedLimit: 'week',
    },
    'apimaestro/linkedin-posts-search-scraper-no-cookies': {
      keyword: 'assurance OR courtage OR sinistres',
      total_posts: 20,
    },
  };

  for (const actorId of ACTOR_CHAIN) {
    try {
      logger.info({ actor_id: actorId }, 'apify_actor_attempt');
      const items = await callApifyActor(actorId, inputByActor[actorId]!, token);
      if (items.length === 0) {
        logger.warn({ actor_id: actorId }, 'apify_actor_returned_empty');
        continue;
      }
      logger.info({ actor_id: actorId, count: items.length }, 'apify_actor_success');
      return { actor_id: actorId, raw_items: items };
    } catch (err) {
      logger.warn(
        { actor_id: actorId, err: err instanceof Error ? err.message : String(err) },
        'apify_actor_failed',
      );
    }
  }
  throw new Error('all_apify_actors_failed');
}

function toRawPostRow(post: ApifyPostNormalized, sourceActor: string): RawPost {
  const d = new Date(post.published_at);
  const parts = toParisDateParts(d);
  return {
    post_id: post.post_id,
    profile_id: post.author_id,
    published_at: d.toISOString(),
    day_of_week: parts.weekday,
    hour_of_day: parts.hour,
    text: post.text,
    media_type: post.media_type,
    likes: post.likes,
    comments: post.comments,
    reposts: post.reposts,
    views_estimees: post.views,
    url: post.url,
    comment_sample: post.comment_sample,
    source_actor: sourceActor,
  };
}

interface CollectorReport {
  collected: number;
  dlq: number;
  kept: number;
  rejected: number;
  rejected_breakdown: Record<string, number>;
  top_posts: Array<{ post_id: string; score: number; cluster: string }>;
  hour_bucket_summary: Record<string, number>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    throw new Error('APIFY_TOKEN is not set in env');
  }

  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'test-collector', limit: args.limit, dry_run: args.dryRun });

  log.info('start');

  // 1. Lire watchlist
  const { data: profiles, error: wlError } = await supabase
    .from('profiles_watchlist')
    .select('profile_id, nom, audience_size_estimee')
    .eq('is_active', true)
    .limit(args.limit)
    .returns<WatchlistProfile[]>();
  if (wlError) throw new Error(`watchlist_fetch_failed: ${wlError.message}`);
  if (!profiles || profiles.length === 0) {
    log.warn('watchlist_empty — nothing to collect');
    return;
  }
  log.info({ profiles_count: profiles.length }, 'watchlist_loaded');

  // 2. Apify avec fallback
  const apifyRun = await runApifyWithFallback(profiles, apifyToken);
  const mapper = getMapperFor(apifyRun.actor_id as Parameters<typeof getMapperFor>[0]);

  // 3. Mapping + DLQ tracking
  const rawPostRows: RawPost[] = [];
  const dlqEntries: Array<{ raw_payload: unknown; error_reason: string; source_actor: string }> =
    [];
  for (const item of apifyRun.raw_items) {
    const result = mapper(item);
    if (result.post) {
      rawPostRows.push(toRawPostRow(result.post, apifyRun.actor_id));
    } else {
      dlqEntries.push({
        raw_payload: item,
        error_reason: result.error_reason ?? 'unknown',
        source_actor: apifyRun.actor_id,
      });
    }
  }
  log.info({ mapped: rawPostRows.length, dlq: dlqEntries.length }, 'mapping_complete');

  if (args.dryRun) {
    log.info({ rawPostRows: rawPostRows.length }, 'dry_run_exit_before_db_writes');
    printReport({
      collected: rawPostRows.length,
      dlq: dlqEntries.length,
      kept: 0,
      rejected: 0,
      rejected_breakdown: {},
      top_posts: [],
      hour_bucket_summary: {},
    });
    return;
  }

  // 4. UPSERT raw_posts + DLQ
  if (rawPostRows.length > 0) {
    const { error } = await supabase
      .from('raw_posts')
      .upsert(rawPostRows as never, { onConflict: 'post_id' });
    if (error) throw new Error(`raw_posts_upsert_failed: ${error.message}`);
  }
  if (dlqEntries.length > 0) {
    const { error } = await supabase.from('raw_posts_dlq').insert(dlqEntries as never);
    if (error) log.warn({ msg: error.message }, 'dlq_insert_failed');
  }

  // 5. Lire baselines auteur (médiane glissante simplifiée : moyenne des 10
  //    derniers posts du même auteur dans raw_posts).
  const profileIds = profiles.map((p) => p.profile_id);
  const baselines = new Map<string, number>();
  for (const pid of profileIds) {
    const { data: lastPosts } = await supabase
      .from('raw_posts')
      .select('likes, comments, reposts')
      .eq('profile_id', pid)
      .order('published_at', { ascending: false })
      .limit(10)
      .returns<Array<{ likes: number; comments: number; reposts: number }>>();
    if (lastPosts && lastPosts.length > 0) {
      const values = lastPosts
        .map((p) => p.likes + p.comments * 3 + p.reposts * 5)
        .sort((a, b) => a - b);
      const median = values[Math.floor(values.length / 2)] ?? 1;
      baselines.set(pid, Math.max(median, 1));
    }
  }
  const followers = new Map<string, number>(
    profiles
      .filter((p) => p.audience_size_estimee != null)
      .map((p) => [p.profile_id, p.audience_size_estimee as number]),
  );

  // 6. Normaliser
  const normResult = normalize(rawPostRows, baselines, followers, {
    activeProfileIds: new Set(profileIds),
  });
  log.info(normResult.stats, 'normalize_complete');

  // 7. UPSERT clean_posts + temporal_analysis
  const cleanRows = normResult.clean_posts.map((c) => c.row);
  if (cleanRows.length > 0) {
    const { error } = await supabase
      .from('clean_posts')
      .upsert(cleanRows as never, { onConflict: 'post_id' });
    if (error) throw new Error(`clean_posts_upsert_failed: ${error.message}`);
  }
  if (normResult.temporal_rows.length > 0) {
    const { error } = await supabase
      .from('temporal_analysis')
      .upsert(normResult.temporal_rows as never, { onConflict: 'week_id,day_of_week,hour_bucket' });
    if (error) throw new Error(`temporal_upsert_failed: ${error.message}`);
  }

  // 8. Rapport synthétique
  const topPosts = [...normResult.clean_posts]
    .sort((a, b) => b.row.engagement_score_normalized - a.row.engagement_score_normalized)
    .slice(0, 3)
    .map((c) => ({
      post_id: c.row.post_id,
      score: Number(c.row.engagement_score_normalized.toFixed(3)),
      cluster: c.row.topic_cluster_pre,
    }));

  const hourBucketSummary: Record<string, number> = {};
  for (const r of rawPostRows) {
    const hb = toHourBucket(r.hour_of_day ?? 0);
    hourBucketSummary[hb] = (hourBucketSummary[hb] ?? 0) + 1;
  }

  printReport({
    collected: rawPostRows.length,
    dlq: dlqEntries.length,
    kept: normResult.stats.kept,
    rejected: normResult.stats.rejected,
    rejected_breakdown: normResult.stats.rejected_breakdown,
    top_posts: topPosts,
    hour_bucket_summary: hourBucketSummary,
  });
}

function printReport(r: CollectorReport): void {
  // Output non-pino pour lisibilité humaine en CLI. Le détail structuré
  // reste dans les logs pino plus haut.
  process.stdout.write('\n');
  process.stdout.write('========================================\n');
  process.stdout.write('   Nexus Editorial — test-collector\n');
  process.stdout.write('========================================\n');
  process.stdout.write(`Collected (raw_posts mapped) : ${r.collected}\n`);
  process.stdout.write(`DLQ (malformed payloads)     : ${r.dlq}\n`);
  process.stdout.write(`Kept after normalize         : ${r.kept}\n`);
  process.stdout.write(`Rejected                     : ${r.rejected}\n`);
  process.stdout.write('  breakdown:\n');
  for (const [k, v] of Object.entries(r.rejected_breakdown)) {
    process.stdout.write(`    - ${k.padEnd(24)} ${v}\n`);
  }
  process.stdout.write('Hour bucket distribution:\n');
  for (const [hb, n] of Object.entries(r.hour_bucket_summary)) {
    process.stdout.write(`    - ${hb.padEnd(10)} ${n}\n`);
  }
  process.stdout.write('Top 3 posts by engagement_score_normalized:\n');
  r.top_posts.forEach((p, i) => {
    process.stdout.write(`    ${i + 1}. ${p.post_id} | score=${p.score} | cluster=${p.cluster}\n`);
  });
  process.stdout.write('========================================\n\n');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'test_collector_failed');
  process.exit(1);
});
