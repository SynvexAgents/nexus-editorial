// editorial-scoring — diversity engine v2.3 (mai 2026).
// Pondération du score composite Agent 7 (désormais 7 sous-scores incl.
// originalite_vs_historique) + détection déterministe des editorial_warnings.

/**
 * Pondération du score_total (7 sous-scores, somme = 1.00).
 * v2.3 : ajout de originalite_vs_historique (0.15), redistribution depuis
 * les autres pour conserver la somme à 1.00.
 */
export const ORIGINALITY_WEIGHTS: Readonly<Record<string, number>> = {
  engagement_potentiel: 0.18,
  credibilite: 0.13,
  autorite_synvex: 0.13,
  transferabilite: 0.08,
  risque: 0.13,
  lead_trigger_presence: 0.2,
  originalite_vs_historique: 0.15,
};

/** Somme des poids (doit valoir 1.00 à l'epsilon flottant près). */
export function sumWeights(weights: Readonly<Record<string, number>> = ORIGINALITY_WEIGHTS): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// editorial_warnings déterministes (lus depuis les sous-scores des winners).
// ---------------------------------------------------------------------------
interface ScoringEntryLike {
  sous_scores?: Record<string, number> | null;
}
interface WinnerLike {
  scoring?: ScoringEntryLike[] | null;
}

/** Max d'un sous-score donné sur les entrées scoring d'un winner (ou undefined). */
function maxSubScore(winner: WinnerLike, key: string): number | undefined {
  const entries = Array.isArray(winner.scoring) ? winner.scoring : [];
  let max: number | undefined;
  for (const e of entries) {
    const v = e?.sous_scores?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      max = max === undefined ? v : Math.max(max, v);
    }
  }
  return max;
}

/**
 * Renvoie true si CHAQUE winner a le sous-score `key` défini ET strictement
 * sous `threshold`. Si un winner ne porte pas le sous-score, on ne peut pas
 * affirmer "tous sous le seuil" → false (pas de warning à tort).
 */
function allWinnersBelow(winners: WinnerLike[], key: string, threshold: number): boolean {
  if (!Array.isArray(winners) || winners.length === 0) return false;
  const vals = winners.map((w) => maxSubScore(w, key));
  if (vals.some((v) => v === undefined)) return false;
  return (vals as number[]).every((v) => v < threshold);
}

/**
 * Calcule les editorial_warnings déterministes à partir des winners :
 *   - 'no_lead_trigger_in_winners'    : tous lead_trigger_presence < 6
 *   - 'low_originality_vs_recent_weeks' : tous originalite_vs_historique < 5
 */
export function computeEditorialWarnings(winners: WinnerLike[]): string[] {
  const warnings: string[] = [];
  if (allWinnersBelow(winners, 'lead_trigger_presence', 6)) {
    warnings.push('no_lead_trigger_in_winners');
  }
  if (allWinnersBelow(winners, 'originalite_vs_historique', 5)) {
    warnings.push('low_originality_vs_recent_weeks');
  }
  return warnings;
}

/**
 * Fusionne un warning éventuellement émis par le modèle avec les warnings
 * déterministes, dédupliqué. Retourne un tableau (éventuellement vide).
 */
export function mergeEditorialWarnings(
  modelWarning: string | null | undefined,
  computed: string[],
): string[] {
  const set = new Set<string>();
  if (typeof modelWarning === 'string' && modelWarning.trim().length > 0) {
    set.add(modelWarning.trim());
  }
  for (const w of computed) set.add(w);
  return [...set];
}
