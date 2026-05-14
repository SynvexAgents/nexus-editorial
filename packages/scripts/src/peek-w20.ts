/**
 * peek-w20 — vérifie si W20 a linkedin_trends_json + insurance_trends_json + voice_pack
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import { createNexusSupabaseClient } from '@nexus/shared';

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  const { data } = await supabase
    .from('weekly_reports')
    .select('week_id, linkedin_trends_json, insurance_trends_json, angles_json')
    .in('week_id', ['2026-W19', '2026-W20'])
    .returns<
      Array<{
        week_id: string;
        linkedin_trends_json: unknown;
        insurance_trends_json: unknown;
        angles_json: unknown;
      }>
    >();
  for (const row of data ?? []) {
    process.stdout.write(`${row.week_id}\n`);
    process.stdout.write(`  linkedin_trends_json   : ${row.linkedin_trends_json ? 'YES' : 'no'}\n`);
    process.stdout.write(
      `  insurance_trends_json  : ${row.insurance_trends_json ? 'YES' : 'no'}\n`,
    );
    process.stdout.write(`  angles_json            : ${row.angles_json ? 'YES' : 'no'}\n`);
  }
  const { data: vp } = await supabase
    .from('synvex_voice_pack')
    .select('entry_id, type, is_active')
    .eq('is_active', true)
    .returns<Array<{ entry_id: number; type: string; is_active: boolean }>>();
  process.stdout.write(`\nvoice_pack active rows : ${(vp ?? []).length}\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
