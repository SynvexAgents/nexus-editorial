/**
 * run-agent-7 — Agent 7 Editorial Director & Winners Selector.
 *
 * Lit angles_json + linkedin_trends_json + insurance_trends_json depuis
 * weekly_reports, sélectionne 3 winners complémentaires et rédige les 3
 * posts LinkedIn finaux via Claude Opus 4.7. Validation Zod stricte +
 * post-processing déterministe (vérification claims auto-check, lexique
 * banni, mentions Synvex, complémentarité, longueur réelle).
 *
 *   pnpm --filter @nexus/scripts run-agent-7 \
 *     [-- --week-id YYYY-Www] [-- --force] [-- --dry-run]
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import {
  AGENT_7_SYSTEM_PROMPT_STATS,
  type WinnersInput,
  postProcessWinners,
  selectAndWriteWinners,
} from '@nexus/n8n-nodes';
import {
  type InsuranceTrends,
  type LinkedinTrends,
  type WeeklyAngles,
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
  const log = logger.child({ run: 'run-agent-7', ...args });
  const weekId = args.weekId ?? currentIsoWeek();

  log.info(
    {
      week_id: weekId,
      system_prompt_chars: AGENT_7_SYSTEM_PROMPT_STATS.characters,
      system_prompt_approx_tokens: AGENT_7_SYSTEM_PROMPT_STATS.approx_tokens,
    },
    'agent_7_start',
  );

  // Idempotence.
  if (!args.force && !args.dryRun) {
    const { data: existing } = await supabase
      .from('weekly_reports')
      .select('week_id, winners_json')
      .eq('week_id', weekId)
      .maybeSingle();
    if (existing && (existing as { winners_json: unknown }).winners_json) {
      process.stdout.write(
        `\nweek_id=${weekId} déjà avec winners_json. Utilise --force pour ré-écraser. Exit.\n`,
      );
      log.info({ week_id: weekId }, 'already_has_winners_skipping');
      return;
    }
  }

  // Charge les 3 inputs.
  const { data: row } = await supabase
    .from('weekly_reports')
    .select('angles_json, linkedin_trends_json, insurance_trends_json')
    .eq('week_id', weekId)
    .maybeSingle();
  type Row = {
    angles_json: WeeklyAngles | null;
    linkedin_trends_json: LinkedinTrends | null;
    insurance_trends_json: InsuranceTrends | null;
  };
  const r = row as Row | null;
  if (!r?.angles_json) {
    throw new Error(`angles_json missing for week_id=${weekId}. Run Agent 6 first.`);
  }
  if (!r.linkedin_trends_json) {
    throw new Error(`linkedin_trends_json missing for week_id=${weekId}. Run Agent 4 first.`);
  }
  if (!r.insurance_trends_json) {
    throw new Error(`insurance_trends_json missing for week_id=${weekId}. Run Agent 5 first.`);
  }

  // Insurance fallback : si W{n} insurance est techniquement présent mais
  // vide (total items = 0), on prend la semaine la plus récente non-vide.
  // Cohérent avec Agent 6 et nécessaire pour que les posts soient ancrés
  // actu.
  let insuranceTrends = r.insurance_trends_json;
  let insuranceSourceWeek = weekId;
  const totalInsuranceItems =
    (insuranceTrends.regulation_acpr?.length ?? 0) +
    (insuranceTrends.sinistres_fraude?.length ?? 0) +
    (insuranceTrends.courtage_distribution?.length ?? 0) +
    (insuranceTrends.mutuelles_complementaires?.length ?? 0) +
    (insuranceTrends.insurtech_ia_assurance?.length ?? 0) +
    (insuranceTrends.back_office_productivite?.length ?? 0) +
    (insuranceTrends.signaux_faibles?.length ?? 0) +
    (insuranceTrends.actualites_majeures?.length ?? 0);
  if (totalInsuranceItems === 0) {
    log.warn({ week_id: weekId }, 'insurance_trends_empty_searching_fallback');
    const { data: recent } = await supabase
      .from('weekly_reports')
      .select('week_id, insurance_trends_json')
      .not('insurance_trends_json', 'is', null)
      .lt('week_id', weekId)
      .order('week_id', { ascending: false })
      .limit(4)
      .returns<Array<{ week_id: string; insurance_trends_json: InsuranceTrends | null }>>();
    for (const row of recent ?? []) {
      const t = row.insurance_trends_json;
      if (!t) continue;
      const total =
        (t.regulation_acpr?.length ?? 0) +
        (t.sinistres_fraude?.length ?? 0) +
        (t.courtage_distribution?.length ?? 0) +
        (t.mutuelles_complementaires?.length ?? 0) +
        (t.insurtech_ia_assurance?.length ?? 0) +
        (t.back_office_productivite?.length ?? 0) +
        (t.signaux_faibles?.length ?? 0) +
        (t.actualites_majeures?.length ?? 0);
      if (total > 0) {
        insuranceTrends = t;
        insuranceSourceWeek = row.week_id;
        log.warn(
          { week_id: weekId, fallback_week: row.week_id },
          'insurance_trends_fallback_to_previous_week',
        );
        break;
      }
    }
  }
  if (insuranceSourceWeek !== weekId) {
    process.stdout.write(
      `[fallback] insurance_trends pris sur ${insuranceSourceWeek} (${weekId} vide).\n`,
    );
  }

  const input: WinnersInput = {
    week_id: weekId,
    angles: r.angles_json,
    linkedin_trends: r.linkedin_trends_json,
    insurance_trends: insuranceTrends,
  };

  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Agent 7 inputs ==========\n');
    process.stdout.write('Model           : claude-opus-4-7\n');
    process.stdout.write(
      `System prompt   : ${AGENT_7_SYSTEM_PROMPT_STATS.characters} chars, ~${AGENT_7_SYSTEM_PROMPT_STATS.approx_tokens} tokens\n`,
    );
    process.stdout.write(`Week ID         : ${weekId}\n`);
    process.stdout.write(`Angles input    : ${input.angles.length} angles\n`);
    process.stdout.write('\nAngles à scorer :\n');
    for (const a of input.angles) {
      process.stdout.write(
        `  - ${a.angle_id} | ${a.archetype.padEnd(28)} | ${a.icp_vise.padEnd(18)} | ${a.longueur_cible}\n`,
      );
    }
    process.stdout.write(
      `\nLinkedinTrends synthese : ${input.linkedin_trends.synthese_textuelle?.slice(0, 200) ?? '(none)'}...\n`,
    );
    process.stdout.write(
      `InsuranceTrends synthese: ${input.insurance_trends.synthese_textuelle?.slice(0, 200) ?? '(none)'}...\n`,
    );
    process.stdout.write('\nNo Anthropic call, no DB write. Dry-run exit.\n');
    process.stdout.write('================================================\n\n');
    return;
  }

  // Run réel.
  const tStart = Date.now();
  let result: Awaited<ReturnType<typeof selectAndWriteWinners>>;
  try {
    result = await selectAndWriteWinners(input, { logger: log });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_7_failed');
    process.stderr.write(`\nAgent 7 failed: ${msg}\n`);
    process.exit(1);
  }
  const elapsedLlm = Date.now() - tStart;

  const postProcessed = postProcessWinners(result.winners, input.angles);

  // UPSERT.
  const { error: upErr } = await supabase.from('weekly_reports').upsert(
    {
      week_id: weekId,
      winners_json: postProcessed.winners as unknown as object,
      produced_at: new Date().toISOString(),
    } as never,
    { onConflict: 'week_id' },
  );
  if (upErr) throw new Error(`weekly_reports_upsert_failed: ${upErr.message}`);

  const tTotal = Date.now() - tStart;

  log.info(
    {
      week_id: weekId,
      duration_ms: tTotal,
      cost_eur: result.usage.cost_eur,
      retried: result.retried,
      overrides: postProcessed.validation_report.overrides.length,
      critical_flags: postProcessed.validation_report.critical_flags.length,
    },
    'agent_7_done',
  );

  // Rapport CLI.
  process.stdout.write('\n========== Agent 7 — Editorial Director & Winners ==========\n');
  process.stdout.write(`Week ID       : ${weekId}\n`);
  process.stdout.write(
    `Duration      : ${(tTotal / 1000).toFixed(1)}s (LLM ${(elapsedLlm / 1000).toFixed(1)}s)\n`,
  );
  process.stdout.write(
    `Tokens        : in=${result.usage.input_tokens} out=${result.usage.output_tokens} cache_w=${result.usage.cache_creation_input_tokens} cache_r=${result.usage.cache_read_input_tokens}\n`,
  );
  process.stdout.write(
    `Cost          : $${result.usage.cost_usd.toFixed(4)} (~€${result.usage.cost_eur.toFixed(4)})\n`,
  );
  process.stdout.write(`Retried       : ${result.retried ? 'OUI' : 'non'}\n\n`);

  printScoringTable(result.all_scoring, input.angles);
  printFusionsProposees(result.fusions_proposees);
  printWinnersOverview(postProcessed.winners, input.angles);
  printAutoCheck(postProcessed.winners, postProcessed.validation_report.overrides);
  printValidationReport(postProcessed.validation_report);
  printFirstWinnerDetail(postProcessed.winners);

  process.stdout.write(
    `\nProjection prod (4 runs/mois) : ~€${(result.usage.cost_eur * 4).toFixed(2)}/mois\n\n`,
  );
  process.stdout.write('============================================================\n\n');
}

function printScoringTable(
  scoring: Awaited<ReturnType<typeof selectAndWriteWinners>>['all_scoring'],
  angles: WeeklyAngles,
): void {
  if (scoring.length === 0) {
    process.stdout.write('--- Scoring 8 angles : (meta non fournie) ---\n\n');
    return;
  }
  const archByAngle = new Map(angles.map((a) => [a.angle_id, a.archetype]));
  process.stdout.write('--- Scoring des 8 angles ---\n');
  process.stdout.write(
    '| angle_id | archetype                     | score | top sub_score    | commentaire (extrait)                          |\n',
  );
  process.stdout.write(
    '|----------|-------------------------------|-------|------------------|------------------------------------------------|\n',
  );
  for (const s of scoring) {
    const arc = (archByAngle.get(s.angle_id) ?? '?').padEnd(30);
    const topSub = Object.entries(s.sous_scores).sort((a, b) => b[1] - a[1])[0];
    const topStr = topSub ? `${topSub[0]}=${topSub[1]}`.padEnd(17) : '?'.padEnd(17);
    const comm = s.commentaire.slice(0, 46).padEnd(46);
    process.stdout.write(
      `| ${s.angle_id.padEnd(8)} | ${arc}| ${s.score_total.toFixed(2).padStart(5)} | ${topStr} | ${comm} |\n`,
    );
  }
  process.stdout.write('\n');
}

function printFusionsProposees(
  fusions: Awaited<ReturnType<typeof selectAndWriteWinners>>['fusions_proposees'],
): void {
  if (fusions.length === 0) {
    process.stdout.write('--- Fusions proposées : aucune ---\n\n');
    return;
  }
  process.stdout.write('--- Fusions proposées ---\n');
  for (const f of fusions) {
    process.stdout.write(`  ${f.fusion_id} : ${f.angle_ids[0]} + ${f.angle_ids[1]}\n`);
    process.stdout.write(`    rationale: ${f.rationale}\n`);
  }
  process.stdout.write('\n');
}

function printWinnersOverview(winners: WeeklyWinners, angles: WeeklyAngles): void {
  const angById = new Map(angles.map((a) => [a.angle_id, a]));
  process.stdout.write('--- 3 Winners sélectionnés ---\n');
  process.stdout.write(
    '| pos | winner_id | archetype                     | ICP                | longueur_finale | fusion |\n',
  );
  process.stdout.write(
    '|-----|-----------|-------------------------------|--------------------|-----------------|--------|\n',
  );
  for (const w of winners) {
    const lookupId = w.fusion_used === false ? w.winner_id : (w.fusion_used as [string, string])[0];
    const a = angById.get(lookupId);
    const arc = (a?.archetype ?? '?').padEnd(30);
    const icp = (a?.icp_vise ?? '?').padEnd(18);
    const fus = w.fusion_used === false ? 'non' : `${w.fusion_used[0]}+${w.fusion_used[1]}`;
    process.stdout.write(
      `|  ${w.post_position}  | ${w.winner_id.padEnd(9)} | ${arc}| ${icp} | ${String(w.longueur_finale).padStart(15)} | ${fus} |\n`,
    );
  }
  process.stdout.write('\nRationale stratégique des winners :\n');
  for (const w of winners) {
    process.stdout.write(`  position ${w.post_position} (${w.winner_id}) :\n`);
    process.stdout.write(`    ${w.rationale_strategique}\n`);
  }
  process.stdout.write('\n');
}

function printAutoCheck(
  winners: WeeklyWinners,
  overrides: ReturnType<typeof postProcessWinners>['validation_report']['overrides'],
): void {
  const overrideKeys = new Set(overrides.map((o) => `${o.post_position}:${o.field}`));
  const mark = (val: boolean, pos: number, key: string): string => {
    const overridden = overrideKeys.has(`${pos}:${key}`);
    const symbol = val ? '✓' : '✗';
    return overridden ? `${symbol}!` : ` ${symbol}`;
  };
  process.stdout.write('--- Auto-check qualité (! = overridden post-processor) ---\n');
  process.stdout.write(
    '| pos | anti_cliche | ancrage_actu | ton_synvex | longueur | absence_survente | vocab_metier |\n',
  );
  process.stdout.write(
    '|-----|-------------|--------------|------------|----------|------------------|--------------|\n',
  );
  for (const w of winners) {
    const c = w.checklist_qualite_passee;
    process.stdout.write(
      `|  ${w.post_position}  |     ${mark(c.anti_cliche_ok, w.post_position, 'anti_cliche_ok')}      |      ${mark(c.ancrage_actu_assurance_ok, w.post_position, 'ancrage_actu_assurance_ok')}       |     ${mark(c.ton_synvex_ok, w.post_position, 'ton_synvex_ok')}     |    ${mark(c.longueur_alignee_tendance_ok, w.post_position, 'longueur_alignee_tendance_ok')}    |        ${mark(c.absence_survente_ok, w.post_position, 'absence_survente_ok')}         |      ${mark(c.vocabulaire_metier_ok, w.post_position, 'vocabulaire_metier_ok')}       |\n`,
    );
  }
  if (overrides.length > 0) {
    process.stdout.write('\nOverrides détail :\n');
    for (const o of overrides) {
      process.stdout.write(
        `  pos ${o.post_position} ${o.field} : ${String(o.from)} → ${String(o.to)} (${o.reason})\n`,
      );
    }
  }
  process.stdout.write('\n');
}

function printValidationReport(
  r: ReturnType<typeof postProcessWinners>['validation_report'],
): void {
  process.stdout.write('--- Validation report ---\n');
  process.stdout.write(`Archetypes distincts (3 winners) : ${r.archetypes_distinct}\n`);
  process.stdout.write(`ICP distincts                    : ${r.icp_distinct}\n`);
  process.stdout.write(`Longueurs distinctes             : ${r.longueurs_distinct}\n`);
  process.stdout.write(
    `Complémentarité OK (≥2 arch & ≥2 ICP) : ${r.complementarite_ok ? '✓' : '✗'}\n`,
  );
  process.stdout.write(`Overrides appliqués              : ${r.overrides.length}\n`);
  if (r.critical_flags.length > 0) {
    process.stdout.write('⚠️ Flags critiques :\n');
    for (const f of r.critical_flags) {
      process.stdout.write(`  - ${f}\n`);
    }
  } else {
    process.stdout.write('Critical flags                   : 0\n');
  }
  process.stdout.write('\n');
}

function printFirstWinnerDetail(winners: WeeklyWinners): void {
  const w = winners[0];
  if (!w) return;
  process.stdout.write('--- Échantillon : Winner #1 (post_position 1) ---\n');
  process.stdout.write(`winner_id          : ${w.winner_id}\n`);
  process.stdout.write(
    `fusion_used        : ${w.fusion_used === false ? 'non' : (w.fusion_used as [string, string]).join(' + ')}\n`,
  );
  process.stdout.write(`longueur_finale    : ${w.longueur_finale} chars\n`);
  process.stdout.write(`cta_recommande     : ${w.cta_recommande}\n\n`);
  process.stdout.write('post_final :\n');
  process.stdout.write('---\n');
  process.stdout.write(`${w.post_final}\n`);
  process.stdout.write('---\n\n');
  process.stdout.write('hook_variantes :\n');
  w.hook_variantes.forEach((h, i) => {
    process.stdout.write(`  Variante ${String.fromCharCode(65 + i)}: ${h}\n`);
  });
  process.stdout.write('\n');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'run_agent_7_failed');
  process.exit(1);
});
