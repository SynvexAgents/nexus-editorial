/**
 * run-agent-3 — Agent 3 Editorial Analyst.
 *
 * Lit les clean_posts qui n'ont pas encore d'entrée dans post_analysis
 * (sauf --force), call Anthropic Haiku 4.5 via @nexus/n8n-nodes/agents,
 * valide Zod, UPSERT post_analysis.
 *
 *   pnpm --filter @nexus/scripts run-agent-3 [-- --limit N] [-- --force] [-- --dry-run]
 *
 * Flags :
 *   --limit N    (default 10)
 *   --force      réanalyse les posts déjà dans post_analysis
 *   --dry-run    affiche les inputs préparés, sans appeler Anthropic ni écrire DB
 *
 * Stats finales : N analysés, M réussis, K erreurs, coût total €,
 * breakdown hook_type / format / ton.
 *
 * Note : on charge .env via `dotenv` plutôt que `tsx --env-file` parce que
 * le parser natif Node 24 a un bug silencieux sur certaines valeurs longues
 * (cas observé : `ANTHROPIC_API_KEY` chargée comme chaîne vide alors que
 * la ligne du .env est bien formée). dotenv est plus tolérant.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import { SYSTEM_PROMPT_STATS, analyzePost } from '@nexus/n8n-nodes';
import {
  type CleanPost,
  type PostAnalysis,
  type RawPost,
  createNexusSupabaseClient,
  logger,
} from '@nexus/shared';

interface Args {
  limit: number;
  force: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const limitIdx = argv.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number.parseInt(argv[limitIdx + 1] ?? '10', 10) : 10;
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  return { limit, force, dryRun };
}

interface PerPostStat {
  post_id: string;
  ok: boolean;
  error?: string;
  duration_ms?: number;
  cost_eur?: number;
  hook_type?: PostAnalysis['hook_type'];
  format?: PostAnalysis['format'];
  ton?: PostAnalysis['ton'];
  transferabilite_assurance?: number;
  retried?: boolean;
}

interface RunReport {
  total_in: number;
  succeeded: number;
  failed: number;
  duration_total_ms: number;
  cost_total_eur: number;
  cost_total_usd: number;
  cost_avg_per_post_eur: number;
  hook_type_breakdown: Record<string, number>;
  format_breakdown: Record<string, number>;
  ton_breakdown: Record<string, number>;
  transferabilite_distribution: { min: number; max: number; median: number };
  per_post: PerPostStat[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'run-agent-3', ...args });

  log.info(
    {
      system_prompt_chars: SYSTEM_PROMPT_STATS.characters,
      system_prompt_approx_tokens: SYSTEM_PROMPT_STATS.approx_tokens,
    },
    'agent_3_start',
  );

  // 1. Identifier les post_id à analyser.
  let targetPostIds: string[];
  if (args.force) {
    const { data, error } = await supabase
      .from('clean_posts')
      .select('post_id')
      .eq('is_relevant', true)
      .limit(args.limit)
      .returns<Array<{ post_id: string }>>();
    if (error) throw new Error(`clean_posts_fetch_failed: ${error.message}`);
    targetPostIds = (data ?? []).map((r) => r.post_id);
  } else {
    // clean_posts NOT IN (SELECT post_id FROM post_analysis)
    const { data: alreadyAnalyzed } = await supabase
      .from('post_analysis')
      .select('post_id')
      .returns<Array<{ post_id: string }>>();
    const analyzedSet = new Set((alreadyAnalyzed ?? []).map((r) => r.post_id));
    const { data: cleanAll, error } = await supabase
      .from('clean_posts')
      .select('post_id')
      .eq('is_relevant', true)
      .order('engagement_score_normalized', { ascending: false })
      .limit(args.limit + analyzedSet.size)
      .returns<Array<{ post_id: string }>>();
    if (error) throw new Error(`clean_posts_fetch_failed: ${error.message}`);
    targetPostIds = (cleanAll ?? [])
      .map((r) => r.post_id)
      .filter((id) => !analyzedSet.has(id))
      .slice(0, args.limit);
  }

  if (targetPostIds.length === 0) {
    process.stdout.write('No posts to analyze.\n');
    log.info('no_posts_to_analyze');
    return;
  }
  log.info({ count: targetPostIds.length }, 'targets_resolved');

  // 2. Fetch clean_post + raw_post pour chaque cible.
  const { data: cleanRows } = await supabase
    .from('clean_posts')
    .select('post_id, engagement_score_normalized, is_relevant, topic_cluster_pre, filter_reason')
    .in('post_id', targetPostIds)
    .returns<CleanPost[]>();
  const { data: rawRows } = await supabase
    .from('raw_posts')
    .select('*')
    .in('post_id', targetPostIds)
    .returns<RawPost[]>();
  const cleanByPostId = new Map<string, CleanPost>((cleanRows ?? []).map((c) => [c.post_id, c]));
  const rawByPostId = new Map<string, RawPost>((rawRows ?? []).map((r) => [r.post_id, r]));

  // 3. Dry-run : affiche les inputs et exit.
  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Agent 3 inputs ==========\n');
    process.stdout.write('Model           : claude-haiku-4-5\n');
    process.stdout.write(
      `System prompt   : ${SYSTEM_PROMPT_STATS.characters} chars, ~${SYSTEM_PROMPT_STATS.approx_tokens} tokens\n`,
    );
    process.stdout.write(`Posts to analyze: ${targetPostIds.length}\n\n`);
    for (const postId of targetPostIds.slice(0, 3)) {
      const clean = cleanByPostId.get(postId);
      const raw = rawByPostId.get(postId);
      if (!clean || !raw) continue;
      process.stdout.write(`--- ${postId} ---\n`);
      process.stdout.write(`profile_id   : ${raw.profile_id}\n`);
      process.stdout.write(
        `engagement   : ${clean.engagement_score_normalized.toFixed(3)} (L${raw.likes}/C${raw.comments}/R${raw.reposts})\n`,
      );
      process.stdout.write(`topic_pre    : ${clean.topic_cluster_pre}\n`);
      process.stdout.write(
        `text preview : ${(raw.text ?? '').slice(0, 250).replace(/\s+/g, ' ')}...\n\n`,
      );
    }
    if (targetPostIds.length > 3) {
      process.stdout.write(
        `(${targetPostIds.length - 3} autres posts non affichés en dry-run)\n\n`,
      );
    }
    process.stdout.write('No Anthropic call, no DB write. Dry-run exit.\n');
    process.stdout.write('===============================================\n\n');
    return;
  }

  // 4. Run réel : analyse chaque post.
  const perPost: PerPostStat[] = [];
  const t0 = Date.now();
  let costTotalUsd = 0;
  for (const postId of targetPostIds) {
    const clean = cleanByPostId.get(postId);
    const raw = rawByPostId.get(postId);
    if (!clean || !raw) {
      perPost.push({ post_id: postId, ok: false, error: 'clean_or_raw_not_found' });
      continue;
    }
    const tStart = Date.now();
    try {
      const result = await analyzePost(clean, raw, { logger: log });
      const elapsed = Date.now() - tStart;
      costTotalUsd += result.usage.cost_usd;
      // UPSERT post_analysis
      const { error } = await supabase.from('post_analysis').upsert(
        {
          post_id: result.analysis.post_id,
          analysis_json: result.analysis as unknown as object,
          transferabilite_assurance: result.analysis.transferabilite_assurance,
        } as never,
        { onConflict: 'post_id' },
      );
      if (error) {
        perPost.push({
          post_id: postId,
          ok: false,
          error: `upsert_failed: ${error.message}`,
          duration_ms: elapsed,
        });
        log.error({ post_id: postId, msg: error.message }, 'post_analysis_upsert_failed');
        continue;
      }
      perPost.push({
        post_id: postId,
        ok: true,
        duration_ms: elapsed,
        cost_eur: result.usage.cost_eur,
        hook_type: result.analysis.hook_type,
        format: result.analysis.format,
        ton: result.analysis.ton,
        transferabilite_assurance: result.analysis.transferabilite_assurance,
        retried: result.retried,
      });
      log.info(
        {
          post_id: postId,
          duration_ms: elapsed,
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
          cost_usd: result.usage.cost_usd,
          hook_type: result.analysis.hook_type,
          transferabilite_assurance: result.analysis.transferabilite_assurance,
          retried: result.retried,
        },
        'post_analyzed',
      );
    } catch (err) {
      const elapsed = Date.now() - tStart;
      const msg = err instanceof Error ? err.message : String(err);
      perPost.push({ post_id: postId, ok: false, error: msg, duration_ms: elapsed });
      log.error({ post_id: postId, err: msg }, 'analyze_post_failed');
    }
  }
  const tTotal = Date.now() - t0;

  // 5. Stats agrégées
  const succeeded = perPost.filter((p) => p.ok);
  const failed = perPost.filter((p) => !p.ok);
  const hookCounts: Record<string, number> = {};
  const formatCounts: Record<string, number> = {};
  const tonCounts: Record<string, number> = {};
  const transferabilites: number[] = [];
  for (const p of succeeded) {
    if (p.hook_type) hookCounts[p.hook_type] = (hookCounts[p.hook_type] ?? 0) + 1;
    if (p.format) formatCounts[p.format] = (formatCounts[p.format] ?? 0) + 1;
    if (p.ton) tonCounts[p.ton] = (tonCounts[p.ton] ?? 0) + 1;
    if (p.transferabilite_assurance !== undefined)
      transferabilites.push(p.transferabilite_assurance);
  }

  const report: RunReport = {
    total_in: targetPostIds.length,
    succeeded: succeeded.length,
    failed: failed.length,
    duration_total_ms: tTotal,
    cost_total_usd: costTotalUsd,
    cost_total_eur: costTotalUsd * 0.92,
    cost_avg_per_post_eur: succeeded.length > 0 ? (costTotalUsd * 0.92) / succeeded.length : 0,
    hook_type_breakdown: hookCounts,
    format_breakdown: formatCounts,
    ton_breakdown: tonCounts,
    transferabilite_distribution: {
      min: transferabilites.length > 0 ? Math.min(...transferabilites) : 0,
      max: transferabilites.length > 0 ? Math.max(...transferabilites) : 0,
      median: median(transferabilites),
    },
    per_post: perPost,
  };

  // 6. Print summary
  process.stdout.write('\n========== Agent 3 — Run report ==========\n');
  process.stdout.write(`Total in       : ${report.total_in}\n`);
  process.stdout.write(`Succeeded      : ${report.succeeded}\n`);
  process.stdout.write(`Failed         : ${report.failed}\n`);
  process.stdout.write(`Duration total : ${(tTotal / 1000).toFixed(1)}s\n`);
  process.stdout.write(
    `Cost total     : $${costTotalUsd.toFixed(4)} (~€${report.cost_total_eur.toFixed(4)})\n`,
  );
  process.stdout.write(`Cost per post  : ~€${report.cost_avg_per_post_eur.toFixed(4)}\n`);
  process.stdout.write(`\nHook types  : ${JSON.stringify(report.hook_type_breakdown)}\n`);
  process.stdout.write(`Formats     : ${JSON.stringify(report.format_breakdown)}\n`);
  process.stdout.write(`Tons        : ${JSON.stringify(report.ton_breakdown)}\n`);
  process.stdout.write(
    `Transferabilite assurance distribution : min=${report.transferabilite_distribution.min}, median=${report.transferabilite_distribution.median}, max=${report.transferabilite_distribution.max}\n`,
  );
  if (failed.length > 0) {
    process.stdout.write('\nFailed posts :\n');
    for (const f of failed) {
      process.stdout.write(`  - ${f.post_id} : ${f.error}\n`);
    }
  }
  process.stdout.write(
    `\nProjection prod (50 posts/run) : ~€${(report.cost_avg_per_post_eur * 50 || 0).toFixed(2)}/run, ~€${(report.cost_avg_per_post_eur * 50 * 4 || 0).toFixed(2)}/mois (4 runs)\n`,
  );
  process.stdout.write('============================================\n\n');

  log.info(
    {
      total_in: report.total_in,
      succeeded: report.succeeded,
      failed: report.failed,
      cost_eur: report.cost_total_eur,
    },
    'agent_3_done',
  );
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'run_agent_3_failed');
  process.exit(1);
});
