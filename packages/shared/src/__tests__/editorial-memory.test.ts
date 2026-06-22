import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_POOL,
  ARCHETYPE_POOL_KEYS,
  ATTACK_AXES,
  type WeekHistoryRow,
  buildArchetypePoolBlock,
  buildAttackAxisBlock,
  buildEditorialHistoryBlock,
  computeAttackAxis,
  extractWeekSignals,
} from '../editorial-memory.js';

describe('ARCHETYPE_POOL — pool of 10', () => {
  it('contains exactly 10 distinct archetype keys', () => {
    expect(ARCHETYPE_POOL).toHaveLength(10);
    expect(new Set(ARCHETYPE_POOL_KEYS).size).toBe(10);
  });

  it('includes the 10 expected snake_case keys', () => {
    expect(ARCHETYPE_POOL_KEYS).toEqual([
      'constat_lucide',
      'anecdote_terrain',
      'these_marche',
      'question_contre_intuitive',
      'cas_chiffre',
      'take_controversee',
      'decryptage_process',
      'retour_experience',
      'lettre_ouverte',
      'comparaison_cross_secteur',
    ]);
  });

  it('mixes registres (not all analytique)', () => {
    const registres = new Set(ARCHETYPE_POOL.map((a) => a.registre));
    expect(registres.has('analytique')).toBe(true);
    expect(registres.has('narratif')).toBe(true);
    expect(registres.has('engageant')).toBe(true);
  });

  it('pool block lists the 10 archetypes and selection rules', () => {
    const block = buildArchetypePoolBlock();
    expect(block).toContain("POOL D'ARCHÉTYPES");
    for (const key of ARCHETYPE_POOL_KEYS) expect(block).toContain(key);
    expect(block).toContain('8 archétypes DISTINCTS');
  });
});

describe('computeAttackAxis — rotation (weekNum % 6)', () => {
  it('W24 → 24 % 6 = 0 → REGLEMENTAIRE', () => {
    expect(computeAttackAxis(24).key).toBe('REGLEMENTAIRE');
  });

  it('rotates deterministically over the 6 axes', () => {
    expect(computeAttackAxis(24).key).toBe('REGLEMENTAIRE'); // 0
    expect(computeAttackAxis(25).key).toBe('OPERATIONNEL'); // 1
    expect(computeAttackAxis(26).key).toBe('HUMAIN'); // 2
    expect(computeAttackAxis(27).key).toBe('ECONOMIQUE'); // 3
    expect(computeAttackAxis(28).key).toBe('TECHNOLOGIQUE'); // 4
    expect(computeAttackAxis(29).key).toBe('PROSPECTIF'); // 5
    expect(computeAttackAxis(30).key).toBe('REGLEMENTAIRE'); // wraps to 0
  });

  it('has exactly 6 axes', () => {
    expect(ATTACK_AXES).toHaveLength(6);
  });

  it('handles edge inputs without throwing (0, negatives, non-integers)', () => {
    expect(computeAttackAxis(0).key).toBe('REGLEMENTAIRE');
    expect(computeAttackAxis(-1).key).toBe('OPERATIONNEL'); // abs(1) % 6 = 1
    expect(computeAttackAxis(24.9).key).toBe('REGLEMENTAIRE'); // trunc → 24
  });

  it('axis block names the axis and the "2 of 3 posts" rule', () => {
    const block = buildAttackAxisBlock(24);
    expect(block).toContain('RÉGLEMENTAIRE');
    expect(block).toContain('Au moins 2 des 3 posts');
  });
});

// ---------------------------------------------------------------------------
// HISTORIQUE ÉDITORIAL
// ---------------------------------------------------------------------------
function mockWeek(weekId: string, archetypes: string[], hooks: string[]): WeekHistoryRow {
  return {
    week_id: weekId,
    angles_json: archetypes.map((a, i) => ({
      angle_id: `${weekId}-A${i + 1}`,
      archetype: a,
      titre_interne: `Titre ${a}`,
      hook_brut: `Hook angle ${a}`,
    })),
    winners_json: hooks.map((h, i) => ({ post_position: i + 1, post_final: `${h}\n\nsuite du post.` })),
  };
}

describe('buildEditorialHistoryBlock — 8 weeks of memory', () => {
  it('builds a HISTORIQUE block from 8 weeks with archetypes + hooks', () => {
    const rows: WeekHistoryRow[] = Array.from({ length: 8 }, (_, i) =>
      mockWeek(`2026-W${22 - i}`, ['constat_lucide', 'these_marche'], [`Hook semaine ${22 - i}`]),
    );
    const block = buildEditorialHistoryBlock(rows);
    expect(block).toContain('HISTORIQUE ÉDITORIAL (8 dernières semaines)');
    expect(block).toContain('[Semaine W-1 = 2026-W22]');
    expect(block).toContain('[Semaine W-8 = 2026-W15]');
    expect(block).toContain('constat_lucide');
    expect(block).toContain('Hook semaine 22');
    expect(block).toContain('RÈGLE ABSOLUE');
  });

  it('returns empty string when no weeks (fallback, no crash)', () => {
    expect(buildEditorialHistoryBlock([])).toBe('');
  });

  it('returns empty string when weeks carry no usable signals', () => {
    const rows: WeekHistoryRow[] = [
      { week_id: '2026-W20', angles_json: null, winners_json: null },
      { week_id: '2026-W19' },
    ];
    expect(buildEditorialHistoryBlock(rows)).toBe('');
  });

  it('prefers winners post_final hooks over angle hook_brut', () => {
    const block = buildEditorialHistoryBlock([
      mockWeek('2026-W22', ['cas_chiffre'], ['9 sur 12 cabinets ne tiennent pas le contrôle']),
    ]);
    expect(block).toContain('9 sur 12 cabinets ne tiennent pas le contrôle');
    expect(block).not.toContain('Hook angle cas_chiffre'); // fallback not used
  });

  it('extractWeekSignals tolerates malformed JSON shapes (defensive)', () => {
    const signals = extractWeekSignals({
      week_id: '2026-W20',
      angles_json: 'not an array' as unknown,
      winners_json: { not: 'an array' } as unknown,
    });
    expect(signals.week_id).toBe('2026-W20');
    expect(signals.archetypes).toEqual([]);
    expect(signals.hooks).toEqual([]);
  });
});
