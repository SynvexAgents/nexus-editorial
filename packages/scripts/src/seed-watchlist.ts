/**
 * seed-watchlist
 *
 * Squelette CLI : lit une source externe (CSV/JSON local, hors repo) et
 * upserte les profils dans `profiles_watchlist`. L'implémentation réelle
 * arrive en tâche n°3 du plan global — ce fichier sert de point d'entrée
 * documenté pour ne pas surprendre l'équipe au prochain run.
 *
 * Usage prévu (tâche n°3) :
 *   pnpm --filter @nexus/scripts seed:watchlist -- --file ./watchlist.csv
 *
 * Format CSV attendu :
 *   profile_id,nom,headline,secteur,langue,audience_size_estimee,notes
 *
 * Comportement : upsert ON CONFLICT (profile_id) DO UPDATE.
 * Aucun appel réseau n'est fait dans cette tâche n°1.
 */

import { createNexusSupabaseClient, logger } from '@nexus/shared';

interface SeedOptions {
  file: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): SeedOptions {
  const fileIdx = argv.indexOf('--file');
  const file = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const dryRun = argv.includes('--dry-run');
  if (!file) {
    throw new Error('Usage: seed-watchlist --file <path-to-csv> [--dry-run]');
  }
  return { file, dryRun };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  logger.info({ file: opts.file, dryRun: opts.dryRun }, 'seed_watchlist_start');

  // TODO (tâche n°3) :
  //   1. Lire et parser le CSV (utiliser une lib légère type csv-parse).
  //   2. Valider chaque ligne via un schéma Zod local (profile_id non vide, etc.).
  //   3. Upsert vers Supabase via `createNexusSupabaseClient()`.
  //   4. Logger un récap (inserted, updated, skipped).
  //
  // À ce stade (tâche n°1), aucun appel réseau n'est effectué. On vérifie
  // simplement que la factory client se construit correctement lorsque les
  // variables d'env sont présentes — utile pour détecter un .env vide.

  if (opts.dryRun) {
    logger.info('seed_watchlist_dry_run_complete');
    return;
  }

  // Probe non-destructive : créer le client (échouera si env manquant).
  // Pas d'appel réseau. Sera remplacé en tâche n°3 par la logique d'upsert.
  createNexusSupabaseClient();
  logger.warn('seed_watchlist_not_implemented_yet — see TODO in source');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'seed_watchlist_failed');
  process.exit(1);
});
