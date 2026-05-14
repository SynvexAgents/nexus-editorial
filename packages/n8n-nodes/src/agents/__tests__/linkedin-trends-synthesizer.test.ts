import type { LinkedinTrends, PostAnalysis, TemporalRow } from '@nexus/shared';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_4_SYSTEM_PROMPT, AGENT_4_SYSTEM_PROMPT_STATS } from '../agent-4-system-prompt.js';
import {
  type AnthropicLike,
  InsufficientVolumeError,
  type PostAnalysisEnriched,
  type TrendsInput,
  synthesizeTrends,
} from '../linkedin-trends-synthesizer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HOOK_TYPES = [
  'stat_choc',
  'confession',
  'contrarian',
  'observation_metier',
  'annonce',
  'question_provoc',
] as const;
const FORMATS = [
  'mini_essai',
  'storytelling',
  'retour_experience',
  'analyse',
  'punchline',
  'data_post',
] as const;
const TONS = ['lucide', 'analytique', 'confessionnel', 'provocateur', 'pédagogue'] as const;

function makeAnalysis(i: number): PostAnalysis {
  return {
    post_id: `urn:li:activity:75999${String(i).padStart(11, '0')}`,
    hook_type: HOOK_TYPES[i % HOOK_TYPES.length]!,
    hook_extract: `Hook extract du post ${i} — premières phrases significatives.`,
    format: FORMATS[i % FORMATS.length]!,
    structure_narrative: 'Constat → mécanique → ouverture',
    longueur_caracteres: 800 + i * 100,
    longueur_paragraphes: 4 + (i % 3),
    ton: TONS[i % TONS.length]!,
    topic_cluster: `cluster_${i % 4}`,
    topic_specific: `specific_topic_${i % 5}`,
    cta_type: 'aucun',
    mecaniques_attention: [`mécanique spécifique ${i}`, 'chiffre concret en hook'],
    transferabilite_assurance: (i % 8) + 1,
    raison_performance_hypothese: `Mécanique de performance hypothèse ${i}, sec et factuel.`,
  };
}

function makeEnriched(i: number): PostAnalysisEnriched {
  return {
    analysis: makeAnalysis(i),
    engagement_score_normalized: 1.0 + (i % 5) * 0.5,
    text_excerpt: `Texte court du post ${i}, échantillon de 200 chars max...`,
    media_type: 'texte',
    likes: 50 + i * 10,
    comments: 5 + i,
    reposts: i % 4,
  };
}

// Rappel : TemporalRow.top_format = MediaType (texte/image/carrousel/video/document),
// PAS le post_format (mini_essai/analyse/…). C'est une agrégation au niveau
// media_type pour les analyses jour × heure.
const TEMPORAL_ROWS: TemporalRow[] = [
  {
    week_id: '2026-W20',
    day_of_week: 'Mar',
    hour_bucket: '08h-10h',
    posts_count: 4,
    avg_engagement_norm: 1.5,
    top_format: 'texte',
    format_distribution: { texte: 0.75, carrousel: 0.25 },
  },
  {
    week_id: '2026-W20',
    day_of_week: 'Lun',
    hour_bucket: '12h-14h',
    posts_count: 3,
    avg_engagement_norm: 1.2,
    top_format: 'texte',
    format_distribution: { texte: 1.0 },
  },
];

const VALID_TRENDS: LinkedinTrends = {
  top_hooks: [
    {
      type: 'confession',
      frequency: 5,
      avg_engagement_norm: 2.1,
      example_post_id: 'urn:li:activity:7599900000000000003',
    },
    {
      type: 'stat_choc',
      frequency: 4,
      avg_engagement_norm: 1.9,
      example_post_id: 'urn:li:activity:7599900000000000001',
    },
    {
      type: 'observation_metier',
      frequency: 3,
      avg_engagement_norm: 1.4,
      example_post_id: 'urn:li:activity:7599900000000000004',
    },
  ],
  top_formats: [
    { format: 'mini_essai', frequency: 8, avg_engagement_norm: 2.0 },
    { format: 'storytelling', frequency: 4, avg_engagement_norm: 1.7 },
    { format: 'analyse', frequency: 3, avg_engagement_norm: 1.3 },
  ],
  top_topic_clusters: [
    { cluster: 'specific_topic_0', frequency: 3, avg_engagement_norm: 1.8 },
    { cluster: 'specific_topic_2', frequency: 3, avg_engagement_norm: 1.5 },
  ],
  rising_topics: ['IA et formation interne'],
  falling_topics: [],
  tone_dominant: 'analytique',
  longueur_optimale_p50_p90: [1200, 2000],
  mecaniques_emergentes: ['chiffre concret en hook', 'ancrage actualité ACPR'],
  best_days_observed: [
    { day: 'Mar', avg_engagement_norm: 1.5 },
    { day: 'Lun', avg_engagement_norm: 1.2 },
  ],
  best_hours_observed: [
    { hour_bucket: '08h-10h', avg_engagement_norm: 1.5 },
    { hour_bucket: '12h-14h', avg_engagement_norm: 1.2 },
  ],
  format_performance: [
    { format: 'mini_essai', avg_engagement_norm: 2.0 },
    { format: 'storytelling', avg_engagement_norm: 1.7 },
  ],
  ten_best_posts: Array.from({ length: 10 }, (_, i) => ({
    post_id: `urn:li:activity:7599900000000000${String(i).padStart(3, '0')}`,
    score: 2.5 - i * 0.1,
    summary: `Synthèse instructive du post ${i} pour Synvex.`,
  })),
  synthese_textuelle:
    'La semaine est dominée par les analyses lucides ancrées dans des chiffres concrets. Le hook confession performe au-delà de la moyenne. Transferabilite assurance globale moyenne (médiane 4/10), avec quelques signaux exploitables sur la transposition data et IA appliquée.',
};

const baseUsage = {
  input_tokens: 8000,
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

function jsonResponseText(trends: LinkedinTrends): string {
  const full = JSON.stringify(trends, null, 2);
  return full.startsWith('{') ? full.slice(1) : full;
}

function buildInput(postCount: number, weekId = '2026-W20'): TrendsInput {
  return {
    week_id: weekId,
    post_analyses: Array.from({ length: postCount }, (_, i) => makeEnriched(i)),
    temporal_rows: TEMPORAL_ROWS,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('synthesizeTrends — happy path', () => {
  it('returns validated LinkedinTrends on first attempt with cost', async () => {
    const { client, create } = mockClient([jsonResponseText(VALID_TRENDS)]);
    const result = await synthesizeTrends(buildInput(15), { client });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.trends.top_hooks).toHaveLength(3);
    expect(result.trends.ten_best_posts).toHaveLength(10);
    expect(result.trends.longueur_optimale_p50_p90).toEqual([1200, 2000]);
    expect(result.usage.input_tokens).toBe(8000);
    expect(result.usage.output_tokens).toBe(2000);
    // 8000/1e6 × 1.0 + 2000/1e6 × 5.0 = 0.008 + 0.010 = 0.018 USD
    expect(result.usage.cost_usd).toBeCloseTo(0.018, 4);
  });
});

describe('synthesizeTrends — InsufficientVolume guard', () => {
  it('throws InsufficientVolumeError when fewer than 10 post_analyses', async () => {
    const { client, create } = mockClient([jsonResponseText(VALID_TRENDS)]);
    await expect(synthesizeTrends(buildInput(5), { client })).rejects.toBeInstanceOf(
      InsufficientVolumeError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('respects custom minPosts option', async () => {
    const { client } = mockClient([jsonResponseText(VALID_TRENDS)]);
    // 5 posts mais minPosts = 3 → doit passer
    const result = await synthesizeTrends(buildInput(5), { client, minPosts: 3 });
    expect(result.trends.top_hooks.length).toBeGreaterThan(0);
  });
});

describe('synthesizeTrends — retry on Zod failure', () => {
  it('retries once with corrective turn and succeeds on second attempt', async () => {
    // 1er essai : top_hooks vide ET tone_dominant vide (viole .min(1))
    const broken = {
      ...VALID_TRENDS,
      tone_dominant: '',
    };
    const { client, create } = mockClient([
      jsonResponseText(broken as LinkedinTrends),
      jsonResponseText(VALID_TRENDS),
    ]);

    const result = await synthesizeTrends(buildInput(15), { client });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    expect(result.trends.tone_dominant).toBe('analytique');

    const secondCallParams = create.mock.calls[1]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(secondCallParams.messages.length).toBeGreaterThanOrEqual(4);
    const lastUser = secondCallParams.messages[secondCallParams.messages.length - 2]!;
    expect(lastUser.role).toBe('user');
    expect(lastUser.content).toMatch(/validation\s+Zod/i);
  });
});

describe('synthesizeTrends — throws after two Zod failures', () => {
  it('throws diagnostic error after 2 consecutive failures', async () => {
    const broken = { ...VALID_TRENDS, tone_dominant: '' };
    const { client, create } = mockClient([
      jsonResponseText(broken as LinkedinTrends),
      jsonResponseText(broken as LinkedinTrends),
    ]);

    await expect(synthesizeTrends(buildInput(15), { client })).rejects.toThrow(
      /synthesize_trends_failed_after_2_attempts/,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('synthesizeTrends — system prompt embeds context brief and voice tone', () => {
  it('includes mission, context brief markers, voice tone markers, and constraints', () => {
    expect(AGENT_4_SYSTEM_PROMPT).toContain('Editorial Trends Synthesizer');
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/écosystème assurance fran(ç|c)ais.*absent de LinkedIn/i);
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/Vouvoiement/i);
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/Lexique banni/i);
    expect(AGENT_4_SYSTEM_PROMPT).toContain('LinkedinTrends');
    // Le tri strict et le conditionnel data quality sont désormais gérés
    // en post-processing déterministe (cf. trends-post-processor.ts). Le
    // system prompt n'ajoute plus que la consigne "pas de méta-mesure".
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/AUCUNE note de méta-mesure/i);
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/post-processing/i);
    expect(AGENT_4_SYSTEM_PROMPT_STATS.approx_tokens).toBeGreaterThan(800);
  });
});

// ===========================================================================
// Tests des 3 fixes (sort strict, data quality conditional, baseline mention)
// ===========================================================================

describe('synthesizeTrends — fix 1 : tri strict par avg_engagement_norm (ignore fréquence)', () => {
  it("preserves Claude's strict avg_engagement_norm ordering even when low-freq item ranks first", async () => {
    // Mock simule la sortie Claude APRÈS application du fix : hook_A
    // (engagement 20, freq 1) doit venir AVANT hook_B (engagement 15, freq 5).
    const trends: LinkedinTrends = {
      ...VALID_TRENDS,
      top_hooks: [
        { type: 'hook_A', frequency: 1, avg_engagement_norm: 20.0, example_post_id: 'p_A' },
        { type: 'hook_B', frequency: 5, avg_engagement_norm: 15.0, example_post_id: 'p_B' },
        { type: 'hook_C', frequency: 3, avg_engagement_norm: 5.0, example_post_id: 'p_C' },
      ],
    };
    const { client } = mockClient([jsonResponseText(trends)]);
    const result = await synthesizeTrends(buildInput(15), { client });

    expect(result.trends.top_hooks[0]?.avg_engagement_norm).toBe(20.0);
    expect(result.trends.top_hooks[1]?.avg_engagement_norm).toBe(15.0);
    expect(result.trends.top_hooks[2]?.avg_engagement_norm).toBe(5.0);
  });

  it('system prompt delegates ordering to post-processing (wording explicit)', () => {
    // Le tri strict n'est plus une responsabilité du LLM — sorti vers
    // trends-post-processor.ts. Le prompt doit refléter cette délégation
    // pour ne pas demander à Claude un effort inutile (qui échouait).
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/post-processing/i);
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/ordre indifférent/i);
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(
      /L'ordre dans la liste n'a pas d'importance, il sera trié en post-processing/i,
    );
  });
});

describe('synthesizeTrends — fix 2 : data quality warning conditionnel strict', () => {
  it('synthese contains no warning when Claude obeys the conditional rule (all diversities ≥ 3)', async () => {
    const trendsCleanSynth: LinkedinTrends = {
      ...VALID_TRENDS,
      synthese_textuelle:
        'La semaine W20 confirme la dominance de la confession ancrée en chiffres concrets. Mardi 08h-10h reste le créneau le plus dense. Trois mécaniques récurrentes : contraste explicite, chiffre en ancrage, démontage de croyance établie. Transferabilité assurance globalement faible — la matière dominante reste hors registre direct.',
    };
    const { client } = mockClient([jsonResponseText(trendsCleanSynth)]);
    const highDiversityPosts: PostAnalysisEnriched[] = Array.from({ length: 15 }, (_, i) =>
      makeEnriched(i),
    );
    const result = await synthesizeTrends(
      { week_id: '2026-W20', post_analyses: highDiversityPosts, temporal_rows: TEMPORAL_ROWS },
      { client },
    );
    expect(result.trends.synthese_textuelle).not.toMatch(/data quality warning/i);
    expect(result.trends.synthese_textuelle).not.toMatch(/diversité éditoriale limitée/i);
  });

  it('system prompt forbids all meta-measure mentions (delegated to post-processing)', () => {
    // Le conditionnel data quality n'est plus géré par le LLM. Le prompt
    // demande désormais à Claude de NE JAMAIS écrire de méta-mesure ;
    // le post-processor décide d'ajouter une note standardisée si nécessaire.
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/AUCUNE note de méta-mesure/i);
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/post-processing déterministe/i);
  });
});

describe('synthesizeTrends — fix 3 : mention "baseline" obligatoire quand rising/falling vides', () => {
  it('synthese contains "baseline" when rising_topics and falling_topics are both empty', async () => {
    const trendsWithBaselineNote: LinkedinTrends = {
      ...VALID_TRENDS,
      rising_topics: [],
      falling_topics: [],
      synthese_textuelle:
        'Baseline trop courte pour identifier des sujets en hausse ou en baisse cette semaine. Sur le contenu observé, la confession ancrée en chiffres domine, Mardi 08h-10h reste le créneau optimal. Transferabilité assurance limitée à un seul angle (formation IA RH transposable au courtage).',
    };
    const { client } = mockClient([jsonResponseText(trendsWithBaselineNote)]);
    const result = await synthesizeTrends(buildInput(15), { client });

    expect(result.trends.rising_topics).toHaveLength(0);
    expect(result.trends.falling_topics).toHaveLength(0);
    expect(result.trends.synthese_textuelle).toMatch(/baseline/i);
  });

  it('system prompt enforces NON OPTIONNELLE baseline mention rule', () => {
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/baseline\s+trop\s+courte/i);
    expect(AGENT_4_SYSTEM_PROMPT).toMatch(/NON OPTIONNELLE quand l'array est vide/i);
  });
});

describe('synthesizeTrends — low diversity triggers data quality warning instruction', () => {
  it('passes inputs with low hook diversity (2 distinct) without erroring; Claude should detect via system prompt rule', async () => {
    // On construit un input avec seulement 2 hook_type distincts (post 0, 2, 4 → 'stat_choc'/'contrarian').
    const lowDiversityPosts: PostAnalysisEnriched[] = Array.from({ length: 12 }, (_, i) => {
      const base = makeEnriched(i);
      return {
        ...base,
        analysis: {
          ...base.analysis,
          hook_type: i % 2 === 0 ? 'stat_choc' : 'confession',
          format: 'mini_essai',
          ton: 'analytique',
        },
      };
    });
    const trendsWithWarning: LinkedinTrends = {
      ...VALID_TRENDS,
      synthese_textuelle:
        'Data quality warning : diversité éditoriale limitée cette semaine (hook_type: 2, format: 1, ton: 1 valeurs distinctes). La semaine confirme une concentration sur les hooks confession/stat_choc, format mini_essai dominant, ton analytique stable.',
    };
    const { client } = mockClient([jsonResponseText(trendsWithWarning)]);

    const result = await synthesizeTrends(
      { week_id: '2026-W20', post_analyses: lowDiversityPosts, temporal_rows: TEMPORAL_ROWS },
      { client },
    );

    expect(result.trends.synthese_textuelle).toMatch(/Data quality warning/i);
    expect(result.trends.synthese_textuelle).toMatch(/diversité éditoriale limitée/i);
  });
});

describe('synthesizeTrends — prefill assistant turn `{`', () => {
  it('first call messages contain user prompt + assistant prefill', async () => {
    const { client, create } = mockClient([jsonResponseText(VALID_TRENDS)]);
    await synthesizeTrends(buildInput(15), { client });
    const params = create.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(params.messages).toHaveLength(2);
    expect(params.messages[0]?.role).toBe('user');
    expect(params.messages[1]?.role).toBe('assistant');
    expect(params.messages[1]?.content).toBe('{');
  });
});
