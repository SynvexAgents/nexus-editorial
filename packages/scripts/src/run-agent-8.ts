/**
 * run-agent-8 — Agent 8 Visual Decision (Haiku 4.5).
 *
 * Lit weekly_reports.winners_json (3 posts), décide pour chaque post si
 * un visuel est pertinent + génère le gamma_prompt si oui. UPSERT dans
 * weekly_reports.visuals_json.
 *
 *   pnpm --filter @nexus/scripts run-agent-8 \
 *     [-- --week-id YYYY-Www] [-- --force] [-- --dry-run]
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import { decideVisuals, postProcessVisuals } from '@nexus/n8n-nodes';
import {
  type VisualDecision,
  type WeeklyWinners,
  createNexusSupabaseClient,
  logger,
} from '@nexus/shared';

interface Args {
  weekId: string | null;
  force: boolean;
  dryRun: boolean;
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

function parseArgs(argv: string[]): Args {
  const wIdx = argv.indexOf('--week-id');
  const weekId = wIdx >= 0 ? argv[wIdx + 1] ?? null : null;
  const force = argv.includes('--force');
  const dryRun = argv.includes('--dry-run');
  return { weekId, force, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'run-agent-8', ...args });
  const weekId = args.weekId ?? currentIsoWeek();

  log.info({ week_id: weekId }, 'agent_8_start');

  if (!args.force && !args.dryRun) {
    const { data: existing } = await supabase
      .from('weekly_reports')
      .select('week_id, visuals_json')
      .eq('week_id', weekId)
      .maybeSingle();
    if (existing && (existing as { visuals_json: unknown }).visuals_json) {
      process.stdout.write(
        `\nweek_id=${weekId} déjà avec visuals_json. Utilise --force pour ré-écraser. Exit.\n`,
      );
      log.info({ week_id: weekId }, 'already_has_visuals_skipping');
      return;
    }
  }

  // Charge winners.
  const { data: row } = await supabase
    .from('weekly_reports')
    .select('winners_json')
    .eq('week_id', weekId)
    .maybeSingle();
  const winners = (row as { winners_json: WeeklyWinners | null } | null)?.winners_json;
  if (!winners) {
    throw new Error(`winners_json missing for week_id=${weekId}. Run Agent 7 first.`);
  }

  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Agent 8 inputs ==========\n');
    process.stdout.write('Model           : claude-haiku-4-5\n');
    process.stdout.write(`Week ID         : ${weekId}\n`);
    process.stdout.write(`Winners en input: ${winners.length}\n\n`);
    for (const w of winners) {
      process.stdout.write(`Post ${w.post_position} (${w.winner_id}) — ${w.longueur_finale}c\n`);
      process.stdout.write(`${w.post_final.slice(0, 200)}...\n\n`);
    }
    process.stdout.write('No Anthropic call, no DB write. Dry-run exit.\n');
    process.stdout.write('===============================================\n\n');
    return;
  }

  const tStart = Date.now();
  let result: Awaited<ReturnType<typeof decideVisuals>>;
  try {
    result = await decideVisuals(winners, { logger: log });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_8_failed');
    process.stderr.write(`\nAgent 8 failed: ${msg}\n`);
    process.exit(1);
  }
  const elapsed = Date.now() - tStart;

  const postProcessed = postProcessVisuals(result.visuals);

  const { error: upErr } = await supabase.from('weekly_reports').upsert(
    {
      week_id: weekId,
      visuals_json: postProcessed.visuals as unknown as object,
      produced_at: new Date().toISOString(),
    } as never,
    { onConflict: 'week_id' },
  );
  if (upErr) throw new Error(`weekly_reports_upsert_failed: ${upErr.message}`);

  log.info(
    {
      week_id: weekId,
      duration_ms: elapsed,
      cost_eur: result.usage.cost_eur,
      retried: result.retried,
      overrides: postProcessed.validation_report.overrides.length,
      critical_flags: postProcessed.validation_report.critical_flags.length,
    },
    'agent_8_done',
  );

  // Rapport CLI.
  process.stdout.write('\n========== Agent 8 — Visual Decision ==========\n');
  process.stdout.write(`Week ID       : ${weekId}\n`);
  process.stdout.write(`Duration      : ${(elapsed / 1000).toFixed(1)}s\n`);
  process.stdout.write(
    `Tokens        : in=${result.usage.input_tokens} out=${result.usage.output_tokens} cache_w=${result.usage.cache_creation_input_tokens} cache_r=${result.usage.cache_read_input_tokens}\n`,
  );
  process.stdout.write(
    `Cost          : $${result.usage.cost_usd.toFixed(4)} (~€${result.usage.cost_eur.toFixed(4)})\n`,
  );
  process.stdout.write(`Retried       : ${result.retried ? 'OUI' : 'non'}\n\n`);

  process.stdout.write('--- Décisions visuelles ---\n');
  process.stdout.write(
    '| pos | recommended | visual_type      | visual_reason (extrait)                          |\n',
  );
  process.stdout.write(
    '|-----|-------------|------------------|--------------------------------------------------|\n',
  );
  for (const v of postProcessed.visuals) {
    const rec = v.visual_recommended ? 'OUI' : 'non';
    const type = v.visual_type.padEnd(16);
    const reason = v.visual_reason.slice(0, 48).padEnd(48);
    process.stdout.write(`|  ${v.post_position}  |     ${rec.padEnd(7)} | ${type} | ${reason} |\n`);
  }
  process.stdout.write('\n');

  // gamma_prompt complets pour les visuels recommandés.
  for (const v of postProcessed.visuals) {
    if (v.visual_recommended && v.gamma_prompt) {
      process.stdout.write(
        `--- Gamma prompt — post_position ${v.post_position} (${v.visual_type}) ---\n`,
      );
      process.stdout.write(`${v.gamma_prompt}\n\n`);
    }
  }

  printValidationReport(postProcessed.validation_report);

  process.stdout.write(
    `\nProjection prod (4 runs/mois) : ~€${(result.usage.cost_eur * 4).toFixed(2)}/mois\n\n`,
  );
  process.stdout.write('==================================================\n\n');
}

function printValidationReport(
  r: ReturnType<typeof postProcessVisuals>['validation_report'],
): void {
  process.stdout.write('--- Validation report ---\n');
  process.stdout.write(`Total visuals             : ${r.total_visuals}\n`);
  process.stdout.write(`Visual recommended count  : ${r.visual_recommended_count}\n`);
  process.stdout.write(`Overrides appliqués       : ${r.overrides.length}\n`);
  if (r.overrides.length > 0) {
    for (const o of r.overrides) {
      process.stdout.write(
        `  - pos ${o.post_position} ${o.field} : ${String(o.from)} → ${String(o.to)} (${o.reason})\n`,
      );
    }
  }
  if (r.critical_flags.length > 0) {
    process.stdout.write('⚠️ Flags critiques :\n');
    for (const f of r.critical_flags) {
      process.stdout.write(`  - ${f}\n`);
    }
  } else {
    process.stdout.write('Critical flags            : 0\n');
  }
  process.stdout.write('\n');
}

// Référence inutilisée intentionnelle pour garder l'import du type
// VisualDecision si on l'expose plus tard depuis ce fichier.
export type { VisualDecision };

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'run_agent_8_failed');
  process.exit(1);
});
