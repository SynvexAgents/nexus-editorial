import type { ProduitSynvex } from '@nexus/shared';
import { describe, expect, it } from 'vitest';
import {
  type SupabaseLike,
  emptyCoverage,
  getRecentlyCoveredProducts,
  prioritizeProducts,
  saturatedProducts,
} from '../product-rotation.js';

// ---------------------------------------------------------------------------
// Mock Supabase chain : on simule winners_json sur N "semaines".
// ---------------------------------------------------------------------------

function buildMockSupabase(
  rows: Array<{ week_id: string; winners_json: unknown[] | null }>,
): SupabaseLike {
  return {
    from: () => ({
      select: () => ({
        lt: () => ({
          order: () => ({
            limit: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  };
}

function buildErrorSupabase(): SupabaseLike {
  return {
    from: () => ({
      select: () => ({
        lt: () => ({
          order: () => ({
            limit: async () => ({ data: null, error: { message: 'boom' } }),
          }),
        }),
      }),
    }),
  };
}

const winner = (p: ProduitSynvex): { produit_synvex_ancrage: ProduitSynvex } => ({
  produit_synvex_ancrage: p,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('emptyCoverage', () => {
  it('returns a dict with all 9 Synvex products at count 0', () => {
    const c = emptyCoverage();
    expect(Object.keys(c)).toHaveLength(9);
    for (const p of [
      'Orion',
      'Vega',
      'Chiron',
      'Argus',
      'Helios',
      'Hermès',
      'Nexus',
      'Atlas',
      'Cortex',
    ] as const) {
      expect(c[p]).toBe(0);
    }
  });
});

describe('getRecentlyCoveredProducts — happy path', () => {
  it('counts product occurrences across 4 weeks of winners_json', async () => {
    const sb = buildMockSupabase([
      { week_id: '2026-W21', winners_json: [winner('Orion'), winner('Hermès'), winner('Argus')] },
      { week_id: '2026-W20', winners_json: [winner('Hermès'), winner('Chiron'), winner('Helios')] },
      { week_id: '2026-W19', winners_json: [winner('Vega'), winner('Atlas'), winner('Cortex')] },
      { week_id: '2026-W18', winners_json: [winner('Nexus'), winner('Hermès'), winner('Argus')] },
    ]);
    const { coverage, weeks_scanned } = await getRecentlyCoveredProducts(sb, '2026-W22', 4);
    expect(weeks_scanned).toBe(4);
    expect(coverage.Hermès).toBe(3);
    expect(coverage.Argus).toBe(2);
    expect(coverage.Orion).toBe(1);
    expect(coverage.Vega).toBe(1);
    expect(coverage.Chiron).toBe(1);
    expect(coverage.Helios).toBe(1);
    expect(coverage.Atlas).toBe(1);
    expect(coverage.Cortex).toBe(1);
    expect(coverage.Nexus).toBe(1);
  });

  it('returns all-zero coverage when no recent winners', async () => {
    const sb = buildMockSupabase([]);
    const { coverage, weeks_scanned } = await getRecentlyCoveredProducts(sb, '2026-W22', 4);
    expect(weeks_scanned).toBe(0);
    expect(coverage.Orion).toBe(0);
    expect(coverage.Hermès).toBe(0);
  });

  it('tolerates winners without produit_synvex_ancrage (v1 backward compat)', async () => {
    const sb = buildMockSupabase([
      // v1 winners (sans champ produit_synvex_ancrage)
      { week_id: '2026-W20', winners_json: [{}, {}, { produit_synvex_ancrage: 'Argus' }] },
    ]);
    const { coverage } = await getRecentlyCoveredProducts(sb, '2026-W21', 4);
    expect(coverage.Argus).toBe(1);
    expect(coverage.Orion).toBe(0);
  });

  it('propagates DB errors as exceptions', async () => {
    const sb = buildErrorSupabase();
    await expect(getRecentlyCoveredProducts(sb, '2026-W22', 4)).rejects.toThrow(
      /product_rotation_query_failed/,
    );
  });
});

describe('prioritizeProducts', () => {
  it('returns products sorted by count ascending (least-covered first)', () => {
    const c = emptyCoverage();
    c.Hermès = 3;
    c.Argus = 2;
    c.Orion = 1;
    // Vega, Chiron, Helios, Nexus, Atlas, Cortex à 0 → premiers dans la priorité.
    const priority = prioritizeProducts(c);
    expect(priority).toHaveLength(9);
    // Les 6 produits à 0 doivent venir avant Orion (1), Argus (2), Hermès (3).
    expect(priority.slice(0, 6).every((p) => c[p] === 0)).toBe(true);
    expect(priority[priority.length - 1]).toBe('Hermès');
  });
});

describe('saturatedProducts', () => {
  it('returns products with count >= maxCount', () => {
    const c = emptyCoverage();
    c.Hermès = 3;
    c.Argus = 2;
    c.Orion = 1;
    expect(saturatedProducts(c, 2).sort()).toEqual(['Argus', 'Hermès'].sort());
    expect(saturatedProducts(c, 3)).toEqual(['Hermès']);
    expect(saturatedProducts(c, 5)).toEqual([]);
  });
});
