import { describe, expect, it } from 'vitest';
import {
  ORIGINALITY_WEIGHTS,
  computeEditorialWarnings,
  mergeEditorialWarnings,
  sumWeights,
} from '../editorial-scoring.js';

describe('ORIGINALITY_WEIGHTS — composite weighting v2.3', () => {
  it('totals 1.00 (within float epsilon)', () => {
    expect(sumWeights()).toBeCloseTo(1.0, 5);
  });

  it('has the 7 expected sub-scores including originalite_vs_historique', () => {
    expect(Object.keys(ORIGINALITY_WEIGHTS).sort()).toEqual(
      [
        'autorite_synvex',
        'credibilite',
        'engagement_potentiel',
        'lead_trigger_presence',
        'originalite_vs_historique',
        'risque',
        'transferabilite',
      ].sort(),
    );
  });

  it('weights lead_trigger 0.20 and originalite 0.15 (diversity heavy)', () => {
    expect(ORIGINALITY_WEIGHTS.lead_trigger_presence).toBe(0.2);
    expect(ORIGINALITY_WEIGHTS.originalite_vs_historique).toBe(0.15);
  });
});

// Helper to build a winner with one scoring entry carrying given sous_scores.
function winner(sous: Record<string, number>) {
  return { scoring: [{ angle_id: 'x', score_total: 7, sous_scores: sous, commentaire: 'c' }] };
}

describe('computeEditorialWarnings — deterministic', () => {
  it('flags low_originality when all 3 winners have originalite < 5', () => {
    const winners = [
      winner({ lead_trigger_presence: 8, originalite_vs_historique: 3 }),
      winner({ lead_trigger_presence: 7, originalite_vs_historique: 4 }),
      winner({ lead_trigger_presence: 9, originalite_vs_historique: 2 }),
    ];
    const w = computeEditorialWarnings(winners);
    expect(w).toContain('low_originality_vs_recent_weeks');
    expect(w).not.toContain('no_lead_trigger_in_winners'); // lead triggers are high
  });

  it('flags no_lead_trigger when all winners have lead_trigger < 6', () => {
    const winners = [
      winner({ lead_trigger_presence: 3, originalite_vs_historique: 8 }),
      winner({ lead_trigger_presence: 5, originalite_vs_historique: 9 }),
      winner({ lead_trigger_presence: 2, originalite_vs_historique: 7 }),
    ];
    const w = computeEditorialWarnings(winners);
    expect(w).toContain('no_lead_trigger_in_winners');
    expect(w).not.toContain('low_originality_vs_recent_weeks');
  });

  it('emits no warning when at least one winner is original AND lead-triggered', () => {
    const winners = [
      winner({ lead_trigger_presence: 8, originalite_vs_historique: 8 }),
      winner({ lead_trigger_presence: 3, originalite_vs_historique: 3 }),
      winner({ lead_trigger_presence: 4, originalite_vs_historique: 4 }),
    ];
    expect(computeEditorialWarnings(winners)).toEqual([]);
  });

  it('does not flag if a sub-score is missing on some winners (cannot assert all-below)', () => {
    const winners = [
      winner({ lead_trigger_presence: 3 }), // no originalite
      winner({ lead_trigger_presence: 4, originalite_vs_historique: 2 }),
      winner({ lead_trigger_presence: 5, originalite_vs_historique: 3 }),
    ];
    // lead_trigger all < 6 → flagged ; originalite missing on winner 1 → not flagged
    const w = computeEditorialWarnings(winners);
    expect(w).toContain('no_lead_trigger_in_winners');
    expect(w).not.toContain('low_originality_vs_recent_weeks');
  });

  it('takes the MAX sub-score across a winner fusion (2 scoring entries)', () => {
    const fusionWinner = {
      scoring: [
        { angle_id: 'a', score_total: 7, sous_scores: { originalite_vs_historique: 2 }, commentaire: 'c' },
        { angle_id: 'b', score_total: 8, sous_scores: { originalite_vs_historique: 9 }, commentaire: 'c' },
      ],
    };
    // max originalite for this winner = 9 → not below 5 → no low-originality flag
    const winners = [
      fusionWinner,
      winner({ originalite_vs_historique: 3 }),
      winner({ originalite_vs_historique: 4 }),
    ];
    expect(computeEditorialWarnings(winners)).not.toContain('low_originality_vs_recent_weeks');
  });
});

describe('mergeEditorialWarnings — dedupe model + deterministic', () => {
  it('merges and dedupes', () => {
    expect(
      mergeEditorialWarnings('low_originality_vs_recent_weeks', ['low_originality_vs_recent_weeks']),
    ).toEqual(['low_originality_vs_recent_weeks']);
  });

  it('keeps both distinct warnings', () => {
    const merged = mergeEditorialWarnings('no_lead_trigger_in_winners', [
      'low_originality_vs_recent_weeks',
    ]);
    expect(merged).toHaveLength(2);
    expect(merged).toContain('no_lead_trigger_in_winners');
    expect(merged).toContain('low_originality_vs_recent_weeks');
  });

  it('handles null / empty model warning', () => {
    expect(mergeEditorialWarnings(null, [])).toEqual([]);
    expect(mergeEditorialWarnings('', ['low_originality_vs_recent_weeks'])).toEqual([
      'low_originality_vs_recent_weeks',
    ]);
  });
});
