import type { CleanPost, PostAnalysis, RawPost } from '@nexus/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  type AnthropicLike,
  analyzePost,
  extractJsonFromPrefilledResponse,
} from '../editorial-analyst.js';
import { SYSTEM_PROMPT, SYSTEM_PROMPT_STATS } from '../system-prompt-builder.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RAW_POST: RawPost = {
  post_id: 'urn:li:activity:7459848590547607552',
  profile_id: 'carolineramade',
  published_at: '2026-05-12T06:15:01.271Z',
  day_of_week: 'Mar',
  hour_of_day: 8,
  text: "Le DRH d'Orange a fait un choix radical. À l'heure où beaucoup d'entreprises se demandent si l'IA va remplacer leurs collaborateurs, Vincent Lecerf, lui, a tranché : il forme les siens. Massivement. 50 000 collaborateurs vont être formés à l'IA générative d'ici fin 2026. Et la réflexion derrière est lucide : moins de cherche-formation, plus de pousse-formation. C'est un signal fort pour la place du DRH dans les comités exécutifs.",
  media_type: 'texte',
  likes: 237,
  comments: 19,
  reposts: 16,
  views_estimees: null,
  url: 'https://www.linkedin.com/feed/update/urn:li:activity:7459848590547607552/',
  comment_sample: null,
  source_actor: 'harvestapi/linkedin-profile-posts',
};

const CLEAN_POST: CleanPost = {
  post_id: RAW_POST.post_id,
  engagement_score_normalized: 45.63,
  is_relevant: true,
  topic_cluster_pre: 'autre',
  filter_reason: null,
};

const VALID_ANALYSIS: PostAnalysis = {
  post_id: RAW_POST.post_id,
  hook_type: 'stat_choc',
  hook_extract: "Le DRH d'Orange a fait un choix radical.",
  format: 'analyse',
  structure_narrative: 'Hook chiffre → mécanique de la décision → signal sectoriel',
  longueur_caracteres: 420,
  longueur_paragraphes: 3,
  ton: 'lucide',
  topic_cluster: 'rh_tech',
  topic_specific: 'DRH_formation_IA_Orange',
  cta_type: 'aucun',
  mecaniques_attention: [
    'chiffre concret 50k collaborateurs',
    'opposition cherche-formation / pousse-formation',
  ],
  transferabilite_assurance: 6,
  raison_performance_hypothese:
    "Annonce chiffrée d'un dirigeant nommé + ancrage actualité formation IA = preuve crédible pour audience C-suite.",
};

const baseUsage = {
  input_tokens: 1500,
  output_tokens: 420,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

/**
 * Mock un client Anthropic avec une liste de réponses textuelles successives.
 * Chaque entrée représente le `content[0].text` retourné (sans le `{` du prefill).
 */
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

// JSON content sans le `{` initial (rappel : prefill assistant `{`).
function jsonResponseText(analysis: PostAnalysis): string {
  const full = JSON.stringify(analysis, null, 2);
  return full.startsWith('{') ? full.slice(1) : full;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyzePost — happy path', () => {
  it('returns the validated analysis on first attempt and reports cost', async () => {
    const { client, create } = mockClient([jsonResponseText(VALID_ANALYSIS)]);

    const result = await analyzePost(CLEAN_POST, RAW_POST, { client });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.analysis.hook_type).toBe('stat_choc');
    expect(result.analysis.transferabilite_assurance).toBe(6);
    expect(result.analysis.post_id).toBe(CLEAN_POST.post_id);
    expect(result.usage.input_tokens).toBe(1500);
    expect(result.usage.output_tokens).toBe(420);
    // Cost calc : 1500/1e6 × 1.0 + 420/1e6 × 5.0 = 0.0015 + 0.0021 = 0.0036 USD
    expect(result.usage.cost_usd).toBeCloseTo(0.0036, 5);
    expect(result.usage.cost_eur).toBeCloseTo(0.0036 * 0.92, 5);
  });

  it('verifies messages contain prefill assistant turn with {', async () => {
    const { client, create } = mockClient([jsonResponseText(VALID_ANALYSIS)]);

    await analyzePost(CLEAN_POST, RAW_POST, { client });

    const params = create.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(params.messages).toHaveLength(2);
    expect(params.messages[0]?.role).toBe('user');
    expect(params.messages[1]?.role).toBe('assistant');
    expect(params.messages[1]?.content).toBe('{');
  });
});

describe('analyzePost — retry on validation failure', () => {
  it('retries once with corrective turn and succeeds on second attempt', async () => {
    // 1er essai : JSON valide structurellement mais transferabilite=15 (hors range Zod 0-10)
    const invalidAnalysis = { ...VALID_ANALYSIS, transferabilite_assurance: 15 };
    const { client, create } = mockClient([
      jsonResponseText(invalidAnalysis),
      jsonResponseText(VALID_ANALYSIS),
    ]);

    const result = await analyzePost(CLEAN_POST, RAW_POST, { client });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    expect(result.analysis.transferabilite_assurance).toBe(6);

    // Vérifie que le 2e appel contient le tour assistant + un tour user correctif.
    const secondCallParams = create.mock.calls[1]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(secondCallParams.messages.length).toBeGreaterThanOrEqual(4);
    expect(secondCallParams.messages[2]?.role).toBe('user');
    expect(secondCallParams.messages[2]?.content).toMatch(/validation\s+Zod/i);
    // Le dernier message est de nouveau un prefill assistant
    const last = secondCallParams.messages[secondCallParams.messages.length - 1]!;
    expect(last.role).toBe('assistant');
    expect(last.content).toBe('{');
  });
});

describe('analyzePost — throws after two validation failures', () => {
  it('throws with diagnostic message after 2 consecutive failures', async () => {
    const invalidAnalysis = { ...VALID_ANALYSIS, transferabilite_assurance: 15 };
    const { client, create } = mockClient([
      jsonResponseText(invalidAnalysis),
      jsonResponseText(invalidAnalysis),
    ]);

    await expect(analyzePost(CLEAN_POST, RAW_POST, { client })).rejects.toThrow(
      /analyze_post_failed_after_2_attempts/,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('analyzePost — JSON parse failure triggers retry', () => {
  it('handles non-JSON response by retrying with corrective prompt', async () => {
    const { client, create } = mockClient([
      'This is not JSON at all, just text from Claude.',
      jsonResponseText(VALID_ANALYSIS),
    ]);

    const result = await analyzePost(CLEAN_POST, RAW_POST, { client });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    expect(result.analysis.hook_type).toBe('stat_choc');
  });
});

describe('analyzePost — system prompt embeds context brief and voice tone', () => {
  it('includes context brief, voice tone, and analysis instructions', () => {
    expect(SYSTEM_PROMPT).toContain('Editorial Analyst');
    expect(SYSTEM_PROMPT).toContain('Synvex');
    expect(SYSTEM_PROMPT).toMatch(/écosystème assurance fran(ç|c)ais.*absent de LinkedIn/i);
    expect(SYSTEM_PROMPT).toMatch(/Vouvoiement/i);
    expect(SYSTEM_PROMPT).toMatch(/Lexique banni/i);
    expect(SYSTEM_PROMPT).toContain('transferabilite_assurance');
    expect(SYSTEM_PROMPT_STATS.approx_tokens).toBeGreaterThan(500);
  });
});

describe('analyzePost — post_id mismatch correction', () => {
  it("overrides Claude's returned post_id with the canonical clean_post id", async () => {
    const wrongIdAnalysis = { ...VALID_ANALYSIS, post_id: 'urn:li:activity:WRONG_ID' };
    const { client } = mockClient([jsonResponseText(wrongIdAnalysis)]);

    const result = await analyzePost(CLEAN_POST, RAW_POST, { client });
    expect(result.analysis.post_id).toBe(CLEAN_POST.post_id);
  });
});

describe('extractJsonFromPrefilledResponse — robustness', () => {
  it('reconstructs JSON when prefill `{` was used', () => {
    const inner = '"hook_type": "stat_choc", "format": "analyse"}';
    const parsed = extractJsonFromPrefilledResponse(inner) as Record<string, string>;
    expect(parsed.hook_type).toBe('stat_choc');
    expect(parsed.format).toBe('analyse');
  });

  it('strips markdown code fences if Claude wraps the JSON', () => {
    const inner = '```json\n"hook_type": "annonce"}\n```';
    const parsed = extractJsonFromPrefilledResponse(inner) as Record<string, string>;
    expect(parsed.hook_type).toBe('annonce');
  });

  it('throws on responses with no JSON object', () => {
    expect(() => extractJsonFromPrefilledResponse('not json at all')).toThrow(
      /no_json_object_found/,
    );
  });
});
