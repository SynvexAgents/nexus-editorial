/**
 * run-agent-5 — Agent 5 InsuranceTrendsSynthesizer.
 *
 * Lance 7 appels Perplexity Sonar Pro en parallèle (un par cluster
 * thématique assurance), valide Zod par item, vérifie HTTP des sources,
 * post-traite déterministe (dedup + sort + slice + synthèse + actualites
 * majeures), UPSERT weekly_reports.insurance_trends_json.
 *
 *   pnpm --filter @nexus/scripts run-agent-5 \
 *     [-- --week-id YYYY-Www] [-- --force] [-- --dry-run] [-- --cluster ID]
 *
 * Note : .env chargé via dotenv (workaround bug Node 24 --env-file sur
 * certaines clés longues, cf. run-agent-3/run-agent-4).
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import {
  CLUSTERS,
  CLUSTERS_BY_ID,
  type ClusterId,
  synthesizeInsuranceTrends,
} from '@nexus/n8n-nodes';
import { createNexusSupabaseClient, logger } from '@nexus/shared';

interface Args {
  weekId: string | null;
  force: boolean;
  dryRun: boolean;
  cluster: ClusterId | null;
}

function currentIsoWeek(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function isoWeekToDateRange(weekId: string): { date_start: string; date_end: string } {
  // weekId format: YYYY-Www
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) throw new Error(`invalid_week_id: ${weekId}`);
  const year = Number.parseInt(match[1]!, 10);
  const week = Number.parseInt(match[2]!, 10);
  // ISO 8601 : la semaine 1 contient le 4 janvier
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const targetSunday = new Date(targetMonday);
  targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);
  const fmt = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { date_start: fmt(targetMonday), date_end: fmt(targetSunday) };
}

function parseArgs(argv: string[]): Args {
  const wIdx = argv.indexOf('--week-id');
  const weekId = wIdx >= 0 ? argv[wIdx + 1] ?? null : null;
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  const cIdx = argv.indexOf('--cluster');
  const clusterRaw = cIdx >= 0 ? argv[cIdx + 1] ?? null : null;
  let cluster: ClusterId | null = null;
  if (clusterRaw) {
    if (!CLUSTERS_BY_ID.has(clusterRaw as ClusterId)) {
      const valid = [...CLUSTERS_BY_ID.keys()].join(', ');
      throw new Error(`unknown_cluster: "${clusterRaw}". Valid: ${valid}`);
    }
    cluster = clusterRaw as ClusterId;
  }
  return { weekId, force, dryRun, cluster };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'run-agent-5', ...args });
  const weekId = args.weekId ?? currentIsoWeek();
  const range = isoWeekToDateRange(weekId);

  log.info({ week_id: weekId, range, cluster: args.cluster }, 'agent_5_start');

  // Idempotence : si déjà en base et pas --force, skip.
  if (!args.force && !args.dryRun) {
    const { data: existing } = await supabase
      .from('weekly_reports')
      .select('week_id, insurance_trends_json')
      .eq('week_id', weekId)
      .maybeSingle();
    if (existing && (existing as { insurance_trends_json: unknown }).insurance_trends_json) {
      process.stdout.write(
        `\nweek_id=${weekId} déjà synthétisé (insurance_trends_json présent). Utilise --force pour ré-écraser. Exit.\n`,
      );
      log.info({ week_id: weekId }, 'already_synthesized_skipping');
      return;
    }
  }

  // Dry-run : affiche les 7 prompts construits et exit.
  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Agent 5 inputs ==========\n');
    process.stdout.write('Model           : sonar-pro\n');
    process.stdout.write(`week_id         : ${weekId}\n`);
    process.stdout.write(`Range           : ${range.date_start} → ${range.date_end}\n`);
    const targetClusters = args.cluster ? [CLUSTERS_BY_ID.get(args.cluster)!] : CLUSTERS;
    process.stdout.write(`Clusters        : ${targetClusters.length}\n\n`);
    for (const c of targetClusters) {
      const prompt = c.query_builder(range);
      process.stdout.write(`--- Cluster ${c.id} (${c.label}) ---\n`);
      process.stdout.write(`${prompt.slice(0, 600)}...\n\n`);
    }
    process.stdout.write('No Perplexity call, no DB write. Dry-run exit.\n');
    process.stdout.write('================================================\n\n');
    return;
  }

  // Run réel.
  const tStart = Date.now();
  let result: Awaited<ReturnType<typeof synthesizeInsuranceTrends>>;
  try {
    result = await synthesizeInsuranceTrends(weekId, range, {
      logger: log,
      ...(args.cluster ? { onlyCluster: args.cluster } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_5_failed');
    process.stderr.write(`\nAgent 5 failed: ${msg}\n`);
    process.exit(1);
  }
  const elapsed = Date.now() - tStart;

  // UPSERT weekly_reports.insurance_trends_json
  const { error: upErr } = await supabase.from('weekly_reports').upsert(
    {
      week_id: weekId,
      insurance_trends_json: result.trends as unknown as object,
      produced_at: new Date().toISOString(),
    } as never,
    { onConflict: 'week_id' },
  );
  if (upErr) throw new Error(`weekly_reports_upsert_failed: ${upErr.message}`);

  log.info(
    {
      week_id: weekId,
      duration_ms: elapsed,
      total_cost_usd: result.usage.total_cost_usd,
      total_kept: result.post_process_stats.total_kept,
      failed_clusters: result.post_process_stats.failed_clusters,
    },
    'agent_5_done',
  );

  // Rapport CLI
  process.stdout.write('\n========== Agent 5 — Insurance Trends ==========\n');
  process.stdout.write(`week_id        : ${weekId}\n`);
  process.stdout.write(`range          : ${range.date_start} → ${range.date_end}\n`);
  process.stdout.write(`duration       : ${(elapsed / 1000).toFixed(1)}s\n`);
  process.stdout.write(
    `tokens         : in=${result.usage.total_input_tokens} out=${result.usage.total_output_tokens}\n`,
  );
  process.stdout.write(
    `cost           : $${result.usage.total_cost_usd.toFixed(4)} (~€${result.usage.total_cost_eur.toFixed(4)})\n\n`,
  );

  // Table par cluster
  process.stdout.write(
    '| Cluster                       | items_reçus | url_rejected | zod_rejected | items_kept | cost  |\n',
  );
  process.stdout.write(
    '|-------------------------------|-------------|--------------|--------------|------------|-------|\n',
  );
  for (const c of CLUSTERS) {
    const stat = result.per_cluster.find((p) => p.cluster_id === c.id);
    if (!stat) continue;
    const kept = result.post_process_stats.kept_by_cluster[c.id];
    const label = c.label.padEnd(30);
    const r = String(stat.raw_items_returned).padStart(11);
    const ur = String(stat.url_rejected).padStart(12);
    const zr = String(stat.zod_rejected).padStart(12);
    const k = String(kept).padStart(10);
    const cost = `$${stat.cost_usd.toFixed(3)}`.padStart(5);
    process.stdout.write(`| ${label}| ${r} | ${ur} | ${zr} | ${k} | ${cost} |\n`);
  }

  process.stdout.write(
    `\nDedup cross-cluster: ${result.post_process_stats.dedup_drops} items droppés\n`,
  );
  process.stdout.write(`Date normalizations: ${result.post_process_stats.date_normalizations}\n`);
  if (result.post_process_stats.failed_clusters.length > 0) {
    process.stdout.write(
      `Clusters en échec  : ${result.post_process_stats.failed_clusters.join(', ')}\n`,
    );
  }

  if (result.trends.actualites_majeures.length > 0) {
    process.stdout.write('\n--- Top items actualites_majeures ---\n');
    for (const item of result.trends.actualites_majeures) {
      process.stdout.write(`  ${item.date.slice(0, 10)}  ${item.titre}\n`);
      process.stdout.write(`    ${item.source_url}\n`);
      process.stdout.write(`    → ${item.impact_metier}\n`);
    }
  }

  process.stdout.write('\n--- Synthèse textuelle ---\n');
  process.stdout.write(`${result.trends.synthese_textuelle}\n`);
  process.stdout.write('=================================================\n\n');

  process.stdout.write(
    `Projection prod (4 runs/mois) : ~€${(result.usage.total_cost_eur * 4).toFixed(2)}/mois\n\n`,
  );
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'run_agent_5_failed');
  process.exit(1);
});
