import type { InsuranceTrendItem } from '@nexus/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ClusterId } from '../insurance-clusters.js';
import {
  type RawClusterResult,
  normalizeDate,
  postProcessInsuranceTrends,
} from '../insurance-trends-post-processor.js';
import { extractJsonArray, synthesizeInsuranceTrends } from '../insurance-trends-synthesizer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WEEK_RANGE = { date_start: '2026-05-08', date_end: '2026-05-14' };

function makeItem(over: Partial<InsuranceTrendItem> = {}): InsuranceTrendItem {
  return {
    titre: 'Titre par défaut',
    source_url: 'https://acpr.banque-france.fr/article/test',
    resume_2_lignes: "Résumé factuel de l'actualité en deux lignes maximum.",
    date: '2026-05-12T00:00:00+00:00',
    impact_metier: 'Implication concrète pour un cabinet de courtage IARD français.',
    ...over,
  };
}

function buildPerplexityResponse(
  items: InsuranceTrendItem[],
  inputTokens = 800,
  outputTokens = 400,
) {
  return {
    choices: [{ message: { content: JSON.stringify(items) } }],
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens },
  };
}

/**
 * Mock fetch global : on intercepte les deux types d'appel.
 * - Perplexity : POST https://api.perplexity.ai/chat/completions
 * - URL verifier : HEAD/GET sur n'importe quelle URL.
 *
 * `clusterPayloads` = map cluster_id (par mot-clé du prompt) → items à
 * retourner. `urlResponses` = map URL → status à retourner (default 200).
 * `urlError` = liste d'URLs à faire échouer (network error).
 */
interface MockFetchOptions {
  clusterPayloads: Array<{ matchPrompt: RegExp; items: InsuranceTrendItem[] }>;
  /** Fail this cluster regardless of payload (returns 500). */
  failClusters?: RegExp[];
  urlStatuses?: Map<string, number>;
  urlErrors?: Set<string>;
}

function buildMockFetch(opts: MockFetchOptions): typeof fetch {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';

    // Perplexity call
    if (url.startsWith('https://api.perplexity.ai/')) {
      const body = init?.body ? String(init.body) : '';
      // Check fail clusters first
      for (const failRe of opts.failClusters ?? []) {
        if (failRe.test(body)) {
          return new Response('server error', { status: 500, statusText: 'Internal Server Error' });
        }
      }
      // Find matching cluster
      for (const { matchPrompt, items } of opts.clusterPayloads) {
        if (matchPrompt.test(body)) {
          return new Response(JSON.stringify(buildPerplexityResponse(items)), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
      // No match → empty
      return new Response(JSON.stringify(buildPerplexityResponse([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // URL verifier (HEAD)
    if (method === 'HEAD' || method === 'GET') {
      if (opts.urlErrors?.has(url)) {
        throw new Error('network failure');
      }
      const status = opts.urlStatuses?.get(url) ?? 200;
      // `new Response` rejette les codes hors [200, 599]. Pour mocker un 999
      // (anti-bot LinkedIn) on retourne un Response-like minimal — url-verifier
      // ne lit que `res.status`.
      if (status >= 200 && status <= 599) {
        return new Response('', { status });
      }
      return { status } as unknown as Response;
    }

    return new Response('not implemented', { status: 501 });
  }) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// extractJsonArray
// ---------------------------------------------------------------------------

describe('extractJsonArray — robustness', () => {
  it('parses a clean JSON array', () => {
    const out = extractJsonArray('[{"a":1},{"a":2}]');
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('strips markdown fences around the array', () => {
    const out = extractJsonArray('```json\n[{"a":1}]\n```');
    expect(out).toEqual([{ a: 1 }]);
  });

  it('tolerates leading text before the array', () => {
    const out = extractJsonArray('Voici les résultats:\n\n[{"a":1}]');
    expect(out).toEqual([{ a: 1 }]);
  });

  it('throws when no array is found', () => {
    expect(() => extractJsonArray('no json here')).toThrow(/no_json_array_found/);
  });
});

// ---------------------------------------------------------------------------
// normalizeDate
// ---------------------------------------------------------------------------

describe('normalizeDate', () => {
  it('converts YYYY-MM-DD to ISO with offset', () => {
    expect(normalizeDate('2026-05-12')).toBe('2026-05-12T00:00:00+00:00');
  });
  it('keeps ISO datetime with offset as-is (normalises Z to +00:00)', () => {
    expect(normalizeDate('2026-05-12T08:30:00Z')).toBe('2026-05-12T08:30:00+00:00');
    expect(normalizeDate('2026-05-12T08:30:00+02:00')).toBe('2026-05-12T08:30:00+02:00');
  });
  it('returns null for invalid input', () => {
    expect(normalizeDate('not a date')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// postProcessInsuranceTrends (unit tests of the deterministic layer)
// ---------------------------------------------------------------------------

describe('postProcessInsuranceTrends — dedup cross-cluster', () => {
  it('keeps the URL only in the higher-priority cluster (regulation_acpr > insurtech)', () => {
    const sharedUrl = 'https://acpr.banque-france.fr/article/x';
    const raw: Record<ClusterId, InsuranceTrendItem[]> = {
      regulation_acpr: [makeItem({ source_url: sharedUrl, titre: 'ACPR version' })],
      sinistres_fraude: [],
      courtage_distribution: [],
      mutuelles_complementaires: [],
      insurtech_ia_assurance: [makeItem({ source_url: sharedUrl, titre: 'Insurtech version' })],
      back_office_productivite: [],
      signaux_faibles: [],
    };
    const { trends, stats } = postProcessInsuranceTrends(raw);
    expect(trends.regulation_acpr).toHaveLength(1);
    expect(trends.insurtech_ia_assurance).toHaveLength(0);
    expect(stats.dedup_drops).toBe(1);
  });
});

describe('postProcessInsuranceTrends — limit 5 par cluster (tri date desc)', () => {
  it('garde les 5 items les plus récents', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeItem({
        source_url: `https://acpr.banque-france.fr/article/${i}`,
        titre: `Article ${i}`,
        // Plus i est haut, plus la date est récente
        date: `2026-05-${String(7 + i).padStart(2, '0')}T00:00:00+00:00`,
      }),
    );
    const raw: Record<ClusterId, InsuranceTrendItem[]> = {
      regulation_acpr: items,
      sinistres_fraude: [],
      courtage_distribution: [],
      mutuelles_complementaires: [],
      insurtech_ia_assurance: [],
      back_office_productivite: [],
      signaux_faibles: [],
    };
    const { trends } = postProcessInsuranceTrends(raw);
    expect(trends.regulation_acpr).toHaveLength(5);
    // Les 5 plus récents → indices 7, 6, 5, 4, 3 (date 14, 13, 12, 11, 10)
    expect(trends.regulation_acpr[0]?.titre).toBe('Article 7');
    expect(trends.regulation_acpr[4]?.titre).toBe('Article 3');
  });
});

describe('postProcessInsuranceTrends — synthese_textuelle templatisée', () => {
  it('inclut "Semaine calme" si total_kept < 10', () => {
    const raw: Record<ClusterId, InsuranceTrendItem[]> = {
      regulation_acpr: [makeItem({ source_url: 'https://acpr.banque-france.fr/a' })],
      sinistres_fraude: [makeItem({ source_url: 'https://argusdelassurance.com/b' })],
      courtage_distribution: [],
      mutuelles_complementaires: [],
      insurtech_ia_assurance: [],
      back_office_productivite: [],
      signaux_faibles: [],
    };
    const { trends } = postProcessInsuranceTrends(raw);
    expect(trends.synthese_textuelle).toMatch(/Semaine calme/i);
    expect(trends.synthese_textuelle).toMatch(/Total items vérifiés : 2/);
  });

  it('signale les clusters en échec', () => {
    const raw: Record<ClusterId, InsuranceTrendItem[]> = {
      regulation_acpr: [makeItem({ source_url: 'https://acpr.banque-france.fr/a' })],
      sinistres_fraude: [],
      courtage_distribution: [],
      mutuelles_complementaires: [],
      insurtech_ia_assurance: [],
      back_office_productivite: [],
      signaux_faibles: [],
    };
    const { trends } = postProcessInsuranceTrends(raw, ['sinistres_fraude', 'signaux_faibles']);
    expect(trends.synthese_textuelle).toMatch(/2 clusters en échec/i);
  });
});

describe('postProcessInsuranceTrends — actualites_majeures composé', () => {
  it('compose top 5 items les plus récents cross-cluster', () => {
    const raw: Record<ClusterId, InsuranceTrendItem[]> = {
      regulation_acpr: [
        makeItem({
          source_url: 'https://a.com/1',
          titre: 'ACPR récent',
          date: '2026-05-14T00:00:00+00:00',
        }),
      ],
      sinistres_fraude: [
        makeItem({
          source_url: 'https://b.com/1',
          titre: 'Sinistres très récent',
          date: '2026-05-13T00:00:00+00:00',
        }),
        makeItem({
          source_url: 'https://b.com/2',
          titre: 'Sinistres ancien',
          date: '2026-05-08T00:00:00+00:00',
        }),
      ],
      courtage_distribution: [],
      mutuelles_complementaires: [],
      insurtech_ia_assurance: [],
      back_office_productivite: [],
      signaux_faibles: [],
    };
    const { trends } = postProcessInsuranceTrends(raw);
    expect(trends.actualites_majeures).toHaveLength(3);
    expect(trends.actualites_majeures[0]?.titre).toBe('ACPR récent');
    expect(trends.actualites_majeures[1]?.titre).toBe('Sinistres très récent');
    expect(trends.actualites_majeures[2]?.titre).toBe('Sinistres ancien');
  });
});

// ---------------------------------------------------------------------------
// synthesizeInsuranceTrends (orchestrateur end-to-end avec mock fetch)
// ---------------------------------------------------------------------------

describe('synthesizeInsuranceTrends — happy path 7 clusters', () => {
  it('returns valid InsuranceTrends with cost', async () => {
    const items = [
      makeItem({
        source_url: 'https://acpr.banque-france.fr/x1',
        titre: 'ACPR doctrine IA',
        date: '2026-05-12',
      }),
      makeItem({
        source_url: 'https://argusdelassurance.com/x2',
        titre: 'Sanction ACPR',
        date: '2026-05-10',
      }),
    ];
    const fetchImpl = buildMockFetch({
      clusterPayloads: [{ matchPrompt: /./, items }], // tout cluster reçoit les mêmes 2 items
    });

    const result = await synthesizeInsuranceTrends('2026-W20', WEEK_RANGE, {
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(result.trends.regulation_acpr.length).toBeGreaterThan(0);
    // Dedup cross-cluster : les 2 URLs ne peuvent apparaître qu'une fois au total.
    // Comme tous les 7 clusters retournent ces 2 URLs, seul regulation_acpr (prio 1) les conserve.
    const allItems = [
      ...result.trends.regulation_acpr,
      ...result.trends.sinistres_fraude,
      ...result.trends.courtage_distribution,
      ...result.trends.mutuelles_complementaires,
      ...result.trends.insurtech_ia_assurance,
      ...result.trends.back_office_productivite,
      ...result.trends.signaux_faibles,
    ];
    expect(allItems).toHaveLength(2);
    expect(result.per_cluster).toHaveLength(7);
    expect(result.usage.total_cost_usd).toBeGreaterThan(0);
  });
});

describe('synthesizeInsuranceTrends — dégradé : 2 clusters échouent', () => {
  it('continue avec les 5 autres et marque les 2 en échec', { timeout: 30000 }, async () => {
    const items = [makeItem({ source_url: 'https://acpr.banque-france.fr/x', date: '2026-05-12' })];
    const fetchImpl = buildMockFetch({
      clusterPayloads: [{ matchPrompt: /./, items }],
      failClusters: [/sinistres assurance/i, /mutuelles santé/i],
    });

    const result = await synthesizeInsuranceTrends('2026-W20', WEEK_RANGE, {
      apiKey: 'test-key',
      fetchImpl,
    });

    const failed = result.per_cluster.filter((c) => c.status === 'failed');
    expect(failed).toHaveLength(2);
    expect(failed.map((f) => f.cluster_id).sort()).toEqual([
      'mutuelles_complementaires',
      'sinistres_fraude',
    ]);
    expect(result.post_process_stats.failed_clusters).toContain('sinistres_fraude');
    expect(result.post_process_stats.failed_clusters).toContain('mutuelles_complementaires');
  });
});

describe('synthesizeInsuranceTrends — tous échouent → throw', () => {
  it('throws "all_clusters_failed" si tous les 7 retournent 500', { timeout: 60000 }, async () => {
    const fetchImpl = buildMockFetch({
      clusterPayloads: [],
      failClusters: [/./],
    });

    await expect(
      synthesizeInsuranceTrends('2026-W20', WEEK_RANGE, { apiKey: 'test-key', fetchImpl }),
    ).rejects.toThrow(/all_clusters_failed/);
  });
});

describe('synthesizeInsuranceTrends — URL 404 filtrée', () => {
  it('drops items dont source_url retourne 404', async () => {
    const goodUrl = 'https://acpr.banque-france.fr/good';
    const badUrl = 'https://argusdelassurance.com/dead';
    const items = [
      makeItem({ source_url: goodUrl, titre: 'Vivant', date: '2026-05-12' }),
      makeItem({ source_url: badUrl, titre: 'Mort', date: '2026-05-10' }),
    ];
    const urlStatuses = new Map<string, number>([
      [goodUrl, 200],
      [badUrl, 404],
    ]);
    const fetchImpl = buildMockFetch({
      clusterPayloads: [{ matchPrompt: /ACPR/i, items }],
      urlStatuses,
    });

    const result = await synthesizeInsuranceTrends('2026-W20', WEEK_RANGE, {
      apiKey: 'test-key',
      fetchImpl,
    });

    const all = [
      ...result.trends.regulation_acpr,
      ...result.trends.sinistres_fraude,
      ...result.trends.courtage_distribution,
      ...result.trends.mutuelles_complementaires,
      ...result.trends.insurtech_ia_assurance,
      ...result.trends.back_office_productivite,
      ...result.trends.signaux_faibles,
    ];
    expect(all).toHaveLength(1);
    expect(all[0]?.titre).toBe('Vivant');
    expect(result.per_cluster.find((c) => c.cluster_id === 'regulation_acpr')?.url_rejected).toBe(
      1,
    );
  });
});

describe('synthesizeInsuranceTrends — URL 999 conservée (anti-bot LinkedIn-like)', () => {
  it('keeps items dont source_url retourne 999', async () => {
    const url999 = 'https://www.linkedin.com/pulse/article-some';
    const items = [makeItem({ source_url: url999, titre: 'Avec 999', date: '2026-05-12' })];
    const urlStatuses = new Map<string, number>([[url999, 999]]);
    const fetchImpl = buildMockFetch({
      clusterPayloads: [{ matchPrompt: /ACPR/i, items }],
      urlStatuses,
    });

    const result = await synthesizeInsuranceTrends('2026-W20', WEEK_RANGE, {
      apiKey: 'test-key',
      fetchImpl,
    });

    expect(result.trends.regulation_acpr).toHaveLength(1);
    expect(result.trends.regulation_acpr[0]?.titre).toBe('Avec 999');
  });
});
