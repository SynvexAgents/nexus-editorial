// agent-8-visual-decision
// Endpoint POST. Lit weekly_reports.winners_json pour week_id, décide
// pour chacun des 3 posts si un visuel est pertinent + génère le
// gamma_prompt. Haiku 4.5 en 1 call. UPSERT visuals_json.
//
// Body : { week_id: string, force?: boolean }

import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { currentIsoWeek } from '../_shared/week.ts';
import { callAnthropic, extractTextFromResponse } from '../_shared/anthropic.ts';
import { computeAnthropicCost, HAIKU_4_5 } from '../_shared/pricing.ts';
import { extractJsonFromPrefilledResponse } from '../_shared/json_extract.ts';
import type { VisualDecision, WeeklyWinners } from '../_shared/schemas.ts';
import { visualsArraySchema } from '../_shared/schemas.ts';

const SYSTEM_PROMPT_VISUAL = `Tu es Visual Decision pour Synvex. Tu reçois 3 posts LinkedIn FR finaux et tu décides pour chacun :

1. \`visual_recommended\` (boolean) : true si le post bénéficie SIGNIFICATIVEMENT d'un visuel. false si le texte suffit.

2. \`visual_type\` (enum) :
   - "aucun" → SI visual_recommended=false
   - "image_unique" → 1 image conceptuelle
   - "carrousel_4" → 4 slides pour décomposer (pedagogie_technique)
   - "carrousel_6" → 6 slides étapes (these_marche / analyse_donnee complexes)
   - "data_viz_single" → 1 chart si 3-5 chiffres comparatifs

3. \`visual_reason\` (1-2 lignes, sec, factuel)

4. \`gamma_prompt\` : SI visual_recommended=true, prompt EXACT pour Gamma.app.
   - 50-300 chars, descriptif, sans jargon Synvex.
   - Style imposé : "minimaliste, palette neutre (gris/bleu nuit/blanc), typographie sérieuse, aucune illustration gimmick".
   - SI visual_recommended=false → gamma_prompt = "".

RÈGLES :
- Aucune mention Synvex / Orion / Helios / Chiron / Hermès / Argus / Atlas / Cortex.
- Aucun emoji.
- post_position correspond à celui en entrée (1, 2, 3).

SORTIE : JSON strict { "visuals": [...] } EXACTEMENT 3 entrées (ordre post_position 1, 2, 3). Aucun texte hors JSON.`;

function buildUserPrompt(winners: WeeklyWinners): string {
  const summary = winners
    .map(
      (w) => `=== POST ${w.post_position} (winner_id ${w.winner_id}) ===
longueur_finale : ${w.longueur_finale} chars
cta_recommande  : ${w.cta_recommande}

post_final :
${w.post_final}
`,
    )
    .join('\n');

  return `Décide pour chacun des 3 posts s'il a besoin d'un visuel. JSON unique avec clé racine "visuals" (3 entrées, ordre 1, 2, 3).

${summary}

Rappel : visual_recommended=false → visual_type="aucun" ET gamma_prompt="". visual_recommended=true → gamma_prompt ≥ 50 chars.

Réponds par UN JSON unique commençant par { et finissant par }.`;
}

function postProcessVisuals(visuals: VisualDecision[]): {
  visuals: VisualDecision[];
  overrides: number;
  critical_flags: string[];
} {
  let overrides = 0;
  const flags: string[] = [];
  const processed = visuals.map((v) => {
    let m = { ...v };
    if (!m.visual_recommended) {
      if (m.visual_type !== 'aucun') {
        m = { ...m, visual_type: 'aucun' };
        overrides += 1;
      }
      if (m.gamma_prompt !== '') {
        m = { ...m, gamma_prompt: '' };
        overrides += 1;
      }
    } else {
      if (m.visual_type === 'aucun')
        flags.push(`pos ${m.post_position}: type=aucun avec recommended=true`);
      if (m.gamma_prompt.length < 50) flags.push(`pos ${m.post_position}: gamma_prompt < 50 chars`);
    }
    return m;
  });
  return { visuals: processed, overrides, critical_flags: flags };
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'agent-8-visual-decision' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as { week_id?: string; force?: boolean };
    const weekId = body.week_id ?? currentIsoWeek();
    const sb = getSupabase();

    if (!body.force) {
      const { data: existing } = await sb
        .from('weekly_reports')
        .select('visuals_json')
        .eq('week_id', weekId)
        .maybeSingle();
      if (existing && (existing as { visuals_json: unknown }).visuals_json) {
        return jsonResponse({ skipped: true, reason: 'already_has_visuals', week_id: weekId });
      }
    }

    const { data: row } = await sb
      .from('weekly_reports')
      .select('winners_json')
      .eq('week_id', weekId)
      .maybeSingle();
    const winners = (row as { winners_json: WeeklyWinners | null } | null)?.winners_json;
    if (!winners) return errorResponse('winners_json_missing', 400, { week_id: weekId });

    const userPrompt = buildUserPrompt(winners);
    const messages = [
      { role: 'user' as const, content: userPrompt },
      { role: 'assistant' as const, content: '{' },
    ];
    const systemBlocks = [
      {
        type: 'text' as const,
        text: SYSTEM_PROMPT_VISUAL,
        cache_control: { type: 'ephemeral' as const },
      },
    ];

    let lastError: string | null = null;
    let result: { visuals: VisualDecision[]; usage: ReturnType<typeof extractUsage> } | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const resp = await callAnthropic({
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        temperature: 0.4,
        system: systemBlocks,
        messages,
      });
      const text = extractTextFromResponse(resp);

      let parsed: unknown;
      try {
        parsed = extractJsonFromPrefilledResponse(text);
      } catch (e) {
        lastError = `parse_failed_attempt_${attempt}: ${(e as Error).message}`;
        log.warn({ attempt, preview: text.slice(0, 200) }, 'decide_visuals_parse_failed');
        if (attempt < 2) {
          messages.pop();
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content:
              "Ta réponse précédente n'a pas pu être parsée. Renvoie UN JSON unique avec clé racine 'visuals' (3 entrées). Aucune balise markdown.",
          });
          messages.push({ role: 'assistant', content: '{' });
        }
        continue;
      }

      const visualsRaw =
        typeof parsed === 'object' && parsed && 'visuals' in parsed
          ? (parsed as { visuals: unknown }).visuals
          : parsed;
      const zod = visualsArraySchema.safeParse(visualsRaw);
      if (!zod.success) {
        lastError = `zod_failed_attempt_${attempt}: ${zod.error.issues[0]?.message ?? 'unknown'}`;
        log.warn({ attempt, issue: lastError }, 'decide_visuals_zod_failed');
        if (attempt < 2) {
          messages.pop();
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Le JSON a échoué Zod : ${lastError}. Re-renvoie un JSON correct : { "visuals": [3 entrées avec post_position 1/2/3, visual_recommended bool, visual_reason string, visual_type enum, gamma_prompt string] }.`,
          });
          messages.push({ role: 'assistant', content: '{' });
        }
        continue;
      }

      result = { visuals: zod.data as VisualDecision[], usage: extractUsage(resp.usage) };
      break;
    }

    if (!result) return errorResponse(`decide_visuals_failed_after_2_attempts: ${lastError}`, 500);

    const post = postProcessVisuals(result.visuals);
    const cost = computeAnthropicCost(result.usage, HAIKU_4_5);

    const { error: upErr } = await sb.from('weekly_reports').upsert(
      {
        week_id: weekId,
        visuals_json: post.visuals as unknown,
        produced_at: new Date().toISOString(),
      },
      { onConflict: 'week_id' },
    );
    if (upErr) return errorResponse(`upsert_failed: ${upErr.message}`, 500);

    const duration = Date.now() - t0;
    log.info(
      {
        week_id: weekId,
        duration_ms: duration,
        cost_eur: cost.cost_eur,
        overrides: post.overrides,
        critical_flags: post.critical_flags.length,
      },
      'agent_8_done',
    );

    return jsonResponse({
      week_id: weekId,
      visuals: post.visuals,
      overrides: post.overrides,
      critical_flags: post.critical_flags,
      duration_ms: duration,
      cost_usd: cost.cost_usd,
      cost_eur: cost.cost_eur,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_8_failed');
    return errorResponse(msg, 500);
  }
});

function extractUsage(u: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}) {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
  };
}
