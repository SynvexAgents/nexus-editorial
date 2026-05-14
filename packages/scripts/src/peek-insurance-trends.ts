/**
 * peek-insurance-trends — lecture rapide de weekly_reports.insurance_trends_json
 * pour valider Agent 5 UPSERT.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import { createNexusSupabaseClient } from '@nexus/shared';

async function main(): Promise<void> {
  const weekId = process.argv[2] ?? '2026-W19';
  const supabase = createNexusSupabaseClient();
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('week_id, produced_at, insurance_trends_json')
    .eq('week_id', weekId)
    .maybeSingle();
  if (error) throw new Error(`select_failed: ${error.message}`);
  if (!data) {
    process.stdout.write(`No row for week_id=${weekId}\n`);
    return;
  }
  const row = data as {
    week_id: string;
    produced_at: string;
    insurance_trends_json: unknown;
  };
  process.stdout.write(`week_id   : ${row.week_id}\n`);
  process.stdout.write(`produced  : ${row.produced_at}\n`);
  const trends = row.insurance_trends_json as Record<string, unknown> | null;
  if (!trends) {
    process.stdout.write('insurance_trends_json : NULL\n');
    return;
  }
  for (const key of [
    'regulation_acpr',
    'sinistres_fraude',
    'courtage_distribution',
    'mutuelles_complementaires',
    'insurtech_ia_assurance',
    'back_office_productivite',
    'signaux_faibles',
    'actualites_majeures',
  ]) {
    const arr = trends[key] as unknown[] | undefined;
    process.stdout.write(`${key.padEnd(28)} : ${Array.isArray(arr) ? arr.length : 'n/a'} items\n`);
  }
  const synth = trends.synthese_textuelle as string | undefined;
  process.stdout.write(`\nsynthese_textuelle:\n${synth ?? '(none)'}\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`peek failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
