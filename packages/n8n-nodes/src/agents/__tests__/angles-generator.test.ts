import type {
  Angle,
  Archetype,
  InsuranceTrends,
  LinkedinTrends,
  WeeklyAngles,
} from '@nexus/shared';
import { describe, expect, it, vi } from 'vitest';
import { type AnglesInput, type AnthropicLike, generateAngles } from '../angles-generator.js';
import { postProcessAngles } from '../angles-post-processor.js';
import { cosineSimilarity, matchVoicePack } from '../voice-pack-matcher.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ARCHETYPES: Archetype[] = [
  'constat_lucide',
  'retour_experience_metier',
  'contrarian_assurance',
  'pedagogie_technique',
  'observation_signal_faible',
  'analyse_donnee',
  'anecdote_terrain',
  'these_marche',
];

function makeAngle(over: Partial<Angle> & { archetype: Archetype }, idx: number): Angle {
  const base: Angle = {
    angle_id: `W20-A${idx + 1}`,
    archetype: over.archetype,
    titre_interne: `Titre interne ${over.archetype}`,
    hook_brut: `Hook brut pour ${over.archetype}.`,
    these_centrale: 'Thèse centrale défendue avec un argument structurel.',
    promesse_lecteur: 'Le lecteur comprend une mécanique métier.',
    structure_proposee: 'Constat → mécanique → implication.',
    longueur_cible: 'moyen',
    tonalite: 'sec analytique',
    ancrage_assurance: 'Ratio S/P en hausse sur les portefeuilles IARD courtage.',
    ancrage_linkedin: 'Hook chiffre observé dans le top 10 LinkedIn FR.',
    icp_vise: 'courtier',
    risques: ['ton qui dérape vers prescriptif'],
  };
  return { ...base, ...over };
}

function makeValidWeeklyAngles(): WeeklyAngles {
  return ARCHETYPES.map((a, i) => makeAngle({ archetype: a }, i)) as WeeklyAngles;
}

const LINKEDIN_TRENDS: LinkedinTrends = {
  top_hooks: [{ type: 'stat_choc', frequency: 5, avg_engagement_norm: 1.5, example_post_id: 'p1' }],
  top_formats: [{ format: 'analyse', frequency: 8, avg_engagement_norm: 1.2 }],
  top_topic_clusters: [{ cluster: 'pilotage', frequency: 3, avg_engagement_norm: 1.4 }],
  rising_topics: ['IBNR'],
  falling_topics: [],
  tone_dominant: 'lucide',
  longueur_optimale_p50_p90: [500, 1200],
  mecaniques_emergentes: ['chiffre concret en hook'],
  best_days_observed: [{ day: 'Mar', avg_engagement_norm: 1.3 }],
  best_hours_observed: [{ hour_bucket: '8-10', avg_engagement_norm: 1.4 }],
  format_performance: [{ format: 'analyse', avg_engagement_norm: 1.3 }],
  ten_best_posts: [{ post_id: 'p1', score: 2.5, summary: 'Post test.' }],
  synthese_textuelle: 'Synthèse LinkedIn de test pour la semaine.',
};

const INSURANCE_TRENDS: InsuranceTrends = {
  regulation_acpr: [],
  sinistres_fraude: [
    {
      titre: 'Sécheresse 2026 : franchise 1 520 €',
      source_url: 'https://acpr.banque-france.fr/test',
      resume_2_lignes: 'Résumé.',
      date: '2026-05-10T00:00:00+00:00',
      impact_metier: 'Impact courtage.',
    },
  ],
  courtage_distribution: [],
  mutuelles_complementaires: [],
  insurtech_ia_assurance: [],
  back_office_productivite: [],
  signaux_faibles: [],
  actualites_majeures: [
    {
      titre: 'Sécheresse 2026 : franchise 1 520 €',
      source_url: 'https://acpr.banque-france.fr/test',
      resume_2_lignes: 'Résumé.',
      date: '2026-05-10T00:00:00+00:00',
      impact_metier: 'Impact courtage.',
    },
  ],
  synthese_textuelle: 'Synthèse assurance de test.',
};

const INPUT: AnglesInput = {
  week_id: '2026-W20',
  linkedin_trends: LINKEDIN_TRENDS,
  insurance_trends: INSURANCE_TRENDS,
  voice_pack_excerpts: [],
};

const baseUsage = {
  input_tokens: 3000,
  output_tokens: 2000,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

function mockClient(textResponses: string[]): {
  client: AnthropicLike;
  create: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const create = vi.fn(async () => {
    const text = textResponses[i] ?? textResponses[textResponses.length - 1]!;
    i += 1;
    return {
      content: [{ type: 'text' as const, text }],
      usage: { ...baseUsage },
      stop_reason: 'end_turn',
    };
  });
  return { client: { messages: { create } }, create };
}

/**
 * Compose un JSON complet `{"angles": [...]}` — pas de prefill assistant
 * sur Opus 4.7, donc Claude renvoie le `{` complet en tête.
 */
function jsonText(angles: WeeklyAngles): string {
  return JSON.stringify({ angles });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateAngles — happy path', () => {
  it('returns 8 valid angles on first attempt with cost computed', async () => {
    const validAngles = makeValidWeeklyAngles();
    const { client, create } = mockClient([jsonText(validAngles)]);

    const result = await generateAngles(INPUT, { client });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.angles).toHaveLength(8);
    const seenArchetypes = new Set(result.angles.map((a) => a.archetype));
    expect(seenArchetypes.size).toBe(8);
    // Cost = 3000/1e6 × 5 + 2000/1e6 × 25 = 0.015 + 0.05 = 0.065 USD
    expect(result.usage.cost_usd).toBeCloseTo(0.065, 5);
    expect(result.usage.cost_eur).toBeCloseTo(0.065 * 0.92, 5);
  });
});

describe('generateAngles — retry on Zod fail (.length() != 8)', () => {
  it('retries with corrective prompt when first response has 7 angles', async () => {
    const sevenAngles = makeValidWeeklyAngles().slice(0, 7) as unknown as WeeklyAngles;
    const eightAngles = makeValidWeeklyAngles();
    const { client, create } = mockClient([jsonText(sevenAngles), jsonText(eightAngles)]);

    const result = await generateAngles(INPUT, { client });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    expect(result.angles).toHaveLength(8);
    // Vérifie qu'un corrective turn mentionne Zod / length.
    const secondCallParams = create.mock.calls[1]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userCorrective = secondCallParams.messages[2]!;
    expect(userCorrective.role).toBe('user');
    expect(userCorrective.content).toMatch(/Zod/);
  });
});

describe('generateAngles — retry on archetype duplicates', () => {
  it('retries when two angles share the same archetype', async () => {
    // 8 angles mais constat_lucide dupliqué (× 2), pas de these_marche.
    const dupAngles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a === 'these_marche' ? 'constat_lucide' : a }, i),
    ) as WeeklyAngles;
    const fixed = makeValidWeeklyAngles();
    const { client, create } = mockClient([jsonText(dupAngles), jsonText(fixed)]);

    const result = await generateAngles(INPUT, { client });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    // Le corrective user-turn doit mentionner les archétypes en doublon / manquants.
    const secondCallParams = create.mock.calls[1]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const corrective = secondCallParams.messages[2]!;
    expect(corrective.content).toMatch(/(dupliqué|manquant|archétype)/i);
  });
});

describe('generateAngles — throw after 2 archetype failures', () => {
  it('throws diagnostic message if both attempts have archetype issues', async () => {
    const dupAngles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a === 'these_marche' ? 'constat_lucide' : a }, i),
    ) as WeeklyAngles;
    const { client } = mockClient([jsonText(dupAngles), jsonText(dupAngles)]);

    await expect(generateAngles(INPUT, { client })).rejects.toThrow(
      /generate_angles_failed_after_2_attempts/,
    );
  });
});

describe('postProcessAngles — angle_id regenerated mechanically', () => {
  it('overrides any angle_id from Claude and writes W{week}-A{1..8}', () => {
    const angles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a, angle_id: `WTF-X${i}` as never }, i),
    ) as WeeklyAngles;

    const result = postProcessAngles(angles, '2026-W20');

    expect(result.angles.map((a) => a.angle_id)).toEqual([
      'W20-A1',
      'W20-A2',
      'W20-A3',
      'W20-A4',
      'W20-A5',
      'W20-A6',
      'W20-A7',
      'W20-A8',
    ]);
  });
});

describe('postProcessAngles — flags ancrage_assurance trivial', () => {
  it('flags angles whose ancrage_assurance has no insurance term', () => {
    const trivialAngles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle(
        {
          archetype: a,
          ancrage_assurance: 'Le secteur évolue rapidement et de nombreux acteurs y participent.',
        },
        i,
      ),
    ) as WeeklyAngles;
    const result = postProcessAngles(trivialAngles, '2026-W20');
    expect(result.validation_report.ancrage_assurance_flagged).toHaveLength(8);
    expect(result.validation_report.ancrage_assurance_ok).toBe(0);
  });

  it('does NOT flag when ancrage contains an insurance term', () => {
    const valid = makeValidWeeklyAngles(); // ancrage contient "S/P"
    const result = postProcessAngles(valid, '2026-W20');
    expect(result.validation_report.ancrage_assurance_flagged).toHaveLength(0);
    expect(result.validation_report.ancrage_assurance_ok).toBe(8);
  });
});

describe('postProcessAngles — flags Synvex product name mention', () => {
  it('detects "Argus" in any free-text field', () => {
    const polluted: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle(
        {
          archetype: a,
          // Argus est un nom produit Synvex banni.
          these_centrale:
            i === 0
              ? "L'outil Argus permettrait de réduire les délais sinistres."
              : 'Thèse standard sans mention produit.',
        },
        i,
      ),
    ) as WeeklyAngles;
    const result = postProcessAngles(polluted, '2026-W20');
    expect(result.validation_report.synvex_mention_flagged.length).toBeGreaterThan(0);
    expect(result.validation_report.has_critical_flags).toBe(true);
    expect(result.validation_report.synvex_mention_flagged[0]!.angle_id).toBe('W20-A1');
  });
});

describe('postProcessAngles — diversity counts', () => {
  it('computes distinct ICP and longueur counts', () => {
    const mixed: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle(
        {
          archetype: a,
          icp_vise: (['courtier', 'MGA', 'mutuelle', 'insurtech'] as const)[i % 4]!,
          longueur_cible: (['court', 'moyen', 'long'] as const)[i % 3]!,
        },
        i,
      ),
    ) as WeeklyAngles;
    const result = postProcessAngles(mixed, '2026-W20');
    expect(result.validation_report.icp_vises_distinct).toBe(4);
    expect(result.validation_report.longueur_cibles_distinct).toBe(3);
  });
});

describe('postProcessAngles — fills empty risques with placeholder', () => {
  it('writes a placeholder risk when risques is empty array', () => {
    const empty: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a, risques: [] }, i),
    ) as WeeklyAngles;
    const result = postProcessAngles(empty, '2026-W20');
    expect(result.validation_report.empty_risks_filled).toHaveLength(8);
    expect(result.angles[0]!.risques).toHaveLength(1);
    expect(result.angles[0]!.risques[0]).toMatch(/placeholder/);
  });
});

// ---------------------------------------------------------------------------
// v2 mai 2026 — Tests produit Synvex (rotation + diversité)
// ---------------------------------------------------------------------------

describe('postProcessAngles — v2 produit Synvex ancrage', () => {
  it('reports 8 distinct products when each angle uses a different product', () => {
    const produits = [
      'Orion',
      'Vega',
      'Chiron',
      'Argus',
      'Helios',
      'Hermès',
      'Nexus',
      'Atlas',
    ] as const;
    const angles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a, produit_synvex_ancrage: produits[i] }, i),
    ) as WeeklyAngles;
    const result = postProcessAngles(angles, '2026-W20');
    expect(result.validation_report.produits_synvex_distinct).toBe(8);
    expect(result.validation_report.produit_synvex_diversity_ok).toBe(true);
    expect(result.validation_report.produit_synvex_missing).toHaveLength(0);
  });

  it('flags angles without produit_synvex_ancrage (backward compat v1)', () => {
    const angles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a }, i),
    ) as WeeklyAngles;
    const result = postProcessAngles(angles, '2026-W20');
    expect(result.validation_report.produit_synvex_missing).toHaveLength(8);
    expect(result.validation_report.produits_synvex_distinct).toBe(0);
    expect(result.validation_report.produit_synvex_diversity_ok).toBe(false);
  });

  it('flags diversity insufficient when only 3 distinct products on 8 angles', () => {
    // 3 produits seulement (Orion x3, Argus x3, Hermès x2) → diversité KO (< 5).
    const cycle = ['Orion', 'Argus', 'Hermès'] as const;
    const angles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a, produit_synvex_ancrage: cycle[i % 3] }, i),
    ) as WeeklyAngles;
    const result = postProcessAngles(angles, '2026-W20');
    expect(result.validation_report.produits_synvex_distinct).toBe(3);
    expect(result.validation_report.produit_synvex_diversity_ok).toBe(false);
  });

  it('accepts ≥ 5 distinct products as diversity_ok', () => {
    const produits = [
      'Orion',
      'Vega',
      'Chiron',
      'Argus',
      'Helios',
      'Orion',
      'Vega',
      'Chiron',
    ] as const;
    const angles: WeeklyAngles = ARCHETYPES.map((a, i) =>
      makeAngle({ archetype: a, produit_synvex_ancrage: produits[i] }, i),
    ) as WeeklyAngles;
    const result = postProcessAngles(angles, '2026-W20');
    expect(result.validation_report.produits_synvex_distinct).toBe(5);
    expect(result.validation_report.produit_synvex_diversity_ok).toBe(true);
  });
});

describe('voice-pack-matcher — empty pack falls back gracefully', () => {
  it('returns [] when no active rows exist in voice_pack', async () => {
    const supabaseMock = {
      from: () => ({
        select: () => ({
          eq: () => ({
            returns: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };
    const result = await matchVoicePack('test context', supabaseMock as never);
    expect(result).toEqual([]);
  });
});

describe('voice-pack-matcher — cosine similarity', () => {
  it('computes cosine correctly for identical and orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
    expect(cosineSimilarity([1, 1, 0], [1, 0, 0])).toBeCloseTo(Math.SQRT1_2, 4);
    expect(cosineSimilarity([0, 0, 0], [1, 1, 1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0); // dim mismatch
  });
});
