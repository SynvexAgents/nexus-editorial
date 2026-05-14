/**
 * linkedin-trends-synthesizer — Agent 4 Nexus Editorial.
 *
 * Synthétise une semaine de PostAnalyses + TemporalRows en un LinkedinTrends
 * validé Zod. Même architecture que editorial-analyst :
 *   - Pattern prefill assistant `{` (Zod 3 → zodOutputFormat indisponible).
 *   - 1 retry sur échec Zod avec corrective user turn.
 *   - Client Anthropic injectable pour les tests Vitest.
 *
 * Volume guard : on throw `InsufficientVolumeError` si < 10 post_analyses
 * (configurable via options). L'orchestrateur logue un warning et skip.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { LinkedinTrends, PostAnalysis, TemporalRow } from '@nexus/shared';
import { linkedinTrendsSchema } from '@nexus/shared';
import { AGENT_4_SYSTEM_PROMPT } from './agent-4-system-prompt.js';
import { extractJsonFromPrefilledResponse } from './editorial-analyst.js';

// Pricing Haiku 4.5 — identique à Agent 3.
const PRICE_INPUT_USD_PER_M = 1.0;
const PRICE_OUTPUT_USD_PER_M = 5.0;
const PRICE_CACHE_WRITE_USD_PER_M = 1.25;
const PRICE_CACHE_READ_USD_PER_M = 0.1;
const USD_TO_EUR = 0.92;

const MODEL_ID = 'claude-haiku-4-5';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.4;

const DEFAULT_MIN_POSTS = 10;

export class InsufficientVolumeError extends Error {
  public readonly received: number;
  public readonly required: number;
  constructor(received: number, required: number) {
    super(`InsufficientVolume: ${received} post_analyses, ${required} required`);
    this.name = 'InsufficientVolumeError';
    this.received = received;
    this.required = required;
  }
}

export interface PostAnalysisEnriched {
  analysis: PostAnalysis;
  engagement_score_normalized: number;
  text_excerpt: string;
  media_type: string;
  likes: number;
  comments: number;
  reposts: number;
}

export interface TrendsInput {
  week_id: string;
  post_analyses: PostAnalysisEnriched[];
  temporal_rows: TemporalRow[];
}

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
  cost_eur: number;
}

export interface TrendsResult {
  trends: LinkedinTrends;
  usage: UsageSummary;
  retried: boolean;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}
interface AnthropicCreateResponse {
  content: Array<AnthropicTextBlock | { type: string; [k: string]: unknown }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stop_reason: string;
}

export interface AnthropicLike {
  messages: {
    create: (params: Record<string, unknown>) => Promise<AnthropicCreateResponse>;
  };
}

function computeCost(usage: AnthropicCreateResponse['usage']): UsageSummary {
  const cache_creation = usage.cache_creation_input_tokens ?? 0;
  const cache_read = usage.cache_read_input_tokens ?? 0;
  const cost_usd =
    (usage.input_tokens / 1_000_000) * PRICE_INPUT_USD_PER_M +
    (usage.output_tokens / 1_000_000) * PRICE_OUTPUT_USD_PER_M +
    (cache_creation / 1_000_000) * PRICE_CACHE_WRITE_USD_PER_M +
    (cache_read / 1_000_000) * PRICE_CACHE_READ_USD_PER_M;
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: cache_creation,
    cache_read_input_tokens: cache_read,
    cost_usd,
    cost_eur: cost_usd * USD_TO_EUR,
  };
}

function buildUserPrompt(input: TrendsInput): string {
  return `Voici les données de la semaine ${input.week_id}.

Synthétise les tendances éditoriales selon le schéma LinkedinTrends détaillé dans le system prompt.

Réponds par UN SEUL objet JSON commençant par { et finissant par }. Aucun texte hors JSON, aucune balise markdown.

=== INPUT JSON ===
${JSON.stringify(input, null, 2)}
`;
}

export interface SynthesizeTrendsOptions {
  client?: AnthropicLike;
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
  /** Volume minimum de post_analyses requis (default 10). */
  minPosts?: number;
}

export async function synthesizeTrends(
  input: TrendsInput,
  options: SynthesizeTrendsOptions = {},
): Promise<TrendsResult> {
  const minPosts = options.minPosts ?? DEFAULT_MIN_POSTS;
  if (input.post_analyses.length < minPosts) {
    throw new InsufficientVolumeError(input.post_analyses.length, minPosts);
  }

  const client: AnthropicLike = options.client ?? (new Anthropic() as unknown as AnthropicLike);

  const userPrompt = buildUserPrompt(input);
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: '{' },
  ];

  const baseParams = {
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: [
      {
        type: 'text' as const,
        text: AGENT_4_SYSTEM_PROMPT,
        // No-op silencieux si < 4096 tokens (seuil Haiku 4.5).
        cache_control: { type: 'ephemeral' as const },
      },
    ],
  };

  let lastError: string | null = null;
  let lastClaudeText = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await client.messages.create({
      ...baseParams,
      messages,
    });

    lastClaudeText =
      response.content.find((b): b is AnthropicTextBlock => b.type === 'text')?.text ?? '';

    let parsed: unknown;
    try {
      parsed = extractJsonFromPrefilledResponse(lastClaudeText);
    } catch (err) {
      lastError = `json_parse_failed_attempt_${attempt}: ${err instanceof Error ? err.message : String(err)}`;
      options.logger?.warn(
        { week_id: input.week_id, attempt, preview: lastClaudeText.slice(0, 200) },
        'synthesize_trends_parse_failed',
      );
      if (attempt < 2) {
        messages.pop();
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content:
            "Ta réponse précédente n'a pas pu être parsée comme JSON. Renvoie UN JSON unique, commençant par { et finissant par }, sans balises markdown ni texte hors JSON. Strictement conforme au schéma LinkedinTrends du system prompt.",
        });
        messages.push({ role: 'assistant', content: '{' });
      }
      continue;
    }

    const zodResult = linkedinTrendsSchema.safeParse(parsed);
    if (zodResult.success) {
      return {
        trends: zodResult.data,
        usage: computeCost(response.usage),
        retried: attempt > 1,
      };
    }

    const firstIssue = zodResult.error.issues[0];
    const issueDescr = firstIssue
      ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
      : 'unknown';
    lastError = `zod_validation_failed_attempt_${attempt}: ${issueDescr}`;
    options.logger?.warn(
      {
        week_id: input.week_id,
        attempt,
        issue: issueDescr,
        preview: lastClaudeText.slice(0, 200),
      },
      'synthesize_trends_zod_failed',
    );

    if (attempt < 2) {
      messages.pop();
      messages.push({ role: 'assistant', content: lastClaudeText });
      messages.push({
        role: 'user',
        content: `Le JSON précédent a échoué la validation Zod. Erreur: ${issueDescr}.

Rappel des contraintes du schéma LinkedinTrends :
- top_hooks : array (1+) d'objets { type: string, frequency: number ≥ 0, avg_engagement_norm: number, example_post_id: string non vide }.
- top_formats : array d'objets { format: string non vide, frequency: number ≥ 0, avg_engagement_norm: number }.
- top_topic_clusters : array d'objets { cluster: string non vide, frequency: number ≥ 0, avg_engagement_norm: number }.
- rising_topics, falling_topics, mecaniques_emergentes : array de strings (peuvent être vides).
- tone_dominant : string non vide.
- longueur_optimale_p50_p90 : tuple [number, number] (exactement 2 nombres).
- best_days_observed : array d'objets { day: string non vide, avg_engagement_norm: number }.
- best_hours_observed : array d'objets { hour_bucket: string non vide, avg_engagement_norm: number }.
- format_performance : array d'objets { format: string non vide, avg_engagement_norm: number }.
- ten_best_posts : array (max 10) d'objets { post_id: string non vide, score: number, summary: string non vide }.
- synthese_textuelle : string non vide.

Renvoie le JSON corrigé. Aucun texte hors JSON.`,
      });
      messages.push({ role: 'assistant', content: '{' });
    }
  }

  throw new Error(
    `synthesize_trends_failed_after_2_attempts: ${lastError} (week_id=${input.week_id})`,
  );
}
