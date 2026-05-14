/**
 * notify-weekly-report — compose et envoie l'email récap dominical de
 * Nexus Editorial via Resend.
 *
 * Pipeline :
 *   1. SELECT weekly_reports WHERE week_id = ?
 *   2. Vérifie que les 6 colonnes JSON sont alimentées (sinon throw).
 *   3. Compose subject + body (HTML + texte plain).
 *   4. Envoie via Resend (free tier suffit, 3000 mails/mois).
 *
 * Variables d'env requises :
 *   - RESEND_API_KEY
 *   - NOTIFY_EMAIL_TO      (l'adresse Marouane)
 *   - NOTIFY_EMAIL_FROM    (default 'onboarding@resend.dev')
 *   - DASHBOARD_URL        (default 'https://nexus-editorial.lovable.app')
 *
 *   pnpm --filter @nexus/scripts notify-weekly-report \
 *     [-- --week-id YYYY-Www] [-- --dry-run]
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import {
  type ComposeEmailOutput,
  type WeeklyReportData,
  composeWeeklyReportEmail,
} from '@nexus/n8n-nodes';
import {
  type InsuranceTrends,
  type LinkedinTrends,
  type TimingRecommendation,
  type VisualDecision,
  type WeeklyWinners,
  createNexusSupabaseClient,
  logger,
} from '@nexus/shared';

interface Args {
  weekId: string | null;
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
  const dryRun = argv.includes('--dry-run');
  return { weekId, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'notify-weekly-report', ...args });
  const weekId = args.weekId ?? currentIsoWeek();

  log.info({ week_id: weekId, dry_run: args.dryRun }, 'notify_start');

  // 1. Charge weekly_reports complet pour cette week_id.
  const { data: row, error } = await supabase
    .from('weekly_reports')
    .select(
      'week_id, produced_at, linkedin_trends_json, insurance_trends_json, angles_json, winners_json, visuals_json, timing_json',
    )
    .eq('week_id', weekId)
    .maybeSingle();
  if (error) throw new Error(`weekly_reports_select_failed: ${error.message}`);
  if (!row) throw new Error(`weekly_reports row not found for week_id=${weekId}`);

  type Row = {
    week_id: string;
    produced_at: string | null;
    linkedin_trends_json: LinkedinTrends | null;
    insurance_trends_json: InsuranceTrends | null;
    angles_json: unknown;
    winners_json: WeeklyWinners | null;
    visuals_json: VisualDecision[] | null;
    timing_json: TimingRecommendation[] | null;
  };
  const r = row as Row;

  // 2. Vérification 6 colonnes alimentées.
  const data: WeeklyReportData = {
    week_id: r.week_id,
    produced_at: r.produced_at,
    linkedin_trends: r.linkedin_trends_json,
    insurance_trends: r.insurance_trends_json,
    angles: r.angles_json,
    winners: r.winners_json,
    visuals: r.visuals_json,
    timing: r.timing_json,
  };
  const composed: ComposeEmailOutput = composeWeeklyReportEmail(data, {
    dashboard_url: process.env.DASHBOARD_URL ?? 'https://nexus-editorial.lovable.app',
  });

  // 3. Dry-run : print et exit.
  if (args.dryRun) {
    process.stdout.write('\n========== DRY RUN — Email préparé ==========\n');
    process.stdout.write(
      `To       : ${process.env.NOTIFY_EMAIL_TO ?? '(NOTIFY_EMAIL_TO non défini)'}\n`,
    );
    process.stdout.write(
      `From     : ${process.env.NOTIFY_EMAIL_FROM ?? 'onboarding@resend.dev'}\n`,
    );
    process.stdout.write(`Subject  : ${composed.subject}\n\n`);
    process.stdout.write('---- Body (texte) ----\n');
    process.stdout.write(`${composed.text}\n`);
    process.stdout.write('---- Body (HTML, premiers 400 chars) ----\n');
    process.stdout.write(`${composed.html.slice(0, 400)}...\n`);
    process.stdout.write('============================================\n\n');
    return;
  }

  // 4. Envoi Resend.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY missing in env');
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!to) throw new Error('NOTIFY_EMAIL_TO missing in env');
  const from = process.env.NOTIFY_EMAIL_FROM ?? 'onboarding@resend.dev';

  // Import dynamique pour ne pas le charger en dry-run.
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  const tStart = Date.now();
  const result = await resend.emails.send({
    from,
    to,
    subject: composed.subject,
    text: composed.text,
    html: composed.html,
  });
  const elapsed = Date.now() - tStart;

  if (result.error) {
    log.error({ err: result.error.message }, 'resend_send_failed');
    throw new Error(`resend_send_failed: ${result.error.message}`);
  }

  log.info({ week_id: weekId, resend_id: result.data?.id, duration_ms: elapsed }, 'notify_sent');

  process.stdout.write('\n========== Email envoyé ==========\n');
  process.stdout.write(`To         : ${to}\n`);
  process.stdout.write(`From       : ${from}\n`);
  process.stdout.write(`Subject    : ${composed.subject}\n`);
  process.stdout.write(`Resend ID  : ${result.data?.id ?? '(no id)'}\n`);
  process.stdout.write(`Duration   : ${elapsed}ms\n`);
  process.stdout.write('Coût       : €0 (Resend free tier ≤ 3000/mois)\n');
  process.stdout.write('==================================\n\n');
}

main().catch((err: unknown) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    'notify_weekly_report_failed',
  );
  process.exit(1);
});
