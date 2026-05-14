/**
 * run-agent-9 — Agent 9 Timing Recommendation (déterministe).
 *
 * Lit weekly_reports.winners_json + linkedin_trends_json. Pour chacun des
 * 3 winners, calcule jour + heure + confidence + alternative_slot.
 * UPSERT dans weekly_reports.timing_json.
 *
 * Pas de LLM. Pas de coût Anthropic. Durée < 100ms.
 *
 *   pnpm --filter @nexus/scripts run-agent-9 \
 *     [-- --week-id YYYY-Www] [-- --force] [-- --dry-run]
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import { recommendTiming } from '@nexus/n8n-nodes';
import {
  type LinkedinTrends,
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
  const log = logger.child({ run: 'run-agent-9', ...args });
  const weekId = args.weekId ?? currentIsoWeek();

  log.info({ week_id: weekId }, 'agent_9_start');

  if (!args.force && !args.dryRun) {
    const { data: existing } = await supabase
      .from('weekly_reports')
      .select('week_id, timing_json')
      .eq('week_id', weekId)
      .maybeSingle();
    if (existing && (existing as { timing_json: unknown }).timing_json) {
      process.stdout.write(
        `\nweek_id=${weekId} déjà avec timing_json. Utilise --force pour ré-écraser. Exit.\n`,
      );
      log.info({ week_id: weekId }, 'already_has_timing_skipping');
      return;
    }
  }

  // Charge inputs.
  const { data: row } = await supabase
    .from('weekly_reports')
    .select('winners_json, linkedin_trends_json')
    .eq('week_id', weekId)
    .maybeSingle();
  type Row = {
    winners_json: WeeklyWinners | null;
    linkedin_trends_json: LinkedinTrends | null;
  };
  const r = row as Row | null;
  if (!r?.winners_json) {
    throw new Error(`winners_json missing for week_id=${weekId}. Run Agent 7 first.`);
  }
  if (!r.linkedin_trends_json) {
    throw new Error(`linkedin_trends_json missing for week_id=${weekId}. Run Agent 4 first.`);
  }

  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Agent 9 inputs ==========\n');
    process.stdout.write(`Week ID         : ${weekId}\n`);
    process.stdout.write(`Winners en input: ${r.winners_json.length}\n`);
    process.stdout.write(
      `best_days_observed : ${(r.linkedin_trends_json.best_days_observed ?? []).length} entrées\n`,
    );
    process.stdout.write(
      `best_hours_observed: ${(r.linkedin_trends_json.best_hours_observed ?? []).length} entrées\n`,
    );
    process.stdout.write('\nNo DB write. Dry-run exit.\n');
    process.stdout.write('===============================================\n\n');
    return;
  }

  const tStart = Date.now();
  const result = recommendTiming(r.winners_json, r.linkedin_trends_json);
  const elapsed = Date.now() - tStart;

  const { error: upErr } = await supabase.from('weekly_reports').upsert(
    {
      week_id: weekId,
      timing_json: result.timing as unknown as object,
      produced_at: new Date().toISOString(),
    } as never,
    { onConflict: 'week_id' },
  );
  if (upErr) throw new Error(`weekly_reports_upsert_failed: ${upErr.message}`);

  log.info(
    {
      week_id: weekId,
      duration_ms: elapsed,
      fallback_used: result.stats.fallback_used,
      collisions_resolved: result.stats.collisions_resolved,
    },
    'agent_9_done',
  );

  process.stdout.write('\n========== Agent 9 — Timing Recommendation ==========\n');
  process.stdout.write(`Week ID       : ${weekId}\n`);
  process.stdout.write(`Duration      : ${elapsed}ms (déterministe, pas de LLM)\n`);
  process.stdout.write('Coût          : €0 (TS pur)\n');
  process.stdout.write(
    `Fallback palette : ${result.stats.fallback_used ? 'OUI' : 'non'} | Collisions résolues : ${result.stats.collisions_resolved}\n\n`,
  );

  process.stdout.write('--- Créneaux recommandés ---\n');
  process.stdout.write(
    '| pos | day | hour  | confidence | alternative   | rationale (extrait)                              |\n',
  );
  process.stdout.write(
    '|-----|-----|-------|------------|---------------|--------------------------------------------------|\n',
  );
  for (const t of result.timing) {
    const day = t.day_recommended.padEnd(3);
    const hour = t.hour_recommended.padEnd(5);
    const conf = t.confidence.toFixed(2).padStart(10);
    const alt = `${t.alternative_slot.day} ${t.alternative_slot.hour}`.padEnd(13);
    const rationale = t.rationale.slice(0, 48).padEnd(48);
    process.stdout.write(
      `|  ${t.post_position}  | ${day} | ${hour} | ${conf} | ${alt} | ${rationale} |\n`,
    );
  }

  // Anti-collision check explicite.
  const usedSlots = new Set<string>();
  let collision = false;
  for (const t of result.timing) {
    const key = `${t.day_recommended}|${t.hour_recommended}`;
    if (usedSlots.has(key)) collision = true;
    usedSlots.add(key);
  }
  process.stdout.write(
    `\nAnti-collision : ${collision ? '✗ COLLISION DÉTECTÉE' : '✓ aucun overlap'}\n`,
  );

  // Détail rationales complets.
  process.stdout.write('\n--- Rationales complets ---\n');
  for (const t of result.timing) {
    process.stdout.write(`  position ${t.post_position} : ${t.rationale}\n`);
  }
  process.stdout.write('=====================================================\n\n');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'run_agent_9_failed');
  process.exit(1);
});
