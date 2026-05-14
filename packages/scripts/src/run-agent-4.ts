/**
 * run-agent-4 — Agent 4 LinkedinTrends Synthesizer.
 *
 * Lit tous les post_analysis + clean_posts + temporal_analysis pour une
 * week_id donnée, construit l'input consolidé, appelle Claude Haiku 4.5
 * via synthesizeTrends(), valide Zod, UPSERT weekly_reports.linkedin_trends_json.
 *
 *   pnpm --filter @nexus/scripts run-agent-4 \
 *     [-- --week-id YYYY-Www] [-- --force] [-- --dry-run] [-- --min-posts N]
 *
 * Flags :
 *   --week-id YYYY-Www  (default : semaine ISO actuelle Europe/Paris)
 *   --force             (re-synthétise même si linkedin_trends_json existe)
 *   --dry-run           (affiche l'input consolidé sans appeler Anthropic)
 *   --min-posts N       (default 10, override garde-fou volume)
 *
 * Note : .env chargé via dotenv (cf. run-agent-3, workaround bug Node 24
 * --env-file sur ANTHROPIC_API_KEY).
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import {
  AGENT_4_SYSTEM_PROMPT_STATS,
  InsufficientVolumeError,
  type PostAnalysisEnriched,
  type TrendsInput,
  synthesizeTrends,
} from '@nexus/n8n-nodes';
import {
  type PostAnalysis,
  type TemporalRow,
  createNexusSupabaseClient,
  logger,
} from '@nexus/shared';

interface Args {
  weekId: string | null;
  force: boolean;
  dryRun: boolean;
  minPosts: number;
}

function currentIsoWeek(): string {
  const now = new Date();
  // Paris locale ISO week — same algorithm as packages/n8n-nodes/src/date-utils.ts
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function parseArgs(argv: string[]): Args {
  const wIdx = argv.indexOf('--week-id');
  const weekId = wIdx >= 0 ? argv[wIdx + 1] ?? null : null;
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  const mpIdx = argv.indexOf('--min-posts');
  const minPosts = mpIdx >= 0 ? Number.parseInt(argv[mpIdx + 1] ?? '10', 10) : 10;
  return { weekId, force, dryRun, minPosts };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'run-agent-4', ...args });

  log.info(
    {
      system_prompt_chars: AGENT_4_SYSTEM_PROMPT_STATS.characters,
      system_prompt_approx_tokens: AGENT_4_SYSTEM_PROMPT_STATS.approx_tokens,
    },
    'agent_4_start',
  );

  // 1. Résoudre week_id : flag explicite, sinon semaine ISO actuelle,
  //    sinon (si auto-détect demandé) la semaine avec le plus de post_analysis.
  let weekId = args.weekId ?? currentIsoWeek();

  // 2. Idempotence : si linkedin_trends_json existe déjà pour cette week_id
  //    et qu'on n'est PAS en --force, on skip.
  if (!args.force && !args.dryRun) {
    const { data: existing } = await supabase
      .from('weekly_reports')
      .select('week_id, linkedin_trends_json')
      .eq('week_id', weekId)
      .maybeSingle();
    if (existing && (existing as { linkedin_trends_json: unknown }).linkedin_trends_json) {
      process.stdout.write(
        `\nweek_id=${weekId} déjà synthétisé. Utilise --force pour ré-écraser. Exit.\n`,
      );
      log.info({ week_id: weekId }, 'already_synthesized_skipping');
      return;
    }
  }

  // 3. Charger les post_analysis de la semaine ciblée. Comme post_analysis
  //    ne porte pas directement la week_id, on passe par raw_posts.published_at.
  //    Stratégie pragmatique : on charge TOUTES les post_analysis qui ont un
  //    raw_posts.published_at dans la semaine ISO ciblée.
  const { data: paRows, error: paErr } = await supabase
    .from('post_analysis')
    .select('post_id, analysis_json, transferabilite_assurance')
    .returns<
      Array<{
        post_id: string;
        analysis_json: PostAnalysis;
        transferabilite_assurance: number | null;
      }>
    >();
  if (paErr) throw new Error(`post_analysis_fetch_failed: ${paErr.message}`);
  const allPostIds = (paRows ?? []).map((r) => r.post_id);

  if (allPostIds.length === 0) {
    process.stdout.write('Aucun post_analysis en base. Exit.\n');
    log.warn('no_post_analysis_in_db');
    process.exit(1);
  }

  const { data: rawRows, error: rawErr } = await supabase
    .from('raw_posts')
    .select(
      'post_id, profile_id, published_at, day_of_week, hour_of_day, text, media_type, likes, comments, reposts',
    )
    .in('post_id', allPostIds)
    .returns<
      Array<{
        post_id: string;
        profile_id: string | null;
        published_at: string;
        day_of_week: string | null;
        hour_of_day: number | null;
        text: string | null;
        media_type: string | null;
        likes: number | null;
        comments: number | null;
        reposts: number | null;
      }>
    >();
  if (rawErr) throw new Error(`raw_posts_fetch_failed: ${rawErr.message}`);

  const { data: cleanRows, error: cleanErr } = await supabase
    .from('clean_posts')
    .select('post_id, engagement_score_normalized')
    .in('post_id', allPostIds)
    .returns<Array<{ post_id: string; engagement_score_normalized: number }>>();
  if (cleanErr) throw new Error(`clean_posts_fetch_failed: ${cleanErr.message}`);

  // Calcule la week_id de chaque post (utilise day_of_week + published_at).
  // Pour simplifier, on dérive directement la semaine ISO à partir de published_at.
  function isoWeekForDate(d: Date): string {
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
    return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  const rawByPostId = new Map(
    (rawRows ?? []).map((r) => [
      r.post_id,
      { ...r, week_id: isoWeekForDate(new Date(r.published_at)) },
    ]),
  );
  const cleanByPostId = new Map((cleanRows ?? []).map((c) => [c.post_id, c]));

  // Si --week-id non spécifié, on auto-détecte la semaine avec le plus
  // de post_analysis (pratique en MVP où on n'a qu'une semaine de données).
  if (!args.weekId) {
    const byWeek = new Map<string, number>();
    for (const pa of paRows ?? []) {
      const raw = rawByPostId.get(pa.post_id);
      if (!raw) continue;
      byWeek.set(raw.week_id, (byWeek.get(raw.week_id) ?? 0) + 1);
    }
    const sortedWeeks = [...byWeek.entries()].sort((a, b) => b[1] - a[1]);
    if (sortedWeeks.length > 0 && sortedWeeks[0]![1] > 0) {
      const autoWeekId = sortedWeeks[0]![0];
      if (autoWeekId !== weekId) {
        log.info(
          { current_iso_week: weekId, auto_detected: autoWeekId, count: sortedWeeks[0]![1] },
          'auto_detected_week_with_most_posts',
        );
        weekId = autoWeekId;
      }
    }
  }

  log.info({ week_id: weekId, post_analyses_total_in_db: paRows?.length ?? 0 }, 'week_id_resolved');

  // Filtre par week_id cible.
  const postAnalysesEnriched: PostAnalysisEnriched[] = [];
  for (const pa of paRows ?? []) {
    const raw = rawByPostId.get(pa.post_id);
    if (!raw) continue;
    if (raw.week_id !== weekId) continue;
    const clean = cleanByPostId.get(pa.post_id);
    const score = clean?.engagement_score_normalized ?? 0;
    postAnalysesEnriched.push({
      analysis: pa.analysis_json,
      engagement_score_normalized: score,
      text_excerpt: (raw.text ?? '').slice(0, 300).replace(/\s+/g, ' '),
      media_type: raw.media_type ?? 'texte',
      likes: raw.likes ?? 0,
      comments: raw.comments ?? 0,
      reposts: raw.reposts ?? 0,
    });
  }

  // Charge temporal_rows pour la week_id.
  const { data: tempRows, error: tempErr } = await supabase
    .from('temporal_analysis')
    .select(
      'week_id, day_of_week, hour_bucket, posts_count, avg_engagement_norm, top_format, format_distribution',
    )
    .eq('week_id', weekId)
    .returns<TemporalRow[]>();
  if (tempErr) throw new Error(`temporal_analysis_fetch_failed: ${tempErr.message}`);

  const input: TrendsInput = {
    week_id: weekId,
    post_analyses: postAnalysesEnriched,
    temporal_rows: tempRows ?? [],
  };

  log.info(
    {
      week_id: weekId,
      post_analyses_in_window: postAnalysesEnriched.length,
      temporal_rows: input.temporal_rows.length,
    },
    'input_consolidated',
  );

  if (postAnalysesEnriched.length < args.minPosts) {
    process.stderr.write(
      `\nVolume insuffisant pour week_id=${weekId} : ${postAnalysesEnriched.length} < ${args.minPosts}\n`,
    );
    log.warn(
      { week_id: weekId, received: postAnalysesEnriched.length, required: args.minPosts },
      'insufficient_volume_skipping',
    );
    process.exit(1);
  }

  // 4. Dry-run : affiche input et exit.
  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Agent 4 inputs ==========\n');
    process.stdout.write('Model           : claude-haiku-4-5\n');
    process.stdout.write(
      `System prompt   : ${AGENT_4_SYSTEM_PROMPT_STATS.characters} chars, ~${AGENT_4_SYSTEM_PROMPT_STATS.approx_tokens} tokens\n`,
    );
    process.stdout.write(`week_id         : ${weekId}\n`);
    process.stdout.write(`post_analyses   : ${postAnalysesEnriched.length}\n`);
    process.stdout.write(`temporal_rows   : ${input.temporal_rows.length}\n\n`);
    // Diversité signal
    const hookSet = new Set(postAnalysesEnriched.map((p) => p.analysis.hook_type));
    const formatSet = new Set(postAnalysesEnriched.map((p) => p.analysis.format));
    const tonSet = new Set(postAnalysesEnriched.map((p) => p.analysis.ton));
    process.stdout.write(
      `Diversité       : hook_type=${hookSet.size} distinct, format=${formatSet.size}, ton=${tonSet.size}\n\n`,
    );
    process.stdout.write(
      'Aperçu des 3 premiers posts (analysis.hook_type | format | ton | score) :\n',
    );
    for (const p of postAnalysesEnriched.slice(0, 3)) {
      process.stdout.write(
        `  - ${p.analysis.post_id}  ${p.analysis.hook_type} | ${p.analysis.format} | ${p.analysis.ton} | score=${p.engagement_score_normalized.toFixed(3)}\n`,
      );
    }
    process.stdout.write('\nTemporal rows :\n');
    for (const t of input.temporal_rows) {
      process.stdout.write(
        `  ${t.week_id} ${t.day_of_week} ${t.hour_bucket} count=${t.posts_count} avg=${t.avg_engagement_norm?.toFixed?.(3) ?? '?'} top=${t.top_format}\n`,
      );
    }
    process.stdout.write('\nNo Anthropic call, no DB write. Dry-run exit.\n');
    process.stdout.write('================================================\n\n');
    return;
  }

  // 5. Synthèse réelle.
  const tStart = Date.now();
  let result: Awaited<ReturnType<typeof synthesizeTrends>>;
  try {
    result = await synthesizeTrends(input, { logger: log, minPosts: args.minPosts });
  } catch (err) {
    if (err instanceof InsufficientVolumeError) {
      process.stderr.write(`\nInsufficientVolume : ${err.message}\n`);
      log.warn(
        { received: err.received, required: err.required },
        'synthesize_trends_insufficient_volume',
      );
      process.exit(1);
    }
    throw err;
  }
  const elapsed = Date.now() - tStart;

  // 6. UPSERT weekly_reports.linkedin_trends_json
  const { error: upErr } = await supabase.from('weekly_reports').upsert(
    {
      week_id: weekId,
      linkedin_trends_json: result.trends as unknown as object,
      produced_at: new Date().toISOString(),
    } as never,
    { onConflict: 'week_id' },
  );
  if (upErr) throw new Error(`weekly_reports_upsert_failed: ${upErr.message}`);
  log.info(
    {
      week_id: weekId,
      duration_ms: elapsed,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      cost_usd: result.usage.cost_usd,
      retried: result.retried,
    },
    'trends_synthesized_and_upserted',
  );

  // 7. Rapport CLI
  const t = result.trends;
  process.stdout.write('\n========== Agent 4 — Trends synthesized ==========\n');
  process.stdout.write(`week_id        : ${weekId}\n`);
  process.stdout.write(`posts analyzed : ${postAnalysesEnriched.length}\n`);
  process.stdout.write(`duration       : ${(elapsed / 1000).toFixed(1)}s\n`);
  process.stdout.write(
    `tokens         : in=${result.usage.input_tokens} out=${result.usage.output_tokens}\n`,
  );
  process.stdout.write(
    `cost           : $${result.usage.cost_usd.toFixed(4)} (~€${result.usage.cost_eur.toFixed(4)})\n`,
  );
  process.stdout.write(`retried        : ${result.retried}\n\n`);

  process.stdout.write('--- Top 3 hooks (ordonnés par engagement) ---\n');
  for (const h of t.top_hooks.slice(0, 3)) {
    process.stdout.write(
      `  ${h.type.padEnd(20)} freq=${h.frequency} avg_engagement=${h.avg_engagement_norm.toFixed(2)} example=${h.example_post_id}\n`,
    );
  }
  process.stdout.write('\n--- Top 3 formats ---\n');
  for (const f of t.top_formats.slice(0, 3)) {
    process.stdout.write(
      `  ${f.format.padEnd(20)} freq=${f.frequency} avg_engagement=${f.avg_engagement_norm.toFixed(2)}\n`,
    );
  }
  process.stdout.write('\n--- Top 3 topic_clusters ---\n');
  for (const c of t.top_topic_clusters.slice(0, 3)) {
    process.stdout.write(
      `  ${c.cluster.padEnd(40)} freq=${c.frequency} avg_engagement=${c.avg_engagement_norm.toFixed(2)}\n`,
    );
  }
  process.stdout.write(`\nTone dominant : ${t.tone_dominant}\n`);
  process.stdout.write(`Longueur p50/p90 : ${t.longueur_optimale_p50_p90.join(' / ')}\n`);
  process.stdout.write(
    `Best day       : ${t.best_days_observed[0]?.day ?? '(none)'} (engagement=${t.best_days_observed[0]?.avg_engagement_norm?.toFixed(2) ?? '?'})\n`,
  );
  process.stdout.write(
    `Best hour      : ${t.best_hours_observed[0]?.hour_bucket ?? '(none)'} (engagement=${t.best_hours_observed[0]?.avg_engagement_norm?.toFixed(2) ?? '?'})\n`,
  );

  if (t.rising_topics.length > 0) {
    process.stdout.write(`\nRising topics  : ${t.rising_topics.join(', ')}\n`);
  }
  if (t.falling_topics.length > 0) {
    process.stdout.write(`Falling topics : ${t.falling_topics.join(', ')}\n`);
  }
  if (t.mecaniques_emergentes.length > 0) {
    process.stdout.write(`Mécaniques émergentes : ${t.mecaniques_emergentes.join(' | ')}\n`);
  }

  process.stdout.write('\n--- Ten best posts ---\n');
  for (const p of t.ten_best_posts) {
    process.stdout.write(`  ${p.post_id}  score=${p.score.toFixed(3)}\n`);
    process.stdout.write(`    → ${p.summary}\n`);
  }

  process.stdout.write('\n--- Synthèse textuelle ---\n');
  process.stdout.write(`${t.synthese_textuelle}\n`);
  process.stdout.write('====================================================\n\n');

  process.stdout.write(
    `Projection prod (50 posts/run × 4 runs/mois) : ~€${(result.usage.cost_eur * 4).toFixed(2)}/mois\n\n`,
  );
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'run_agent_4_failed');
  process.exit(1);
});
