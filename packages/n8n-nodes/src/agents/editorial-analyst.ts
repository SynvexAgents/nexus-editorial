/**
 * editorial-analyst — Agent 3 Nexus Editorial.
 *
 * Analyse un clean_post via Claude Haiku 4.5 et renvoie un PostAnalysis
 * validé par Zod.
 *
 * Pattern JSON output : prefill assistant avec `{` (le helper
 * `zodOutputFormat` du SDK Anthropic requiert Zod 4 internals — le repo
 * est en Zod 3). Le prefill garantit que Claude continue par du JSON,
 * et on prépend `{` côté client avant JSON.parse + Zod.safeParse.
 *
 * Retry : 1 réessai sur échec de parse/validation (parse JSON KO ou
 * Zod KO). Après 2 échecs, throw — l'orchestrateur appelant DLQuera.
 *
 * Le client Anthropic est injectable pour les tests (Vitest mock).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { CleanPost, PostAnalysis, RawPost } from '@nexus/shared';
import { postAnalysisSchema } from '@nexus/shared';
import { SYSTEM_PROMPT } from './system-prompt-builder.js';

// Tarification Haiku 4.5 (USD / 1M tokens) — source: shared/models.md, 2026-04-29.
const PRICE_INPUT_USD_PER_M = 1.0;
const PRICE_OUTPUT_USD_PER_M = 5.0;
const PRICE_CACHE_WRITE_USD_PER_M = 1.25;
const PRICE_CACHE_READ_USD_PER_M = 0.1;
const USD_TO_EUR = 0.92;

const MODEL_ID = 'claude-haiku-4-5';
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3;

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
  cost_eur: number;
}

export interface PostAnalysisResult {
  analysis: PostAnalysis;
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

// Interface minimale du SDK Anthropic — facilite le mocking dans les tests.
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

function buildUserPrompt(cleanPost: CleanPost, rawPost: RawPost): string {
  const meta = [
    `post_id           : ${cleanPost.post_id}`,
    `profile_id        : ${rawPost.profile_id ?? '(unknown)'}`,
    `published_at      : ${rawPost.published_at}`,
    `media_type        : ${rawPost.media_type ?? '(unknown)'}`,
    `likes/comments/reposts : ${rawPost.likes}/${rawPost.comments}/${rawPost.reposts}`,
    `engagement_score_normalized : ${cleanPost.engagement_score_normalized.toFixed(3)}`,
    `topic_cluster_pre (heuristique regex) : ${cleanPost.topic_cluster_pre}`,
  ].join('\n');

  return `Analyse le post LinkedIn ci-dessous et retourne UN OBJET JSON conforme au schéma PostAnalysis du system prompt. Aucun texte hors JSON, aucun markdown, aucun préambule.

=== MÉTADONNÉES DU POST ===
${meta}

=== TEXTE DU POST ===
${rawPost.text ?? '(texte vide)'}

=== INSTRUCTIONS DE SORTIE ===
- post_id : reprends EXACTEMENT "${cleanPost.post_id}".
- transferabilite_assurance : ENTIER entre 0 et 10 INCLUS.
- longueur_caracteres et longueur_paragraphes : ENTIERS POSITIFS (≥ 1).
- Tous les champs string : NON VIDES.
- mecaniques_attention : 1 à 3 entrées spécifiques.
- raison_performance_hypothese : 1-2 phrases sec/factuel, mécanique de performance, sans flatterie.
- Tous les enums : valeurs EXACTES du system prompt.

Réponds par un JSON unique commençant par { et finissant par }. Pas de balises markdown.`;
}

/**
 * Extrait un JSON à partir d'une réponse Claude, en supposant un prefill `{`.
 * Robuste aux fences markdown, espaces, texte trailing.
 */
export function extractJsonFromPrefilledResponse(rawText: string): unknown {
  // Le prefill = `{`. On le prépend.
  let text = `{${rawText}`;
  // Strip d'éventuelles fences markdown que Claude pourrait ajouter.
  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  // Trouve le 1er { et le dernier } — tolère le texte trailing.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no_json_object_found_in_response');
  }
  return JSON.parse(text.substring(start, end + 1));
}

export interface AnalyzePostOptions {
  /** Override pour les tests Vitest. Par défaut, instance Anthropic réelle. */
  client?: AnthropicLike;
  /** Logger optionnel pour traces structurées. */
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

export async function analyzePost(
  cleanPost: CleanPost,
  rawPost: RawPost,
  options: AnalyzePostOptions = {},
): Promise<PostAnalysisResult> {
  const client: AnthropicLike = options.client ?? (new Anthropic() as unknown as AnthropicLike);

  const userPrompt = buildUserPrompt(cleanPost, rawPost);
  // Le prefill `{` force Claude à continuer par du JSON.
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
        text: SYSTEM_PROMPT,
        // No-op silencieux tant que le system prompt < 4096 tokens (seuil
        // Haiku 4.5). Garde le marker pour le jour où on étoffe le brief.
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    // stop_sequences pas nécessaire — l'instruction "réponds par un JSON
    // unique" + le prefill suffisent en pratique pour Haiku 4.5.
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

    // Tente parse + validation Zod.
    let parsed: unknown;
    try {
      parsed = extractJsonFromPrefilledResponse(lastClaudeText);
    } catch (err) {
      lastError = `json_parse_failed_attempt_${attempt}: ${err instanceof Error ? err.message : String(err)}`;
      options.logger?.warn(
        { post_id: cleanPost.post_id, attempt, preview: lastClaudeText.slice(0, 200) },
        'analyze_post_json_parse_failed',
      );
      if (attempt < 2) {
        messages.pop(); // retire le prefill
        messages.push({
          role: 'assistant',
          content: lastClaudeText,
        });
        messages.push({
          role: 'user',
          content:
            "Ta réponse précédente n'a pas pu être parsée comme JSON. Renvoie UN JSON unique, commençant par { et finissant par }, sans balises markdown ni texte hors JSON. Strictement conforme au schéma PostAnalysis du system prompt.",
        });
        messages.push({ role: 'assistant', content: '{' });
      }
      continue;
    }

    const zodResult = postAnalysisSchema.safeParse(parsed);
    if (zodResult.success) {
      // Cohérence : Claude doit reprendre exactement le post_id fourni.
      let finalAnalysis = zodResult.data;
      if (finalAnalysis.post_id !== cleanPost.post_id) {
        options.logger?.warn(
          { expected: cleanPost.post_id, got: finalAnalysis.post_id, attempt },
          'post_id_mismatch_corrected',
        );
        finalAnalysis = { ...finalAnalysis, post_id: cleanPost.post_id };
      }
      return {
        analysis: finalAnalysis,
        usage: computeCost(response.usage),
        retried: attempt > 1,
      };
    }

    // Zod a rejeté — on retente avec un message correctif explicite.
    const firstIssue = zodResult.error.issues[0];
    const issueDescr = firstIssue
      ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
      : 'unknown';
    lastError = `zod_validation_failed_attempt_${attempt}: ${issueDescr}`;
    options.logger?.warn(
      {
        post_id: cleanPost.post_id,
        attempt,
        issue: issueDescr,
        preview: lastClaudeText.slice(0, 200),
      },
      'analyze_post_zod_failed',
    );

    if (attempt < 2) {
      messages.pop(); // retire le prefill `{`
      messages.push({ role: 'assistant', content: lastClaudeText });
      messages.push({
        role: 'user',
        content: `Le JSON précédent a échoué la validation Zod. Erreur: ${issueDescr}.

Rappel des contraintes implicites (non encodées dans le schéma JSON) :
- Tous les champs string sont NON VIDES (longueur ≥ 1).
- transferabilite_assurance est un ENTIER entre 0 et 10 INCLUS.
- longueur_caracteres et longueur_paragraphes sont des ENTIERS POSITIFS (≥ 1).
- mecaniques_attention contient 1 à 3 éléments NON VIDES.
- Tous les enums respectent EXACTEMENT les valeurs autorisées (cf. system prompt).

Renvoie le JSON corrigé. Aucun texte hors JSON.`,
      });
      messages.push({ role: 'assistant', content: '{' });
    }
  }

  throw new Error(
    `analyze_post_failed_after_2_attempts: ${lastError} (post_id=${cleanPost.post_id})`,
  );
}
