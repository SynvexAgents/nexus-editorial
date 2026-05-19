import type {
  Angle,
  Archetype,
  InsuranceTrends,
  LinkedinTrends,
  WeeklyAngles,
  WeeklyWinner,
  WeeklyWinners,
} from '@nexus/shared';
import { describe, expect, it, vi } from 'vitest';
import { postProcessWinners } from '../winners-post-processor.js';
import {
  type AnthropicLike,
  type WinnersInput,
  selectAndWriteWinners,
} from '../winners-selector.js';

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
    hook_brut: 'Hook brut.',
    these_centrale: 'Thèse centrale.',
    promesse_lecteur: 'Promesse lecteur.',
    structure_proposee: 'Constat → mécanique → implication.',
    longueur_cible: 'moyen',
    tonalite: 'sec analytique',
    ancrage_assurance: 'Ratio S/P en hausse.',
    ancrage_linkedin: 'Hook chiffre.',
    icp_vise: 'courtier',
    risques: ['ton qui dérape'],
  };
  return { ...base, ...over };
}

function makeAngles(): WeeklyAngles {
  // ICP varied par index pour qu'un lookup retourne des ICP distincts dans les
  // tests qui n'overrident pas explicitement.
  const icpRotation: Angle['icp_vise'][] = [
    'courtier',
    'MGA',
    'mutuelle',
    'insurtech',
    'dirigeant_general',
  ];
  return ARCHETYPES.map((a, i) =>
    makeAngle({ archetype: a, icp_vise: icpRotation[i % icpRotation.length]! }, i),
  ) as WeeklyAngles;
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
  synthese_textuelle: 'Synthèse LinkedIn test.',
};

const INSURANCE_TRENDS: InsuranceTrends = {
  regulation_acpr: [],
  sinistres_fraude: [],
  courtage_distribution: [],
  mutuelles_complementaires: [],
  insurtech_ia_assurance: [],
  back_office_productivite: [],
  signaux_faibles: [],
  actualites_majeures: [],
  synthese_textuelle: 'Synthèse assurance test.',
};

const VALID_POST_CONTENT =
  "Le ratio S/P moyen sur les portefeuilles IARD dépasse 95 % au T1. Les courtiers absorbent l'écart en gestion sinistres. La marge se compresse silencieusement. Vous le voyez sur quels segments ?";

function makeWinner(
  position: 1 | 2 | 3,
  over: Partial<WeeklyWinner> = {},
  angle?: Angle,
): WeeklyWinner {
  const angleId = angle?.angle_id ?? `W20-A${position}`;
  const base: WeeklyWinner = {
    post_position: position,
    winner_id: angleId,
    fusion_used: false,
    scoring: [
      {
        angle_id: angleId,
        score_total: 7.8,
        sous_scores: {
          engagement_potentiel: 8,
          credibilite: 8,
          autorite_synvex: 7,
          transferabilite: 8,
          risque: 8,
        },
        commentaire: 'Bon mix engagement/crédibilité.',
      },
    ],
    rationale_strategique: 'Couvre le pan opérationnel avec une mécanique chiffre concret en hook.',
    post_final: VALID_POST_CONTENT,
    hook_variantes: [
      'Le ratio S/P dépasse 95 %.',
      "Sur le T1, l'écart absorbé par les courtiers est passé à 95 %.",
      "Une compression silencieuse de marge s'installe sur l'IARD.",
    ],
    cta_recommande: 'aucun CTA',
    longueur_finale: VALID_POST_CONTENT.length,
    checklist_qualite_passee: {
      anti_cliche_ok: true,
      ancrage_actu_assurance_ok: true,
      ton_synvex_ok: true,
      longueur_alignee_tendance_ok: true,
      absence_survente_ok: true,
      vocabulaire_metier_ok: true,
    },
  };
  return { ...base, ...over };
}

function makeValidWinners(): WeeklyWinners {
  // 3 winners avec archétypes et ICP différents → complémentarité respectée.
  return [
    makeWinner(1, {}, makeAngle({ archetype: 'constat_lucide', icp_vise: 'courtier' }, 0)),
    makeWinner(
      2,
      {
        winner_id: 'W20-A3',
        scoring: [{ angle_id: 'W20-A3', score_total: 7.2, sous_scores: {}, commentaire: 'c' }],
      },
      makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
    ),
    makeWinner(
      3,
      {
        winner_id: 'W20-A6',
        scoring: [{ angle_id: 'W20-A6', score_total: 7.5, sous_scores: {}, commentaire: 'c' }],
      },
      makeAngle({ archetype: 'analyse_donnee', icp_vise: 'mutuelle' }, 5),
    ),
  ] as WeeklyWinners;
}

const INPUT: WinnersInput = {
  week_id: '2026-W20',
  angles: makeAngles(),
  linkedin_trends: LINKEDIN_TRENDS,
  insurance_trends: INSURANCE_TRENDS,
};

const baseUsage = {
  input_tokens: 5000,
  output_tokens: 4000,
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

function jsonText(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectAndWriteWinners — happy path', () => {
  it('returns 3 valid winners on first attempt with cost', async () => {
    const winners = makeValidWinners();
    const { client, create } = mockClient([jsonText({ winners })]);

    const result = await selectAndWriteWinners(INPUT, { client });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.winners).toHaveLength(3);
    expect(result.winners[0]!.post_position).toBe(1);
    // Cost = 5000/1e6 × 5 + 4000/1e6 × 25 = 0.025 + 0.10 = 0.125 USD
    expect(result.usage.cost_usd).toBeCloseTo(0.125, 5);
  });
});

describe('selectAndWriteWinners — retry on Zod fail (.length() != 3)', () => {
  it('retries with corrective prompt when first response has 2 winners', async () => {
    const twoWinners = makeValidWinners().slice(0, 2) as unknown as WeeklyWinners;
    const { client, create } = mockClient([
      jsonText({ winners: twoWinners }),
      jsonText({ winners: makeValidWinners() }),
    ]);

    const result = await selectAndWriteWinners(INPUT, { client });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    expect(result.winners).toHaveLength(3);
    const secondParams = create.mock.calls[1]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(secondParams.messages[2]?.content).toMatch(/Zod/);
  });
});

describe('selectAndWriteWinners — throws after 2 Zod failures', () => {
  it('throws when both attempts return invalid Zod', async () => {
    const twoWinners = makeValidWinners().slice(0, 2) as unknown as WeeklyWinners;
    const { client } = mockClient([
      jsonText({ winners: twoWinners }),
      jsonText({ winners: twoWinners }),
    ]);

    await expect(selectAndWriteWinners(INPUT, { client })).rejects.toThrow(
      /select_winners_failed_after_2_attempts/,
    );
  });
});

describe('selectAndWriteWinners — parses meta all_scoring and fusions_proposees', () => {
  it('extracts all_scoring (8 entries) when present', async () => {
    const winners = makeValidWinners();
    const all_scoring = ARCHETYPES.map((_, i) => ({
      angle_id: `W20-A${i + 1}`,
      score_total: 7 + i * 0.1,
      sous_scores: {
        engagement_potentiel: 7,
        credibilite: 7,
        autorite_synvex: 6,
        transferabilite: 7,
        risque: 8,
      },
      commentaire: `Comment for angle ${i + 1}`,
    }));
    const fusions_proposees = [
      {
        fusion_id: 'F1',
        angle_ids: ['W20-A1', 'W20-A6'],
        rationale: 'Constat + analyse renforcent le même sujet.',
      },
    ];
    const { client } = mockClient([jsonText({ winners, all_scoring, fusions_proposees })]);

    const result = await selectAndWriteWinners(INPUT, { client });
    expect(result.all_scoring).toHaveLength(8);
    expect(result.fusions_proposees).toHaveLength(1);
    expect(result.fusions_proposees[0]!.fusion_id).toBe('F1');
    expect(result.fusions_proposees[0]!.angle_ids).toEqual(['W20-A1', 'W20-A6']);
  });
});

describe('postProcessWinners — flag complémentarité insuffisante (3 winners même archétype)', () => {
  it('flags critical when all 3 winners have same archetype (via underlying angle)', () => {
    const monoArcAngle = makeAngle({ archetype: 'constat_lucide', icp_vise: 'courtier' }, 0);
    const angles = makeAngles();
    // Toutes les 3 références pointent vers A1 (même archétype, même ICP).
    const winners: WeeklyWinners = [
      makeWinner(1, { winner_id: 'W20-A1' }, monoArcAngle),
      makeWinner(2, { winner_id: 'W20-A1' }, monoArcAngle),
      makeWinner(3, { winner_id: 'W20-A1' }, monoArcAngle),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);

    expect(result.validation_report.complementarite_ok).toBe(false);
    expect(result.validation_report.archetypes_distinct).toBe(1);
    expect(result.validation_report.icp_distinct).toBe(1);
    expect(result.validation_report.critical_flags.some((f) => f.includes('complémentarité'))).toBe(
      true,
    );
  });
});

describe('postProcessWinners — override anti_cliche_ok when banned lexique', () => {
  it('flips anti_cliche_ok to false when "synergie" is in post_final', () => {
    const angles = makeAngles();
    const polluted = makeWinner(
      1,
      {
        post_final:
          'Le ratio S/P se compresse silencieusement. La synergie entre courtage et compagnie ne suffit plus.',
      },
      makeAngle({ archetype: 'constat_lucide' }, 0),
    );
    const winners: WeeklyWinners = [
      polluted,
      makeWinner(
        2,
        { winner_id: 'W20-A3' },
        makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
      ),
      makeWinner(
        3,
        { winner_id: 'W20-A6' },
        makeAngle({ archetype: 'analyse_donnee', icp_vise: 'mutuelle' }, 5),
      ),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);

    expect(result.winners[0]!.checklist_qualite_passee.anti_cliche_ok).toBe(false);
    const ov = result.validation_report.overrides.find(
      (o) => o.post_position === 1 && o.field === 'anti_cliche_ok',
    );
    expect(ov).toBeDefined();
    expect(ov?.from).toBe(true);
    expect(ov?.to).toBe(false);
  });
});

describe('postProcessWinners — override absence_survente_ok when Synvex product mentioned', () => {
  it('flips absence_survente_ok to false when "Argus" appears', () => {
    const angles = makeAngles();
    const polluted = makeWinner(
      1,
      {
        post_final:
          "L'outil Argus permettrait de réduire les délais sinistres dans la gestion claims. Le ratio S/P en bénéficierait.",
      },
      makeAngle({ archetype: 'constat_lucide' }, 0),
    );
    const winners: WeeklyWinners = [
      polluted,
      makeWinner(
        2,
        { winner_id: 'W20-A3' },
        makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
      ),
      makeWinner(
        3,
        { winner_id: 'W20-A6' },
        makeAngle({ archetype: 'analyse_donnee', icp_vise: 'mutuelle' }, 5),
      ),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);

    expect(result.winners[0]!.checklist_qualite_passee.absence_survente_ok).toBe(false);
    const ov = result.validation_report.overrides.find(
      (o) => o.post_position === 1 && o.field === 'absence_survente_ok',
    );
    expect(ov).toBeDefined();
    expect(result.validation_report.critical_flags.some((f) => f.includes('produit Synvex'))).toBe(
      true,
    );
  });
});

describe('postProcessWinners — override vocabulaire_metier_ok when no metier term', () => {
  it('flips vocabulaire_metier_ok to false when post has 0 metier terms', () => {
    const angles = makeAngles();
    const generic = makeWinner(
      1,
      {
        post_final:
          'Le marché évolue rapidement. Les acteurs doivent rester vigilants. La compétition se renforce.',
      },
      makeAngle({ archetype: 'constat_lucide' }, 0),
    );
    const winners: WeeklyWinners = [
      generic,
      makeWinner(
        2,
        { winner_id: 'W20-A3' },
        makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
      ),
      makeWinner(
        3,
        { winner_id: 'W20-A6' },
        makeAngle({ archetype: 'analyse_donnee', icp_vise: 'mutuelle' }, 5),
      ),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);
    expect(result.winners[0]!.checklist_qualite_passee.vocabulaire_metier_ok).toBe(false);
    const ov = result.validation_report.overrides.find(
      (o) => o.post_position === 1 && o.field === 'vocabulaire_metier_ok',
    );
    expect(ov).toBeDefined();
  });
});

describe('postProcessWinners — critical flag when >1 Synvex mentions', () => {
  it('adds critical flag when "Synvex" appears 2+ times', () => {
    const angles = makeAngles();
    const polluted = makeWinner(
      1,
      {
        post_final:
          "Synvex observe une bascule sur le ratio S/P. Pour Synvex, le signal est clair sur l'IARD.",
      },
      makeAngle({ archetype: 'constat_lucide' }, 0),
    );
    const winners: WeeklyWinners = [
      polluted,
      makeWinner(
        2,
        { winner_id: 'W20-A3' },
        makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
      ),
      makeWinner(
        3,
        { winner_id: 'W20-A6' },
        makeAngle({ archetype: 'analyse_donnee', icp_vise: 'mutuelle' }, 5),
      ),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);
    expect(
      result.validation_report.critical_flags.some((f) => f.includes('Synvex mentionné')),
    ).toBe(true);
    expect(result.winners[0]!.checklist_qualite_passee.absence_survente_ok).toBe(false);
  });
});

describe('postProcessWinners — corrects longueur_finale to real value', () => {
  it('recomputes longueur_finale = post_final.length when claim mismatches', () => {
    const angles = makeAngles();
    const post = 'Le ratio S/P explose sur les portefeuilles IARD.';
    const w = makeWinner(
      1,
      { post_final: post, longueur_finale: 9999 },
      makeAngle({ archetype: 'constat_lucide' }, 0),
    );
    const winners: WeeklyWinners = [
      w,
      makeWinner(
        2,
        { winner_id: 'W20-A3' },
        makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
      ),
      makeWinner(
        3,
        { winner_id: 'W20-A6' },
        makeAngle({ archetype: 'analyse_donnee', icp_vise: 'mutuelle' }, 5),
      ),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);
    expect(result.winners[0]!.longueur_finale).toBe(post.length);
    const ov = result.validation_report.overrides.find(
      (o) => o.post_position === 1 && o.field === 'longueur_finale',
    );
    expect(ov).toBeDefined();
    expect(ov?.from).toBe(9999);
    expect(ov?.to).toBe(post.length);
  });
});

describe('postProcessWinners — fusion_used with 2 valid angle_ids', () => {
  it('accepts a fusion referencing 2 existing angle_ids', () => {
    const angles = makeAngles();
    const fusionWinner = makeWinner(
      1,
      {
        winner_id: 'F1',
        fusion_used: ['W20-A1', 'W20-A6'],
        scoring: [
          { angle_id: 'W20-A1', score_total: 8, sous_scores: {}, commentaire: 'c' },
          { angle_id: 'W20-A6', score_total: 7.6, sous_scores: {}, commentaire: 'c' },
        ],
      },
      angles.find((a) => a.angle_id === 'W20-A1'),
    );
    const winners: WeeklyWinners = [
      fusionWinner,
      makeWinner(
        2,
        { winner_id: 'W20-A3' },
        makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
      ),
      makeWinner(
        3,
        { winner_id: 'W20-A8' },
        makeAngle({ archetype: 'these_marche', icp_vise: 'mutuelle' }, 7),
      ),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);
    expect(
      result.validation_report.critical_flags.filter((f) => f.includes('fusion référence')),
    ).toHaveLength(0);
  });

  it('flags critical when fusion references unknown angle_id', () => {
    const angles = makeAngles();
    const fusionWinner = makeWinner(
      1,
      {
        winner_id: 'F1',
        fusion_used: ['W20-A1', 'W20-A999'],
        scoring: [],
      },
      angles[0],
    );
    const winners: WeeklyWinners = [
      fusionWinner,
      makeWinner(
        2,
        { winner_id: 'W20-A3' },
        makeAngle({ archetype: 'contrarian_assurance', icp_vise: 'MGA' }, 2),
      ),
      makeWinner(
        3,
        { winner_id: 'W20-A8' },
        makeAngle({ archetype: 'these_marche', icp_vise: 'mutuelle' }, 7),
      ),
    ] as WeeklyWinners;

    const result = postProcessWinners(winners, angles);
    expect(
      result.validation_report.critical_flags.some((f) =>
        f.includes('fusion référence angle inconnu'),
      ),
    ).toBe(true);
  });
});

describe('postProcessWinners — no overrides on clean valid post', () => {
  it('returns empty overrides when winners are clean', () => {
    const angles = makeAngles();
    const winners = makeValidWinners();
    const result = postProcessWinners(winners, angles);
    expect(result.validation_report.overrides).toHaveLength(0);
    expect(result.validation_report.critical_flags).toHaveLength(0);
    expect(result.validation_report.complementarite_ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// v2 mai 2026 — Tests produit Synvex (diversité ≥ 2 sur 3 winners + héritage)
// ---------------------------------------------------------------------------

describe('postProcessWinners — v2 produit Synvex diversité', () => {
  it('reports 3 distinct products when each winner has a different product', () => {
    const angles = makeAngles();
    const winners: WeeklyWinners = [
      makeWinner(1, { produit_synvex_ancrage: 'Hermès' }),
      makeWinner(2, { winner_id: 'W20-A3', produit_synvex_ancrage: 'Argus' }),
      makeWinner(3, { winner_id: 'W20-A5', produit_synvex_ancrage: 'Cortex' }),
    ] as WeeklyWinners;
    const result = postProcessWinners(winners, angles);
    expect(result.validation_report.produits_synvex_distinct).toBe(3);
    expect(result.validation_report.produit_synvex_diversity_ok).toBe(true);
    expect(result.validation_report.produits_synvex_used.sort()).toEqual(
      ['Argus', 'Cortex', 'Hermès'].sort(),
    );
  });

  it('flags critical when 3 winners share the same product', () => {
    const angles = makeAngles();
    const winners: WeeklyWinners = [
      makeWinner(1, { produit_synvex_ancrage: 'Argus' }),
      makeWinner(2, { winner_id: 'W20-A3', produit_synvex_ancrage: 'Argus' }),
      makeWinner(3, { winner_id: 'W20-A5', produit_synvex_ancrage: 'Argus' }),
    ] as WeeklyWinners;
    const result = postProcessWinners(winners, angles);
    expect(result.validation_report.produits_synvex_distinct).toBe(1);
    expect(result.validation_report.produit_synvex_diversity_ok).toBe(false);
    expect(
      result.validation_report.critical_flags.some((f) => f.includes('diversité produit')),
    ).toBe(true);
  });

  it('inherits produit_synvex_ancrage from source angle when winner has none', () => {
    const angles = makeAngles();
    // L'angle W20-A1 a un produit dans le fixture (cf. makeAngles), on l'override
    // pour s'assurer que le winner sans champ hérite bien.
    const anglesWithProduct = angles.map((a, i) =>
      i === 0 ? { ...a, produit_synvex_ancrage: 'Helios' as const } : a,
    ) as WeeklyAngles;
    const winners: WeeklyWinners = [
      makeWinner(1), // SANS produit_synvex_ancrage → doit hériter de W20-A1
      makeWinner(2, { winner_id: 'W20-A3', produit_synvex_ancrage: 'Argus' }),
      makeWinner(3, { winner_id: 'W20-A5', produit_synvex_ancrage: 'Cortex' }),
    ] as WeeklyWinners;
    const result = postProcessWinners(winners, anglesWithProduct);
    expect(result.winners[0]!.produit_synvex_ancrage).toBe('Helios');
    const ov = result.validation_report.overrides.find(
      (o) => o.post_position === 1 && o.field === 'produit_synvex_ancrage',
    );
    expect(ov).toBeDefined();
    expect(ov?.to).toBe('Helios');
  });

  it('handles fusion winners with produit inherited from first angle', () => {
    const angles = makeAngles();
    const anglesWithProducts = angles.map((a, i) => {
      if (i === 0) return { ...a, produit_synvex_ancrage: 'Helios' as const };
      if (i === 5) return { ...a, produit_synvex_ancrage: 'Vega' as const };
      return a;
    }) as WeeklyAngles;
    const fusion: WeeklyWinners = [
      makeWinner(1, {
        winner_id: 'F1',
        fusion_used: ['W20-A1', 'W20-A6'],
        // pas de produit_synvex_ancrage → doit hériter de W20-A1 (1er angle)
      }),
      makeWinner(2, { winner_id: 'W20-A3', produit_synvex_ancrage: 'Argus' }),
      makeWinner(3, { winner_id: 'W20-A8', produit_synvex_ancrage: 'Nexus' }),
    ] as WeeklyWinners;
    const result = postProcessWinners(fusion, anglesWithProducts);
    expect(result.winners[0]!.produit_synvex_ancrage).toBe('Helios');
    expect(result.validation_report.produits_synvex_distinct).toBe(3);
  });
});
