/**
 * angles-generator — Agent 6 Nexus Editorial.
 *
 * Génère 8 angles éditoriaux (un par archétype distinct) pour la semaine
 * via Claude Opus 4.7. Pattern identique à Agent 3/4 :
 *   - Prefill assistant `{` (Zod 3 → zodOutputFormat indisponible).
 *   - 1 retry sur échec Zod ou contrainte custom (archétypes uniques).
 *   - Client Anthropic injectable pour les tests.
 *
 * Spécificité Opus 4.7 :
 *   - Pricing élevé ($5 in / $25 out / M tokens) → cache ephemeral sur
 *     system prompt (économie ~90% sur runs récurrents).
 *   - Max output 8192 tokens (8 angles richement structurés).
 *   - Temperature 0.6 (équilibre créativité/cohérence).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Archetype, InsuranceTrends, LinkedinTrends, WeeklyAngles } from '@nexus/shared';
import { weeklyAnglesSchema } from '@nexus/shared';
import { AGENT_6_SYSTEM_PROMPT } from './agent-6-system-prompt.js';
import type { VoicePackEntry } from './voice-pack-matcher.js';

/**
 * Variante d'extraction JSON sans prefill — Opus 4.7 a deprecated le pattern
 * "assistant: {". On instruit le modèle de répondre par un JSON commençant
 * par { ; on tolère du markdown fence et du texte trailing.
 */
export function extractJsonObject(rawText: string): unknown {
  let text = rawText.trim();
  // Strip markdown fences éventuels.
  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no_json_object_found_in_response');
  }
  return JSON.parse(text.substring(start, end + 1));
}

// Pricing Opus 4.7 (USD / 1M tokens) — source : platform.claude.com/pricing, 2026-05.
const PRICE_INPUT_USD_PER_M = 5.0;
const PRICE_OUTPUT_USD_PER_M = 25.0;
const PRICE_CACHE_WRITE_USD_PER_M = 6.25;
const PRICE_CACHE_READ_USD_PER_M = 0.5;
const USD_TO_EUR = 0.92;

const MODEL_ID = 'claude-opus-4-7';
const MAX_TOKENS = 8192;
// Note : Opus 4.7 ne supporte plus le paramètre `temperature` (deprecated
// dans l'API depuis le passage Opus 4.6 → 4.7). On l'omet ; le modèle est
// déjà calibré pour produire du contenu créatif sans tuning client.

const REQUIRED_ARCHETYPES: readonly Archetype[] = [
  'constat_lucide',
  'retour_experience_metier',
  'contrarian_assurance',
  'pedagogie_technique',
  'observation_signal_faible',
  'analyse_donnee',
  'anecdote_terrain',
  'these_marche',
] as const;

export interface AnglesInput {
  week_id: string;
  linkedin_trends: LinkedinTrends;
  insurance_trends: InsuranceTrends;
  voice_pack_excerpts: VoicePackEntry[];
}

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
  cost_eur: number;
}

export interface AnglesResult {
  angles: WeeklyAngles;
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

function buildUserPrompt(input: AnglesInput): string {
  const voicePackBlock =
    input.voice_pack_excerpts.length === 0
      ? '(voice pack vide — applique strictement le VOICE_TONE du system prompt)'
      : JSON.stringify(
          input.voice_pack_excerpts.map((e) => ({
            type: e.type,
            content: e.content,
            weight: e.weight,
            ...(e.score !== undefined ? { score: Math.round(e.score * 1000) / 1000 } : {}),
          })),
          null,
          2,
        );

  return `Voici les données de la semaine ${input.week_id}.

Génère EXACTEMENT 8 angles éditoriaux, un par archétype DISTINCT, conformes au schéma WeeklyAngles décrit dans le system prompt.

Réponds par UN SEUL objet JSON avec la clé racine "angles", commençant par { et finissant par }. Aucun texte hors JSON, aucune balise markdown.

=== INPUT 1 : week_id ===
${input.week_id}

=== INPUT 2 : linkedin_trends ===
${JSON.stringify(input.linkedin_trends, null, 2)}

=== INPUT 3 : insurance_trends ===
${JSON.stringify(input.insurance_trends, null, 2)}

=== INPUT 4 : voice_pack_excerpts ===
${voicePackBlock}

=== RAPPEL CRITIQUE ===
- 8 angles, 8 archétypes distincts (chacun apparaît exactement une fois).
- Liste exacte : ${REQUIRED_ARCHETYPES.join(', ')}.
- Au moins 4 ICP différents sur les 8.
- Au moins 2 longueurs_cibles différentes sur les 8.
- Aucune mention Synvex / Orion / Helios / Chiron / Hermès / Argus / Atlas / Cortex.
- Vouvoiement.
`;
}

/**
 * Validation custom au-delà de Zod : doit avoir exactement les 8 archétypes
 * requis, un par un. Retourne null si OK, sinon une description de l'écart.
 */
function validateArchetypeCoverage(angles: WeeklyAngles): string | null {
  const seen = new Map<Archetype, number>();
  for (const a of angles) {
    seen.set(a.archetype, (seen.get(a.archetype) ?? 0) + 1);
  }
  const missing = REQUIRED_ARCHETYPES.filter((a) => !seen.has(a));
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([a, n]) => `${a}×${n}`);
  if (missing.length === 0 && duplicates.length === 0) return null;
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`manquants: ${missing.join(', ')}`);
  if (duplicates.length > 0) parts.push(`dupliqués: ${duplicates.join(', ')}`);
  return parts.join(' | ');
}

export interface GenerateAnglesOptions {
  /** Override SDK Anthropic pour tests. */
  client?: AnthropicLike;
  /** Logger optionnel. */
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

export async function generateAngles(
  input: AnglesInput,
  options: GenerateAnglesOptions = {},
): Promise<AnglesResult> {
  const client: AnthropicLike = options.client ?? (new Anthropic() as unknown as AnthropicLike);

  const userPrompt = buildUserPrompt(input);
  // Opus 4.7 ne supporte pas le prefill assistant ; la conversation doit
  // se terminer sur un message user. On compte sur l'instruction explicite
  // "réponds par UN JSON commençant par {" + extractJsonObject tolérant.
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: userPrompt },
  ];

  const baseParams = {
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text' as const,
        text: AGENT_6_SYSTEM_PROMPT,
        // Opus seuil cache = 1024 tokens. System prompt Agent 6 ≈ 6k chars
        // donc ~1.5k tokens — au-dessus du seuil minimum Opus, le cache
        // s'active sur le 2e run de la même semaine.
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
      parsed = extractJsonObject(lastClaudeText);
    } catch (err) {
      lastError = `json_parse_failed_attempt_${attempt}: ${err instanceof Error ? err.message : String(err)}`;
      options.logger?.warn(
        { week_id: input.week_id, attempt, preview: lastClaudeText.slice(0, 200) },
        'generate_angles_parse_failed',
      );
      if (attempt < 2) {
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content:
            "Ta réponse précédente n'a pas pu être parsée comme JSON. Renvoie UN JSON unique commençant par { et finissant par }, avec la clé racine 'angles' contenant exactement 8 entrées. Aucune balise markdown, aucun texte hors JSON.",
        });
      }
      continue;
    }

    // Extraction du tableau angles (la racine est { angles: [...] }).
    const anglesArray =
      typeof parsed === 'object' && parsed !== null && 'angles' in parsed
        ? (parsed as { angles: unknown }).angles
        : parsed;

    const zodResult = weeklyAnglesSchema.safeParse(anglesArray);
    if (!zodResult.success) {
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
          preview: lastClaudeText.slice(0, 300),
        },
        'generate_angles_zod_failed',
      );
      if (attempt < 2) {
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content: `Le JSON précédent a échoué la validation Zod. Erreur: ${issueDescr}.

Rappel des contraintes :
- Racine = objet { "angles": [...] }.
- "angles" = tableau d'EXACTEMENT 8 entrées (.length(8) Zod strict).
- Chaque entrée a 12 champs : angle_id, archetype, titre_interne, hook_brut, these_centrale, promesse_lecteur, structure_proposee, longueur_cible, tonalite, ancrage_assurance, ancrage_linkedin, icp_vise, risques.
- archetype ∈ {${REQUIRED_ARCHETYPES.join(', ')}} — chacun apparaît exactement UNE FOIS.
- longueur_cible ∈ {court, moyen, long}.
- icp_vise ∈ {courtier, MGA, mutuelle, insurtech, dirigeant_general}.
- angle_id format /^W\\d{1,2}-A[1-8]$/ (ex: "W20-A1").
- risques = array de strings (1+ entrées).

Renvoie le JSON corrigé. Aucun texte hors JSON.`,
        });
      }
      continue;
    }

    // Zod OK → validation archétypes uniques.
    const archetypeIssue = validateArchetypeCoverage(zodResult.data);
    if (archetypeIssue !== null) {
      lastError = `archetype_coverage_failed_attempt_${attempt}: ${archetypeIssue}`;
      options.logger?.warn(
        { week_id: input.week_id, attempt, issue: archetypeIssue },
        'generate_angles_archetype_coverage_failed',
      );
      if (attempt < 2) {
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content: `Le tableau d'angles ne respecte pas la contrainte d'archétypes distincts. ${archetypeIssue}.

Régénère un tableau de 8 angles, chacun avec un archétype DISTINCT parmi : ${REQUIRED_ARCHETYPES.join(', ')}.
Chaque archétype apparaît EXACTEMENT une fois. Pas de doublon, aucun manquant.

Renvoie le JSON corrigé. Aucun texte hors JSON.`,
        });
      }
      continue;
    }

    return {
      angles: zodResult.data,
      usage: computeCost(response.usage),
      retried: attempt > 1,
    };
  }

  throw new Error(
    `generate_angles_failed_after_2_attempts: ${lastError} (week_id=${input.week_id})`,
  );
}
