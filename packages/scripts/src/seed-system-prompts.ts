/**
 * seed-system-prompts — lit les Markdown sources de vérité dans docs/
 * et UPSERT leur contenu dans la table system_prompts. À relancer après
 * chaque modification de synvex-context-brief.md ou synvex-voice-tone.md.
 *
 * Usage : pnpm --filter @nexus/scripts seed:system-prompts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import { createNexusSupabaseClient, logger } from '@nexus/shared';

const REPO_ROOT = resolve(process.cwd(), '..', '..');

interface PromptSource {
  prompt_id: string;
  source_file: string;
  note: string;
}

const SOURCES: PromptSource[] = [
  {
    prompt_id: 'synvex_context_brief',
    source_file: 'docs/synvex-context-brief.md',
    note: 'Contexte stratégique Synvex + périmètre produits (§9). Lu par Agents 3, 4, 6, 7.',
  },
  {
    prompt_id: 'synvex_voice_tone',
    source_file: 'docs/synvex-voice-tone.md',
    note: 'Voice & tone Synvex. Lexique imposé / banni, hooks bannis. Lu par Agents 3, 4, 6, 7.',
  },
];

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'seed-system-prompts' });

  for (const src of SOURCES) {
    const fullPath = resolve(REPO_ROOT, src.source_file);
    const content = readFileSync(fullPath, 'utf8');
    // Cast as never car les types Supabase générés en local ne connaissent
    // pas encore la table system_prompts. Régénérable via
    // `supabase gen types typescript --linked > packages/shared/src/db/types.ts`
    // après application de la migration 20260515000001_system_prompts.sql.
    const { error } = await (
      supabase as unknown as {
        from: (t: string) => {
          upsert: (
            rows: unknown,
            options: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .from('system_prompts')
      .upsert(
        {
          prompt_id: src.prompt_id,
          content,
          source_file: src.source_file,
          note: src.note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'prompt_id' },
      );
    if (error) throw new Error(`upsert_failed for ${src.prompt_id}: ${error.message}`);
    log.info(
      { prompt_id: src.prompt_id, chars: content.length, source_file: src.source_file },
      'system_prompt_upserted',
    );
    process.stdout.write(
      `  ✓ ${src.prompt_id.padEnd(28)} (${content.length} chars from ${src.source_file})\n`,
    );
  }

  process.stdout.write(`\nDone. ${SOURCES.length} system_prompts seeded.\n`);
}

main().catch((err: unknown) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    'seed_system_prompts_failed',
  );
  process.exit(1);
});
