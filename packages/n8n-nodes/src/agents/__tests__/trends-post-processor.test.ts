import type { LinkedinTrends, PostAnalysis } from '@nexus/shared';
import { describe, expect, it } from 'vitest';
import type { PostAnalysisEnriched, TrendsInput } from '../linkedin-trends-synthesizer.js';
import { postProcessTrends } from '../trends-post-processor.js';

// ---------------------------------------------------------------------------
// Fixtures helpers
// ---------------------------------------------------------------------------

function makeAnalysis(i: number, overrides: Partial<PostAnalysis> = {}): PostAnalysis {
  return {
    post_id: `urn:li:activity:${String(i).padStart(19, '0')}`,
    hook_type: 'observation_metier',
    hook_extract: `extract ${i}`,
    format: 'mini_essai',
    structure_narrative: 'constat → mécanique',
    longueur_caracteres: 1000,
    longueur_paragraphes: 4,
    ton: 'analytique',
    topic_cluster: 'tech',
    topic_specific: `topic_${i}`,
    cta_type: 'aucun',
    mecaniques_attention: ['chiffre concret'],
    transferabilite_assurance: 5,
    raison_performance_hypothese: `hypothèse ${i}`,
    ...overrides,
  };
}

function makeEnriched(i: number, overrides: Partial<PostAnalysis> = {}): PostAnalysisEnriched {
  return {
    analysis: makeAnalysis(i, overrides),
    engagement_score_normalized: 1.0,
    text_excerpt: `excerpt ${i}`,
    media_type: 'texte',
    likes: 50,
    comments: 5,
    reposts: 1,
  };
}

function buildInput(posts: PostAnalysisEnriched[], weekId = '2026-W20'): TrendsInput {
  return { week_id: weekId, post_analyses: posts, temporal_rows: [] };
}

const BASE_TRENDS: LinkedinTrends = {
  top_hooks: [],
  top_formats: [],
  top_topic_clusters: [],
  rising_topics: [],
  falling_topics: [],
  tone_dominant: 'analytique',
  longueur_optimale_p50_p90: [1000, 2000],
  mecaniques_emergentes: [],
  best_days_observed: [],
  best_hours_observed: [],
  format_performance: [],
  ten_best_posts: [],
  synthese_textuelle: 'Synthèse de base.',
};

// Inputs à diversité haute (≥ 3 sur chaque axe) pour les tests strip
const HIGH_DIVERSITY_INPUTS: PostAnalysisEnriched[] = [
  makeEnriched(1, { hook_type: 'confession', format: 'mini_essai', ton: 'lucide' }),
  makeEnriched(2, { hook_type: 'stat_choc', format: 'storytelling', ton: 'analytique' }),
  makeEnriched(3, { hook_type: 'contrarian', format: 'analyse', ton: 'sec' }),
  makeEnriched(4, {
    hook_type: 'observation_metier',
    format: 'retour_experience',
    ton: 'pédagogue',
  }),
  makeEnriched(5, { hook_type: 'confession', format: 'listicle', ton: 'inspirant' }),
];

// Inputs à diversité limitée (< 3 sur au moins un axe)
const LOW_DIVERSITY_INPUTS: PostAnalysisEnriched[] = [
  makeEnriched(1, { hook_type: 'confession', format: 'mini_essai', ton: 'analytique' }),
  makeEnriched(2, { hook_type: 'stat_choc', format: 'mini_essai', ton: 'analytique' }),
  makeEnriched(3, { hook_type: 'observation_metier', format: 'mini_essai', ton: 'analytique' }),
  // hook_type: 3 distincts (OK), format: 1 (KO), ton: 1 (KO) → !all_ok
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('postProcessTrends — A. tri strict par avg_engagement_norm décroissant', () => {
  it('re-trie top_hooks par engagement décroissant (ignore fréquence)', () => {
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      top_hooks: [
        // ordre fourni : par fréquence décroissante (3, 3, 1) — bug Claude observé
        { type: 'A', frequency: 3, avg_engagement_norm: 16.27, example_post_id: 'p1' },
        { type: 'B', frequency: 3, avg_engagement_norm: 1.3, example_post_id: 'p2' },
        { type: 'C', frequency: 1, avg_engagement_norm: 3.99, example_post_id: 'p3' },
      ],
    };
    const { trends: out, stats } = postProcessTrends(trends, buildInput(HIGH_DIVERSITY_INPUTS));
    expect(out.top_hooks.map((h) => h.type)).toEqual(['A', 'C', 'B']);
    expect(out.top_hooks[0]?.avg_engagement_norm).toBe(16.27);
    expect(out.top_hooks[1]?.avg_engagement_norm).toBe(3.99);
    expect(out.top_hooks[2]?.avg_engagement_norm).toBe(1.3);
    expect(stats.reordered_top_hooks).toBe(true);
  });

  it('re-trie top_formats par engagement décroissant', () => {
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      top_formats: [
        { format: 'mini_essai', frequency: 5, avg_engagement_norm: 2.0 },
        { format: 'storytelling', frequency: 2, avg_engagement_norm: 23.7 },
        { format: 'listicle', frequency: 1, avg_engagement_norm: 1.4 },
      ],
    };
    const { trends: out } = postProcessTrends(trends, buildInput(HIGH_DIVERSITY_INPUTS));
    expect(out.top_formats.map((f) => f.format)).toEqual([
      'storytelling',
      'mini_essai',
      'listicle',
    ]);
  });

  it('re-trie top_topic_clusters par engagement décroissant', () => {
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      top_topic_clusters: [
        { cluster: 'topic_b', frequency: 5, avg_engagement_norm: 3.0 },
        { cluster: 'topic_a', frequency: 1, avg_engagement_norm: 45.6 },
        { cluster: 'topic_c', frequency: 2, avg_engagement_norm: 2.2 },
      ],
    };
    const { trends: out } = postProcessTrends(trends, buildInput(HIGH_DIVERSITY_INPUTS));
    expect(out.top_topic_clusters.map((c) => c.cluster)).toEqual(['topic_a', 'topic_b', 'topic_c']);
  });
});

describe('postProcessTrends — C. strip data quality si diversités OK', () => {
  it('retire les phrases contenant "data quality" / "diversité éditoriale" / "valeurs distinctes"', () => {
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      synthese_textuelle:
        'La semaine confirme la dominance du storytelling. Data quality warning : diversité éditoriale limitée cette semaine (hook_type: 4, format: 6, ton: 4 valeurs distinctes). Mardi 08h-10h reste le créneau optimal. Trois mécaniques récurrentes structurent les meilleurs posts.',
    };
    // HIGH_DIVERSITY_INPUTS : hook=4, format=5, ton=5 → all_ok=true
    const { trends: out, stats } = postProcessTrends(trends, buildInput(HIGH_DIVERSITY_INPUTS));
    expect(stats.all_ok).toBe(true);
    expect(out.synthese_textuelle).not.toMatch(/data quality/i);
    expect(out.synthese_textuelle).not.toMatch(/diversité éditoriale/i);
    expect(out.synthese_textuelle).not.toMatch(/valeurs distinctes/i);
    // Les autres phrases sont conservées
    expect(out.synthese_textuelle).toMatch(/dominance du storytelling/i);
    expect(out.synthese_textuelle).toMatch(/Mardi 08h-10h/);
    expect(out.synthese_textuelle).toMatch(/mécaniques récurrentes/);
    expect(stats.data_quality_sentences_stripped).toBeGreaterThanOrEqual(1);
  });
});

describe('postProcessTrends — D. insertion phrase standardisée si diversités limitées', () => {
  it("insère la note 'Diversité éditoriale limitée…' en début si elle n'est pas déjà présente", () => {
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      synthese_textuelle:
        "La semaine montre un signal éditorial concentré sur le ton analytique. Mini-essai est l'unique format observé. Transferabilité assurance globale faible.",
    };
    // LOW_DIVERSITY_INPUTS : hook=3, format=1, ton=1 → !all_ok (format et ton < 3)
    const { trends: out, stats } = postProcessTrends(trends, buildInput(LOW_DIVERSITY_INPUTS));
    expect(stats.all_ok).toBe(false);
    expect(stats.diversity_note_inserted).toBe(true);
    expect(out.synthese_textuelle).toMatch(
      /^Diversité éditoriale limitée cette semaine \(hook_type: 3, format: 1, ton: 1 valeurs distinctes\)\./,
    );
    // La synthèse originale est conservée à la suite
    expect(out.synthese_textuelle).toMatch(/signal éditorial concentré/);
  });

  it('ne duplique pas la note si déjà présente dans la synthèse', () => {
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      synthese_textuelle:
        'Diversité éditoriale limitée cette semaine (hook_type: 3, format: 1, ton: 1 valeurs distinctes). La semaine montre un signal éditorial concentré sur le ton analytique.',
    };
    const { trends: out, stats } = postProcessTrends(trends, buildInput(LOW_DIVERSITY_INPUTS));
    expect(stats.all_ok).toBe(false);
    expect(stats.diversity_note_inserted).toBe(false);
    // Une seule occurrence de la phrase
    const matches = out.synthese_textuelle.match(/Diversité éditoriale limitée/gi) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('postProcessTrends — idempotence', () => {
  it('appel 2x produit le même résultat (idempotent)', () => {
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      top_hooks: [
        { type: 'A', frequency: 3, avg_engagement_norm: 5, example_post_id: 'p1' },
        { type: 'B', frequency: 1, avg_engagement_norm: 10, example_post_id: 'p2' },
      ],
      synthese_textuelle:
        'La semaine confirme la dominance du storytelling. Data quality warning : valeurs distinctes faibles. Mardi 08h-10h reste optimal.',
    };
    const inputs = buildInput(HIGH_DIVERSITY_INPUTS);
    const pass1 = postProcessTrends(trends, inputs);
    const pass2 = postProcessTrends(pass1.trends, inputs);
    expect(pass2.trends.top_hooks).toEqual(pass1.trends.top_hooks);
    expect(pass2.trends.synthese_textuelle).toEqual(pass1.trends.synthese_textuelle);
    // Au 2e passage, plus rien à strip ni réordonner
    expect(pass2.stats.data_quality_sentences_stripped).toBe(0);
    expect(pass2.stats.reordered_top_hooks).toBe(false);
  });
});

describe('postProcessTrends — diversity computation depuis inputs', () => {
  it('compte les valeurs distinctes depuis post_analyses, pas depuis la sortie Claude', () => {
    // Synthèse Claude mentionne 99 valeurs distinctes — devrait être ignoré
    const trends: LinkedinTrends = {
      ...BASE_TRENDS,
      synthese_textuelle: 'La semaine a 99 valeurs distinctes selon Claude — fausse mesure.',
    };
    const { stats } = postProcessTrends(trends, buildInput(HIGH_DIVERSITY_INPUTS));
    // HIGH_DIVERSITY_INPUTS : hook_type distincts = {confession, stat_choc, contrarian, observation_metier} = 4
    expect(stats.hook_diversity).toBe(4);
    expect(stats.format_diversity).toBe(5);
    expect(stats.ton_diversity).toBe(5);
    expect(stats.all_ok).toBe(true);
  });
});
