/**
 * import-produits — UPSERT le corpus produit Synvex dans produits_synvex.
 *
 * Source : packages/scripts/src/data/produits-synvex-seed.ts (records
 * structurés à la main depuis les exports PDF, déjà scrubés des données
 * sensibles). Le script re-scrub par sécurité (defense in depth), dérive
 * contenu_brut, et upsert par slug. Idempotent : préserve actif et
 * derniere_utilisation_semaine des lignes existantes (n'écrase QUE le contenu).
 *
 * Note : les fiches fournies sont des PDF (pas des ZIP) ; l'extraction texte
 * a été faite en amont via pdftotext, le contenu structuré est figé dans le
 * seed pour un import déterministe, reviewable et sans coût LLM.
 *
 * Usage : pnpm --filter @nexus/scripts import:produits
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import {
  assembleContenuBrut,
  containsSensitive,
  createNexusSupabaseClient,
  logger,
  scrubSensitive,
} from '@nexus/shared';
import { PRODUITS_SEED } from './data/produits-synvex-seed.js';

function scrubList(arr: string[]): string[] {
  return arr.map(scrubSensitive).filter((s) => s.length > 0);
}

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();
  const log = logger.child({ run: 'import-produits' });

  let ok = 0;
  for (const p of PRODUITS_SEED) {
    // Re-scrub défensif de tous les champs texte.
    const record = {
      slug: p.slug,
      nom: p.nom,
      domaine: scrubSensitive(p.domaine),
      positionnement: scrubSensitive(p.positionnement),
      problemes_terrain: scrubList(p.problemes_terrain),
      mecaniques: scrubList(p.mecaniques),
      chiffres: p.chiffres.map((c) => ({
        valeur: scrubSensitive(c.valeur),
        libelle: scrubSensitive(c.libelle),
      })),
      cibles: scrubList(p.cibles),
      punchlines: scrubList(p.punchlines),
      differenciation: scrubSensitive(p.differenciation),
      contenu_brut: assembleContenuBrut(p),
    };

    // Garde-fou : refuse l'import si une donnée sensible a survécu.
    const flat = JSON.stringify(record);
    if (containsSensitive(flat)) {
      log.error({ slug: p.slug }, 'sensitive_data_detected_aborting_this_product');
      throw new Error(`sensitive_data_in_record: ${p.slug}`);
    }

    // Upsert SANS toucher actif / derniere_utilisation_semaine (préserve la
    // rotation). On n'envoie que les colonnes de contenu.
    // Cast as unknown : les types Supabase générés en local ne connaissent pas
    // encore produits_synvex (régénérables via `supabase gen types` après la
    // migration 20260628000001_produits_synvex.sql).
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
      .from('produits_synvex')
      .upsert(record, { onConflict: 'slug' });
    if (error) {
      log.error({ slug: p.slug, err: error.message }, 'upsert_failed');
      throw new Error(`upsert_failed ${p.slug}: ${error.message}`);
    }
    ok += 1;
    log.info(
      {
        slug: p.slug,
        problemes: record.problemes_terrain.length,
        mecaniques: record.mecaniques.length,
        chiffres: record.chiffres.length,
      },
      'produit_upserted',
    );
  }

  log.info({ total: ok }, 'import_produits_done');
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'import_produits_failed');
  process.exit(1);
});
