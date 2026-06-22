// editorial-scoring (Deno copy) — miroir 1:1 de
// packages/shared/src/editorial-scoring.ts. La copie packages/ fait foi (Vitest).

export const ORIGINALITY_WEIGHTS: Readonly<Record<string, number>> = {
  engagement_potentiel: 0.18,
  credibilite: 0.13,
  autorite_synvex: 0.13,
  transferabilite: 0.08,
  risque: 0.13,
  lead_trigger_presence: 0.2,
  originalite_vs_historique: 0.15,
};

export function sumWeights(weights: Readonly<Record<string, number>> = ORIGINALITY_WEIGHTS): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

interface ScoringEntryLike {
  sous_scores?: Record<string, number> | null;
}
interface WinnerLike {
  scoring?: ScoringEntryLike[] | null;
}

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

function allWinnersBelow(winners: WinnerLike[], key: string, threshold: number): boolean {
  if (!Array.isArray(winners) || winners.length === 0) return false;
  const vals = winners.map((w) => maxSubScore(w, key));
  if (vals.some((v) => v === undefined)) return false;
  return (vals as number[]).every((v) => v < threshold);
}

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
