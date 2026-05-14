/**
 * insurance-trends-post-processor — assemble la sortie InsuranceTrends finale
 * à partir des résultats Perplexity par cluster.
 *
 * Tout ce qui est déterministe vit ici :
 *   - normalisation des dates (YYYY-MM-DD → ISO 8601 datetime offset)
 *   - dedup cross-cluster (URL identique : on garde le cluster prioritaire)
 *   - tri par date DESC dans chaque cluster
 *   - limite 5 items max par cluster
 *   - composition de `actualites_majeures` (top items récents cross-cluster)
 *   - composition templatisée de `synthese_textuelle`
 *
 * Aucun appel LLM ici. Pattern validé sur Agent 4.
 */
import type { InsuranceTrendItem, InsuranceTrends } from '@nexus/shared';
import { CLUSTERS, CLUSTERS_BY_ID, type ClusterDef, type ClusterId } from './insurance-clusters.js';

const MAX_ITEMS_PER_CLUSTER = 5;
const MAJOR_NEWS_TOP_N = 5;

export interface RawClusterResult {
  cluster_id: ClusterId;
  items: InsuranceTrendItem[];
  /** Erreur facultative — si non-undefined, le cluster a échoué partiellement ou totalement. */
  error?: string;
}

export interface PostProcessStats {
  /** Items reçus de Perplexity par cluster, avant dedup. */
  received_by_cluster: Record<ClusterId, number>;
  /** Items conservés après dedup + slice. */
  kept_by_cluster: Record<ClusterId, number>;
  /** Items rejetés en dedup (URL déjà attribuée à un cluster plus prioritaire). */
  dedup_drops: number;
  /** Items qu'on a réussi à normaliser en date ISO. */
  date_normalizations: number;
  /** Clusters en échec total. */
  failed_clusters: ClusterId[];
  /** Total final cross-cluster (hors actualites_majeures). */
  total_kept: number;
}

/**
 * Normalise une string date en ISO 8601 datetime avec offset.
 * Accepte `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ssZ`, `YYYY-MM-DDTHH:mm:ss+02:00`,
 * etc. Retourne null si non parsable.
 */
export function normalizeDate(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // YYYY-MM-DD pur → ajoute T00:00:00+00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00+00:00`;
  }

  // YYYY-MM-DDTHH:mm:ss(Z|+/-HH:mm) — valide tel quel si parsable et offset présent.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    // Convertit le Z final en +00:00 pour matcher la regex Zod.
    // Convertit aussi +HHmm → +HH:mm si besoin.
    let out = trimmed.replace(/Z$/, '+00:00');
    out = out.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const d = new Date(out);
    if (Number.isNaN(d.getTime())) return null;
    return out;
  }

  // Fallback : essaie Date.parse puis reconstruit ISO avec offset.
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/Z$/, '+00:00');
}

/**
 * Tri par date décroissante. Items sans date parsable terminent en fin.
 */
function sortByDateDesc(items: InsuranceTrendItem[]): InsuranceTrendItem[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    const na = Number.isNaN(ta) ? 0 : ta;
    const nb = Number.isNaN(tb) ? 0 : tb;
    return nb - na;
  });
}

/**
 * Compose une synthese_textuelle templatisée selon les volumes observés.
 * Pas de LLM ici — la synthèse Agent 5 sert d'inventaire chiffré, pas
 * d'analyse éditoriale (laissée aux Agents 6 et 7).
 */
function composeSynthese(
  kept: Record<ClusterId, InsuranceTrendItem[]>,
  failed: ClusterId[],
  total: number,
): string {
  const tone =
    total < 10
      ? 'Semaine calme côté actualité assurance FR.'
      : total <= 20
        ? "Semaine de densité moyenne sur l'actualité assurance FR."
        : "Semaine dense sur l'actualité assurance FR.";

  const lines: string[] = [tone, `Total items vérifiés : ${total}.`];

  // Par cluster, dans l'ordre de priorité défini.
  for (const c of CLUSTERS) {
    const items = kept[c.id] ?? [];
    if (items.length === 0) {
      lines.push(`${c.label} : aucune actualité retenue.`);
      continue;
    }
    const top = items[0]!;
    lines.push(
      `${c.label} : ${items.length} entrée${items.length > 1 ? 's' : ''} — actualité phare « ${top.titre} » (${top.date.slice(0, 10)}).`,
    );
  }

  if (failed.length > 0) {
    const labels = failed.map((id) => CLUSTERS_BY_ID.get(id)?.label ?? id).join(', ');
    lines.push(
      `Note : ${failed.length} cluster${failed.length > 1 ? 's' : ''} en échec sur ce run (${labels}).`,
    );
  }

  return lines.join(' ');
}

/**
 * Compose `actualites_majeures` : top N items les plus récents toutes
 * catégories confondues, choisis pour leur impact. Heuristique de "majeur" :
 * date la plus récente + cluster prioritaire (regulation_acpr > sinistres ...).
 */
function composeMajorNews(kept: Record<ClusterId, InsuranceTrendItem[]>): InsuranceTrendItem[] {
  const all: Array<{ item: InsuranceTrendItem; priority: number; ts: number }> = [];
  for (const c of CLUSTERS) {
    for (const item of kept[c.id] ?? []) {
      const ts = new Date(item.date).getTime();
      all.push({
        item,
        priority: c.priority,
        ts: Number.isNaN(ts) ? 0 : ts,
      });
    }
  }
  // Tri : date desc, puis priorité asc (regulation_acpr=1 d'abord).
  all.sort((a, b) => b.ts - a.ts || a.priority - b.priority);
  return all.slice(0, MAJOR_NEWS_TOP_N).map((x) => x.item);
}

const EMPTY_KEPT = (): Record<ClusterId, InsuranceTrendItem[]> => ({
  regulation_acpr: [],
  sinistres_fraude: [],
  courtage_distribution: [],
  mutuelles_complementaires: [],
  insurtech_ia_assurance: [],
  back_office_productivite: [],
  signaux_faibles: [],
});

const ZERO_COUNTS = (): Record<ClusterId, number> => ({
  regulation_acpr: 0,
  sinistres_fraude: 0,
  courtage_distribution: 0,
  mutuelles_complementaires: 0,
  insurtech_ia_assurance: 0,
  back_office_productivite: 0,
  signaux_faibles: 0,
});

export interface PostProcessOutput {
  trends: InsuranceTrends;
  stats: PostProcessStats;
}

/**
 * Pipeline déterministe complet : reçoit les résultats Perplexity par
 * cluster (avec URLs déjà filtrées par url-verifier), produit l'objet
 * InsuranceTrends final + stats d'audit.
 */
export function postProcessInsuranceTrends(
  rawByCluster: Record<ClusterId, InsuranceTrendItem[]>,
  failedClusters: ClusterId[] = [],
): PostProcessOutput {
  const received_by_cluster: Record<ClusterId, number> = ZERO_COUNTS();
  for (const c of CLUSTERS) {
    received_by_cluster[c.id] = (rawByCluster[c.id] ?? []).length;
  }

  // 1. Normalisation dates + filtre items invalides.
  let date_normalizations = 0;
  const normalized: Record<ClusterId, InsuranceTrendItem[]> = EMPTY_KEPT();
  for (const c of CLUSTERS) {
    for (const item of rawByCluster[c.id] ?? []) {
      const normDate = normalizeDate(item.date);
      if (!normDate) continue; // drop silencieux des items à date non parsable
      if (normDate !== item.date) date_normalizations += 1;
      normalized[c.id].push({ ...item, date: normDate });
    }
  }

  // 2. Dedup cross-cluster : si la même URL apparaît dans plusieurs
  //    clusters, on conserve la première occurrence selon priorité.
  let dedup_drops = 0;
  const seenUrls = new Set<string>();
  const deduped: Record<ClusterId, InsuranceTrendItem[]> = EMPTY_KEPT();
  // Itère dans l'ordre des priorités (CLUSTERS est déjà ordonné priority asc).
  for (const c of CLUSTERS) {
    for (const item of normalized[c.id]) {
      const normalizedUrl = item.source_url.toLowerCase().replace(/\/+$/, '');
      if (seenUrls.has(normalizedUrl)) {
        dedup_drops += 1;
        continue;
      }
      seenUrls.add(normalizedUrl);
      deduped[c.id].push(item);
    }
  }

  // 3. Tri date DESC + slice top 5 par cluster.
  const kept: Record<ClusterId, InsuranceTrendItem[]> = EMPTY_KEPT();
  const kept_by_cluster: Record<ClusterId, number> = ZERO_COUNTS();
  let total_kept = 0;
  for (const c of CLUSTERS) {
    const sorted = sortByDateDesc(deduped[c.id]).slice(0, MAX_ITEMS_PER_CLUSTER);
    kept[c.id] = sorted;
    kept_by_cluster[c.id] = sorted.length;
    total_kept += sorted.length;
  }

  // 4. Compose actualites_majeures (top 5 cross-cluster).
  const actualites_majeures = composeMajorNews(kept);

  // 5. Compose synthese_textuelle.
  const synthese_textuelle = composeSynthese(kept, failedClusters, total_kept);

  const stats: PostProcessStats = {
    received_by_cluster,
    kept_by_cluster,
    dedup_drops,
    date_normalizations,
    failed_clusters: failedClusters,
    total_kept,
  };

  const trends: InsuranceTrends = {
    regulation_acpr: kept.regulation_acpr,
    sinistres_fraude: kept.sinistres_fraude,
    courtage_distribution: kept.courtage_distribution,
    mutuelles_complementaires: kept.mutuelles_complementaires,
    insurtech_ia_assurance: kept.insurtech_ia_assurance,
    back_office_productivite: kept.back_office_productivite,
    signaux_faibles: kept.signaux_faibles,
    actualites_majeures,
    synthese_textuelle,
  };

  return { trends, stats };
}

// Utilitaires re-exportés pour les tests.
export const _internals = {
  sortByDateDesc,
  composeSynthese,
  composeMajorNews,
} as const;

// Référence inutilisée intentionnelle (pour garder le type ClusterDef
// dans l'API si on veut un jour exposer le mapping).
export type { ClusterDef };
