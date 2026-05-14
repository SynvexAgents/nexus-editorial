/**
 * visual-decision — Agent 8 Nexus Editorial.
 *
 * Décide pour chacun des 3 winners s'il bénéficie d'un visuel et, le cas
 * échéant, génère un gamma_prompt prêt à coller dans Gamma.app.
 *
 * Mode : 1 call Haiku 4.5 qui traite les 3 posts d'un coup (économie
 * tokens vs 3 calls indépendants).
 *
 * Pattern aligné Agents 3/4/6/7 : pas de prefill (cohérent avec Opus mais
 * Haiku le supporte ; on garde le prefill ici car c'est encore valable
 * sur Haiku 4.5), validation Zod par item, retry 1x sur fail.
 *
 * Note : on REUTILISE le prefill `{` sur Haiku 4.5 (compatible) pour
 * forcer la sortie JSON. Le helper extractJsonFromPrefilledResponse est
 * importé depuis editorial-analyst.
 */
import Anthropic from '@anthropic-ai/sdk';
import { type VisualDecision, visualDecisionSchema } from '@nexus/shared';
import type { WeeklyWinners } from '@nexus/shared';
import { z } from 'zod';
import { extractJsonFromPrefilledResponse } from './editorial-analyst.js';

// Pricing Haiku 4.5 — identique à Agent 3/4.
const PRICE_INPUT_USD_PER_M = 1.0;
const PRICE_OUTPUT_USD_PER_M = 5.0;
const PRICE_CACHE_WRITE_USD_PER_M = 1.25;
const PRICE_CACHE_READ_USD_PER_M = 0.1;
const USD_TO_EUR = 0.92;

const MODEL_ID = 'claude-haiku-4-5';
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.4;

export const visualsArraySchema = z.array(visualDecisionSchema).length(3, {
  message: 'visuals array must contain exactly 3 entries (one per winner)',
});

export type VisualsArray = z.infer<typeof visualsArraySchema>;

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  cost_usd: number;
  cost_eur: number;
}

export interface DecideVisualsResult {
  visuals: VisualsArray;
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

export const SYSTEM_PROMPT_VISUAL = `Tu es Visual Decision pour Synvex. Tu reçois 3 posts LinkedIn FR finaux et tu décides pour chacun :

1. \`visual_recommended\` (boolean) : true si le post bénéficie SIGNIFICATIVEMENT d'un visuel. false si le texte suffit (un constat sec ou une thèse argumentée n'a souvent pas besoin de visuel — le texte porte lui-même).

2. \`visual_type\` (enum) :
   - "aucun" → SI visual_recommended=false
   - "image_unique" → 1 image conceptuelle (graphe abstrait, photo sobre)
   - "carrousel_4" → 4 slides pour décomposer un raisonnement (typique pedagogie_technique)
   - "carrousel_6" → 6 slides pour étape par étape (typique these_marche / analyse_donnee complexes)
   - "data_viz_single" → 1 chart si le post repose sur 3-5 chiffres comparatifs

3. \`visual_reason\` (1-2 lignes, sec, factuel) : pourquoi ce type de visuel (ou pourquoi rien). Pas de flatterie.

4. \`gamma_prompt\` : SI visual_recommended=true, le prompt EXACT à coller dans Gamma.app pour générer le visuel.
   - Format : 50-300 caractères, descriptif, sans jargon Synvex (Gamma ne connaît pas le contexte interne).
   - Style imposé à inclure : "minimaliste, palette neutre (gris/bleu nuit/blanc), typographie sérieuse, aucune illustration gimmick".
   - Donne le contenu précis des slides ou de l'image, pas un brief vague.
   - SI visual_recommended=false → gamma_prompt = "" (string vide).

RÈGLES TRANSVERSALES :
- Pas tous les posts ont besoin d'un visuel. Un constat lucide court porte souvent mieux SEUL. Sois honnête.
- Aucune mention Synvex / Orion / Helios / Chiron / Hermès / Argus / Atlas / Cortex dans gamma_prompt.
- Aucun emoji.
- Le post_position correspond exactement à celui en entrée (1, 2, 3).

SORTIE : JSON strict avec une clé racine \`visuals\` contenant un array d'EXACTEMENT 3 objets, un par post (ordre post_position 1, 2, 3). Aucun texte hors JSON. Aucune balise markdown.`;

function buildUserPrompt(winners: WeeklyWinners): string {
  const winnersSummary = winners
    .map(
      (w) => `=== POST ${w.post_position} (winner_id ${w.winner_id}) ===
longueur_finale : ${w.longueur_finale} chars
cta_recommande  : ${w.cta_recommande}

post_final :
${w.post_final}
`,
    )
    .join('\n');

  return `Décide pour chacun des 3 posts s'il a besoin d'un visuel. Renvoie un JSON unique avec clé racine "visuals" (array de 3 entrées, ordre post_position 1, 2, 3).

${winnersSummary}

Rappel : si visual_recommended=false, alors visual_type="aucun" ET gamma_prompt="". Si visual_recommended=true, alors gamma_prompt ≥ 50 chars (Zod le valide).

Réponds par UN JSON unique commençant par { et finissant par }.`;
}

export interface DecideVisualsOptions {
  client?: AnthropicLike;
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

export async function decideVisuals(
  winners: WeeklyWinners,
  options: DecideVisualsOptions = {},
): Promise<DecideVisualsResult> {
  const client: AnthropicLike = options.client ?? (new Anthropic() as unknown as AnthropicLike);

  const userPrompt = buildUserPrompt(winners);
  // Haiku 4.5 supporte encore le prefill assistant — on l'utilise pour
  // garantir le démarrage JSON.
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
        text: SYSTEM_PROMPT_VISUAL,
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
        { attempt, preview: lastClaudeText.slice(0, 200) },
        'decide_visuals_parse_failed',
      );
      if (attempt < 2) {
        messages.pop();
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content:
            "Ta réponse précédente n'a pas pu être parsée comme JSON. Renvoie UN JSON unique commençant par { et finissant par }, avec clé racine 'visuals' (array de 3 entrées). Aucune balise markdown.",
        });
        messages.push({ role: 'assistant', content: '{' });
      }
      continue;
    }

    // Extrait l'array visuals.
    const visualsRaw =
      typeof parsed === 'object' && parsed !== null && 'visuals' in parsed
        ? (parsed as { visuals: unknown }).visuals
        : parsed;

    const zodResult = visualsArraySchema.safeParse(visualsRaw);
    if (!zodResult.success) {
      const firstIssue = zodResult.error.issues[0];
      const issueDescr = firstIssue
        ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
        : 'unknown';
      lastError = `zod_validation_failed_attempt_${attempt}: ${issueDescr}`;
      options.logger?.warn(
        { attempt, issue: issueDescr, preview: lastClaudeText.slice(0, 300) },
        'decide_visuals_zod_failed',
      );
      if (attempt < 2) {
        messages.pop();
        messages.push({ role: 'assistant', content: lastClaudeText });
        messages.push({
          role: 'user',
          content: `Le JSON précédent a échoué la validation Zod. Erreur: ${issueDescr}.

Rappel des contraintes :
- Racine = objet { "visuals": [...] }.
- "visuals" = array d'EXACTEMENT 3 entrées (.length(3) Zod strict).
- Chaque entrée a 5 champs : post_position (1|2|3), visual_recommended (bool), visual_reason (string non vide), visual_type (enum: aucun|image_unique|carrousel_4|carrousel_6|data_viz_single), gamma_prompt (string).
- Si visual_recommended=true ALORS gamma_prompt ≥ 50 chars ET visual_type ≠ "aucun".
- Si visual_recommended=false ALORS visual_type="aucun" ET gamma_prompt="".

Renvoie le JSON corrigé. Aucun texte hors JSON.`,
        });
        messages.push({ role: 'assistant', content: '{' });
      }
      continue;
    }

    // Conforme à VisualDecision[]. On force le typage explicite.
    const visuals: VisualsArray = zodResult.data as VisualsArray;
    void (visuals as VisualDecision[]); // type assertion check
    return {
      visuals,
      usage: computeCost(response.usage),
      retried: attempt > 1,
    };
  }

  throw new Error(`decide_visuals_failed_after_2_attempts: ${lastError}`);
}
