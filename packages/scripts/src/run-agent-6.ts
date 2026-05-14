/**
 * run-agent-6 — Agent 6 Angles Generator.
 *
 * Pipeline :
 *   1. Lit weekly_reports.linkedin_trends_json + insurance_trends_json
 *      pour la week_id ciblée. Fallback graceful : si insurance_trends
 *      manque sur la week_id, prend la semaine la plus récente avec
 *      insurance_trends non-vide (max 4 semaines en arrière).
 *   2. Compose un contextSummary (top items linkedin + insurance) et
 *      sélectionne voice_pack via embeddings (matchVoicePack). Fallback
 *      [] si voice_pack vide ou OPENAI_API_KEY manquante.
 *   3. Call Claude Opus 4.7 via generateAngles (1 retry sur fail).
 *   4. Post-processing déterministe (angle_id, validation flags).
 *   5. UPSERT weekly_reports.angles_json.
 *
 *   pnpm --filter @nexus/scripts run-agent-6 \
 *     [-- --week-id YYYY-Www] [-- --force] [-- --dry-run]
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import {
  AGENT_6_SYSTEM_PROMPT_STATS,
  type AnglesInput,
  type VoicePackEntry,
  generateAngles,
  matchVoicePack,
  postProcessAngles,
} from '@nexus/n8n-nodes';
import {
  type InsuranceTrends,
  type LinkedinTrends,
  type WeeklyAngles,
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

/**
 * Compose un résumé textuel des deux trends pour le matching d'embedding.
 * Garde court (~2-3k chars) — l'embedding text-embedding-3-small accepte
 * jusqu'à 8k tokens mais on cible la pertinence sémantique.
 */
function composeContextSummary(linkedin: LinkedinTrends, insurance: InsuranceTrends): string {
  const lines: string[] = [];
  lines.push(`Synthèse LinkedIn FR : ${linkedin.synthese_textuelle ?? '(n/a)'}`);
  if (linkedin.top_hooks && linkedin.top_hooks.length > 0) {
    lines.push(`Top hooks LinkedIn : ${linkedin.top_hooks.map((h) => h.type).join(', ')}`);
  }
  if (linkedin.mecaniques_emergentes && linkedin.mecaniques_emergentes.length > 0) {
    lines.push(`Mécaniques émergentes : ${linkedin.mecaniques_emergentes.slice(0, 3).join(' ; ')}`);
  }
  lines.push(`Synthèse assurance FR : ${insurance.synthese_textuelle ?? '(n/a)'}`);
  if (insurance.actualites_majeures && insurance.actualites_majeures.length > 0) {
    lines.push(
      `Top actualités assurance : ${insurance.actualites_majeures
        .slice(0, 5)
        .map((a) => a.titre)
        .join(' ; ')}`,
    );
  }
  return lines.join('\n');
}

/**
 * Récupère insurance_trends pour weekId, ou fallback sur la semaine la plus
 * récente disponible (max 4 en arrière). Retourne { trends, source_week_id }.
 */
async function fetchInsuranceTrendsWithFallback(
  supabase: ReturnType<typeof createNexusSupabaseClient>,
  weekId: string,
  log: { warn: (obj: Record<string, unknown>, msg: string) => void },
): Promise<{ trends: InsuranceTrends; source_week_id: string } | null> {
  const { data: direct } = await supabase
    .from('weekly_reports')
    .select('week_id, insurance_trends_json')
    .eq('week_id', weekId)
    .maybeSingle();
  type Row = { week_id: string; insurance_trends_json: InsuranceTrends | null };
  const directRow = direct as Row | null;
  if (directRow?.insurance_trends_json) {
    // On considère non-vide si au moins un cluster contient des items
    // OU si actualites_majeures contient au moins une entrée.
    const t = directRow.insurance_trends_json;
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
      return { trends: t, source_week_id: weekId };
    }
    log.warn(
      { week_id: weekId },
      'insurance_trends_present_but_empty_falling_back_to_previous_week',
    );
  }

  // Fallback : cherche la semaine la plus récente avec insurance_trends_json
  // non-vide. On scanne les 4 dernières semaines.
  const { data: recent } = await supabase
    .from('weekly_reports')
    .select('week_id, insurance_trends_json')
    .not('insurance_trends_json', 'is', null)
    .lt('week_id', weekId)
    .order('week_id', { ascending: false })
    .limit(4)
    .returns<Array<{ week_id: string; insurance_trends_json: InsuranceTrends | null }>>();
  for (const row of recent ?? []) {
    if (!row.insurance_trends_json) continue;
    const t = row.insurance_trends_json;
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
      log.warn(
        { week_id: weekId, fallback_week: row.week_id },
        'insurance_trends_fallback_to_previous_week',
      );
      return { trends: t, source_week_id: row.week_id };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'run-agent-6', ...args });
  const weekId = args.weekId ?? currentIsoWeek();

  log.info(
    {
      week_id: weekId,
      system_prompt_chars: AGENT_6_SYSTEM_PROMPT_STATS.characters,
      system_prompt_approx_tokens: AGENT_6_SYSTEM_PROMPT_STATS.approx_tokens,
    },
    'agent_6_start',
  );

  // Idempotence.
  if (!args.force && !args.dryRun) {
    const { data: existing } = await supabase
      .from('weekly_reports')
      .select('week_id, angles_json')
      .eq('week_id', weekId)
      .maybeSingle();
    if (existing && (existing as { angles_json: unknown }).angles_json) {
      process.stdout.write(
        `\nweek_id=${weekId} déjà avec angles_json. Utilise --force pour ré-écraser. Exit.\n`,
      );
      log.info({ week_id: weekId }, 'already_has_angles_skipping');
      return;
    }
  }

  // 1. Charge linkedin_trends.
  const { data: linkedinRow } = await supabase
    .from('weekly_reports')
    .select('linkedin_trends_json')
    .eq('week_id', weekId)
    .maybeSingle();
  const linkedinTrends = (linkedinRow as { linkedin_trends_json: LinkedinTrends | null } | null)
    ?.linkedin_trends_json;
  if (!linkedinTrends) {
    throw new Error(`linkedin_trends_json missing for week_id=${weekId}. Run Agent 4 first.`);
  }

  // 2. Charge insurance_trends avec fallback semaine précédente si vide.
  const insuranceResult = await fetchInsuranceTrendsWithFallback(supabase, weekId, log);
  if (!insuranceResult) {
    throw new Error(
      `insurance_trends_json missing or empty for week_id=${weekId} and no usable fallback within 4 weeks. Run Agent 5 first.`,
    );
  }
  const insuranceTrends = insuranceResult.trends;
  if (insuranceResult.source_week_id !== weekId) {
    process.stdout.write(
      `[fallback] insurance_trends pris sur ${insuranceResult.source_week_id} (W${weekId} vide).\n`,
    );
  }

  // 3. Voice pack matching (fallback graceful).
  const contextSummary = composeContextSummary(linkedinTrends, insuranceTrends);
  let voicePackExcerpts: VoicePackEntry[] = [];
  try {
    voicePackExcerpts = await matchVoicePack(contextSummary, supabase as never, {
      limit: 5,
      logger: log,
    });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'voice_pack_matching_failed_proceeding_without',
    );
  }

  const input: AnglesInput = {
    week_id: weekId,
    linkedin_trends: linkedinTrends,
    insurance_trends: insuranceTrends,
    voice_pack_excerpts: voicePackExcerpts,
  };

  // 4. Dry-run : affiche prompt + inputs et exit.
  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Agent 6 inputs ==========\n');
    process.stdout.write('Model           : claude-opus-4-7\n');
    process.stdout.write(
      `System prompt   : ${AGENT_6_SYSTEM_PROMPT_STATS.characters} chars, ~${AGENT_6_SYSTEM_PROMPT_STATS.approx_tokens} tokens\n`,
    );
    process.stdout.write(`Week ID         : ${weekId}\n`);
    process.stdout.write(
      `Insurance src   : ${insuranceResult.source_week_id}${insuranceResult.source_week_id !== weekId ? ' (FALLBACK)' : ''}\n`,
    );
    process.stdout.write(`Voice pack      : ${voicePackExcerpts.length} entrées\n`);
    if (voicePackExcerpts.length > 0) {
      for (const e of voicePackExcerpts) {
        process.stdout.write(
          `  - [${e.type}] (score=${(e.score ?? 0).toFixed(3)}) ${e.content.slice(0, 80)}\n`,
        );
      }
    }
    process.stdout.write(
      `\nLinkedinTrends synthese: ${linkedinTrends.synthese_textuelle?.slice(0, 200) ?? '(none)'}...\n`,
    );
    process.stdout.write(
      `InsuranceTrends synthese: ${insuranceTrends.synthese_textuelle?.slice(0, 200) ?? '(none)'}...\n`,
    );
    process.stdout.write('\nNo Anthropic call, no DB write. Dry-run exit.\n');
    process.stdout.write('================================================\n\n');
    return;
  }

  // 5. Run Opus.
  const tStart = Date.now();
  let result: Awaited<ReturnType<typeof generateAngles>>;
  try {
    result = await generateAngles(input, { logger: log });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_6_failed');
    process.stderr.write(`\nAgent 6 failed: ${msg}\n`);
    process.exit(1);
  }
  const elapsedLlm = Date.now() - tStart;

  // 6. Post-processing déterministe.
  const postProcessed = postProcessAngles(result.angles, weekId);

  // 7. UPSERT.
  const { error: upErr } = await supabase.from('weekly_reports').upsert(
    {
      week_id: weekId,
      angles_json: postProcessed.angles as unknown as object,
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
      synvex_mention_flagged: postProcessed.validation_report.synvex_mention_flagged.length,
      ancrage_flagged: postProcessed.validation_report.ancrage_assurance_flagged.length,
    },
    'agent_6_done',
  );

  // 8. Rapport CLI.
  process.stdout.write('\n========== Agent 6 — Angles Generator ==========\n');
  process.stdout.write(`Week ID       : ${weekId}\n`);
  if (insuranceResult.source_week_id !== weekId) {
    process.stdout.write(`Insurance src : ${insuranceResult.source_week_id} (FALLBACK)\n`);
  }
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

  printAnglesTable(postProcessed.angles);
  printValidationReport(postProcessed.validation_report);
  printFirstAngleDetail(postProcessed.angles[0]!);

  process.stdout.write(
    `\nProjection prod (4 runs/mois) : ~€${(result.usage.cost_eur * 4).toFixed(2)}/mois\n\n`,
  );
  process.stdout.write('==================================================\n\n');
}

function printAnglesTable(angles: WeeklyAngles): void {
  process.stdout.write('--- Distribution des 8 angles ---\n');
  process.stdout.write(
    '| idx | archetype                     | titre_interne                                          | ICP                | longueur |\n',
  );
  process.stdout.write(
    '|-----|-------------------------------|--------------------------------------------------------|--------------------|----------|\n',
  );
  angles.forEach((a, i) => {
    const idx = String(i + 1).padStart(3);
    const arc = a.archetype.padEnd(30);
    const titre = a.titre_interne.slice(0, 54).padEnd(54);
    const icp = a.icp_vise.padEnd(18);
    const lg = a.longueur_cible.padEnd(8);
    process.stdout.write(`| ${idx} | ${arc}| ${titre} | ${icp} | ${lg} |\n`);
  });
  process.stdout.write('\n');
}

function printValidationReport(r: ReturnType<typeof postProcessAngles>['validation_report']): void {
  process.stdout.write('--- Validation report ---\n');
  process.stdout.write(`Total angles            : ${r.total_angles}\n`);
  process.stdout.write(`Ancrage assurance OK    : ${r.ancrage_assurance_ok}/${r.total_angles}\n`);
  process.stdout.write(`ICP distincts           : ${r.icp_vises_distinct}\n`);
  process.stdout.write(`Longueurs distinctes    : ${r.longueur_cibles_distinct}\n`);
  if (r.ancrage_assurance_flagged.length > 0) {
    process.stdout.write('Ancrage flagged :\n');
    for (const f of r.ancrage_assurance_flagged) {
      process.stdout.write(`  - ${f.angle_id} (${f.archetype}) : ${f.detail ?? ''}\n`);
    }
  }
  if (r.empty_risks_filled.length > 0) {
    process.stdout.write('Risques vides comblés :\n');
    for (const f of r.empty_risks_filled) {
      process.stdout.write(`  - ${f.angle_id} (${f.archetype})\n`);
    }
  }
  if (r.synvex_mention_flagged.length > 0) {
    process.stdout.write('⚠️ MENTION SYNVEX DÉTECTÉE :\n');
    for (const f of r.synvex_mention_flagged) {
      process.stdout.write(`  - ${f.angle_id} (${f.archetype}) : ${f.flag} ${f.detail ?? ''}\n`);
    }
  }
  process.stdout.write('\n');
}

function printFirstAngleDetail(a: WeeklyAngles[number]): void {
  process.stdout.write('--- Échantillon : angle #1 ---\n');
  process.stdout.write(`angle_id           : ${a.angle_id}\n`);
  process.stdout.write(`archetype          : ${a.archetype}\n`);
  process.stdout.write(`titre_interne      : ${a.titre_interne}\n`);
  process.stdout.write(`hook_brut          : ${a.hook_brut}\n`);
  process.stdout.write(`these_centrale     : ${a.these_centrale}\n`);
  process.stdout.write(`promesse_lecteur   : ${a.promesse_lecteur}\n`);
  process.stdout.write(`structure_proposee : ${a.structure_proposee}\n`);
  process.stdout.write(`longueur_cible     : ${a.longueur_cible}\n`);
  process.stdout.write(`tonalite           : ${a.tonalite}\n`);
  process.stdout.write(`ancrage_assurance  : ${a.ancrage_assurance}\n`);
  process.stdout.write(`ancrage_linkedin   : ${a.ancrage_linkedin}\n`);
  process.stdout.write(`icp_vise           : ${a.icp_vise}\n`);
  process.stdout.write(`risques            : ${a.risques.join(' ; ')}\n`);
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'run_agent_6_failed');
  process.exit(1);
});
