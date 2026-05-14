/**
 * winners-selector — Agent 7 Nexus Editorial.
 *
 * Pipeline :
 *   1. Compose user prompt avec 8 angles + linkedin_trends + insurance_trends.
 *   2. Call Claude Opus 4.7. Retry 1x sur fail Zod ou JSON parse.
 *   3. Retourne winners + all_scoring + fusions_proposees (méta).
 *
 * Notes Opus 4.7 :
 *   - Pas de paramètre `temperature` (deprecated).
 *   - Pas de prefill assistant (deprecated). On utilise extractJsonObject.
 *   - Cache ephemeral sur system prompt (~7k tokens, au-dessus du seuil
 *     Opus 1024).
 */
import Anthropic from '@anthropic-ai/sdk';
import type { InsuranceTrends, LinkedinTrends, WeeklyAngles, WeeklyWinners } from '@nexus/shared';
import { weeklyWinnersSchema } from '@nexus/shared';
import { AGENT_7_SYSTEM_PROMPT } from './agent-7-system-prompt.js';
import { extractJsonObject } from './angles-generator.js';

// Pricing Opus 4.7 (USD / 1M tokens) — identique à Agent 6.
const PRICE_INPUT_USD_PER_M = 5.0;
const PRICE_OUTPUT_USD_PER_M = 25.0;
const PRICE_CACHE_WRITE_USD_PER_M = 6.25;
const PRICE_CACHE_READ_USD_PER_M = 0.5;
const USD_TO_EUR = 0.92;

const MODEL_ID = 'claude-opus-4-7';
const MAX_TOKENS = 12288;
// Pas de TEMPERATURE — deprecated sur Opus 4.7.

export interface AngleScoringEntry {
  angle_id: string;
  score_total: number;
  sous_scores: Record<string, number>;
  commentaire: string;
}

export interface FusionProposed {
  fusion_id: string;
  angle_ids: [string, string];
  rationale: string;
}

export interface WinnersInput {
  week_id: string;
  angles: WeeklyAngles;
  linkedin_trends: LinkedinTrends;
  insurance_trends: InsuranceTrends;
}

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
  cost_eur: number;
}

export interface SelectAndWriteWinnersResult {
  winners: WeeklyWinners;
  /** Méta : scoring complet des 8 angles, pour le rapport CLI. Optionnel. */
  all_scoring: AngleScoringEntry[];
  /** Méta : fusions proposées (0-2). Vide si aucune n'a été retenue. */
  fusions_proposees: FusionProposed[];
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

function buildUserPrompt(input: WinnersInput): string {
  return `Voici les données de la semaine ${input.week_id}.

Tu reçois 8 angles éditoriaux. Suis les 6 étapes décrites dans le system prompt : scoring, fusions, sélection complémentaire de 3 winners, rédaction des posts finaux, 3 variantes de hook, auto-check qualité.

Réponds par UN SEUL objet JSON commençant par { et finissant par }. Aucun texte hors JSON.

=== INPUT 1 : week_id ===
${input.week_id}

=== INPUT 2 : 8 angles (output Agent 6) ===
${JSON.stringify(input.angles, null, 2)}

=== INPUT 3 : linkedin_trends (output Agent 4) ===
${JSON.stringify(input.linkedin_trends, null, 2)}

=== INPUT 4 : insurance_trends (output Agent 5) ===
${JSON.stringify(input.insurance_trends, null, 2)}

=== RAPPEL CRITIQUE ===
- 3 winners EXACTEMENT (.length(3) Zod), complémentaires (archétypes / ICP / longueurs).
- Aucune mention Synvex / produits Synvex dans les posts finaux.
- Auto-check honnête : le post-processor vérifie tes claims, mens et tu seras corrigé.
- Sortie : { "winners": [...], "all_scoring": [...]?, "fusions_proposees": [...]? }
`;
}

export interface SelectAndWriteWinnersOptions {
  client?: AnthropicLike;
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

/**
 * Parse safely le scoring complet et les fusions, en silenciant les
 * formats incorrects (ce sont des champs meta, pas critiques).
 */
function parseMeta(parsed: unknown): {
  all_scoring: AngleScoringEntry[];
  fusions_proposees: FusionProposed[];
} {
  if (typeof parsed !== 'object' || parsed === null) {
    return { all_scoring: [], fusions_proposees: [] };
  }
  const obj = parsed as Record<string, unknown>;
  const rawScoring = Array.isArray(obj.all_scoring) ? obj.all_scoring : [];
  const all_scoring: AngleScoringEntry[] = rawScoring
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .filter((e) => typeof e.angle_id === 'string' && typeof e.score_total === 'number')
    .map((e) => ({
      angle_id: String(e.angle_id),
      score_total: Number(e.score_total),
      sous_scores:
        typeof e.sous_scores === 'object' && e.sous_scores !== null
          ? (e.sous_scores as Record<string, number>)
          : {},
      commentaire: typeof e.commentaire === 'string' ? e.commentaire : '',
    }));

  const rawFusions = Array.isArray(obj.fusions_proposees) ? obj.fusions_proposees : [];
  const fusions_proposees: FusionProposed[] = rawFusions
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .filter(
      (f) =>
        typeof f.fusion_id === 'string' &&
        Array.isArray(f.angle_ids) &&
        f.angle_ids.length === 2 &&
        typeof f.angle_ids[0] === 'string' &&
        typeof f.angle_ids[1] === 'string',
    )
    .map((f) => ({
      fusion_id: String(f.fusion_id),
      angle_ids: [String((f.angle_ids as string[])[0]), String((f.angle_ids as string[])[1])] as [
        string,
        string,
      ],
      rationale: typeof f.rationale === 'string' ? f.rationale : '',
    }));

  return { all_scoring, fusions_proposees };
}

export async function selectAndWriteWinners(
  input: WinnersInput,
  options: SelectAndWriteWinnersOptions = {},
): Promise<SelectAndWriteWinnersResult> {
  const client: AnthropicLike = options.client ?? (new Anthropic() as unknown as AnthropicLike);

  const userPrompt = buildUserPrompt(input);
  // Pas de prefill (Opus 4.7) — conversation finit sur user.
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: userPrompt },
  ];

  const baseParams = {
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text' as const,
        text: AGENT_7_SYSTEM_PROMPT,
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
        'select_winners_parse_failed',
      );
      if (attempt < 2) {
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content:
            "Ta réponse précédente n'a pas pu être parsée comme JSON. Renvoie UN JSON unique commençant par { et finissant par }, avec la clé 'winners' contenant exactement 3 entrées. Aucune balise markdown, aucun texte hors JSON.",
        });
      }
      continue;
    }

    // Extrait l'array winners.
    const winnersRaw =
      typeof parsed === 'object' && parsed !== null && 'winners' in parsed
        ? (parsed as { winners: unknown }).winners
        : parsed;

    const zodResult = weeklyWinnersSchema.safeParse(winnersRaw);
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
        'select_winners_zod_failed',
      );
      if (attempt < 2) {
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content: `Le JSON précédent a échoué la validation Zod. Erreur: ${issueDescr}.

Rappel des contraintes :
- Racine = objet { "winners": [...], "all_scoring": [...]?, "fusions_proposees": [...]? }.
- "winners" = tableau d'EXACTEMENT 3 entrées (.length(3) Zod strict).
- Chaque winner a 10 champs : post_position (1|2|3), winner_id, fusion_used (false ou [angle_id_1, angle_id_2]), scoring (array d'objets), rationale_strategique, post_final, hook_variantes (tuple de 3 strings), cta_recommande, longueur_finale (int > 0), checklist_qualite_passee (6 booléens).
- post_position couvre 1, 2, 3 (pas de répétition).
- hook_variantes : EXACTEMENT 3 strings.
- checklist_qualite_passee : 6 booléens nommés anti_cliche_ok, ancrage_actu_assurance_ok, ton_synvex_ok, longueur_alignee_tendance_ok, absence_survente_ok, vocabulaire_metier_ok.

Renvoie le JSON corrigé. Aucun texte hors JSON.`,
        });
      }
      continue;
    }

    // Succès Zod. Parse les méta.
    const { all_scoring, fusions_proposees } = parseMeta(parsed);

    return {
      winners: zodResult.data,
      all_scoring,
      fusions_proposees,
      usage: computeCost(response.usage),
      retried: attempt > 1,
    };
  }

  throw new Error(
    `select_winners_failed_after_2_attempts: ${lastError} (week_id=${input.week_id})`,
  );
}
