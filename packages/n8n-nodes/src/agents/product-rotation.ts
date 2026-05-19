/**
 * product-rotation — helper équité rotation produits Synvex (v2 mai 2026).
 *
 * Lit weekly_reports.winners_json sur les N dernières semaines et compte
 * combien de fois chaque produit du catalogue Synvex (9 produits) a été
 * adressé en ancrage principal d'un winner.
 *
 * Utilisation côté Agent 7 : avant de sélectionner les 3 winners de la
 * semaine, charger ce dict et le passer dans le user prompt pour que le
 * Director Opus 4.7 priorise les produits sous-représentés.
 *
 * Pas de LLM ici — pur SELECT + agrégation TypeScript.
 */
import type { ProduitSynvex } from '@nexus/shared';
import { PRODUITS_SYNVEX } from '@nexus/shared';

export type ProductCoverageDict = Record<ProduitSynvex, number>;

export interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      lt: (
        col: string,
        val: string,
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => {
          limit: (
            n: number,
          ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

interface WinnerLite {
  produit_synvex_ancrage?: ProduitSynvex | null;
  fusion_used?: false | [string, string];
}

/**
 * Initialise un dict avec count=0 pour chaque produit du catalogue.
 * Garantit que les 9 clés existent dans le résultat même si zéro winner.
 */
export function emptyCoverage(): ProductCoverageDict {
  return PRODUITS_SYNVEX.reduce((acc, p) => {
    acc[p] = 0;
    return acc;
  }, {} as ProductCoverageDict);
}

/**
 * Charge l'historique des produits adressés sur les N dernières semaines
 * AVANT la week_id courante. Tolérant aux winners sans champ produit
 * (anciennes weekly_reports v1).
 */
export async function getRecentlyCoveredProducts(
  supabase: SupabaseLike,
  currentWeekId: string,
  weeksBack = 4,
): Promise<{ coverage: ProductCoverageDict; weeks_scanned: number }> {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('week_id, winners_json')
    .lt('week_id', currentWeekId)
    .order('week_id', { ascending: false })
    .limit(weeksBack);
  if (error) throw new Error(`product_rotation_query_failed: ${error.message}`);

  const coverage = emptyCoverage();
  const rows = (data ?? []) as Array<{ week_id: string; winners_json: WinnerLite[] | null }>;

  for (const row of rows) {
    const winners = row.winners_json ?? [];
    for (const w of winners) {
      const p = w.produit_synvex_ancrage;
      if (p && p in coverage) {
        coverage[p] += 1;
      }
    }
  }

  return { coverage, weeks_scanned: rows.length };
}

/**
 * Retourne la liste des produits par ordre de priorité (count croissant).
 * Utile pour Agent 7 qui veut savoir "quels produits adresser en priorité
 * cette semaine".
 */
export function prioritizeProducts(coverage: ProductCoverageDict): ProduitSynvex[] {
  return [...PRODUITS_SYNVEX].sort((a, b) => coverage[a] - coverage[b]);
}

/**
 * Liste les produits "saturés" : adressés >= maxCount fois sur la fenêtre.
 * Agent 7 doit les dé-prioriser ou skip.
 */
export function saturatedProducts(coverage: ProductCoverageDict, maxCount = 2): ProduitSynvex[] {
  return PRODUITS_SYNVEX.filter((p) => coverage[p] >= maxCount);
}
