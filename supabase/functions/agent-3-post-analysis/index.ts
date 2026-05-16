// agent-3-post-analysis
// Endpoint POST. Analyse en batch les clean_posts non encore analysés.
// 1 call Haiku 4.5 par post. UPSERT post_analysis.
//
// Body : { limit?: number (default 100), force?: boolean }

import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { logger } from '../_shared/logger.ts';
import { loadContextBrief, loadVoiceTone } from '../_shared/system_prompts.ts';
import { callAnthropic, extractTextFromResponse } from '../_shared/anthropic.ts';
import { computeAnthropicCost, HAIKU_4_5 } from '../_shared/pricing.ts';
import { extractJsonFromPrefilledResponse } from '../_shared/json_extract.ts';
import { postAnalysisSchema, type PostAnalysis } from '../_shared/schemas.ts';

interface CleanPost {
  post_id: string;
  engagement_score_normalized: number;
  is_relevant: boolean;
  topic_cluster_pre: string;
  filter_reason: string | null;
}
interface RawPost {
  post_id: string;
  profile_id: string;
  published_at: string;
  media_type: string | null;
  likes: number;
  comments: number;
  reposts: number;
  text: string | null;
}

async function buildSystemPrompt(): Promise<string> {
  const [brief, tone] = await Promise.all([loadContextBrief(), loadVoiceTone()]);
  return `Tu es Editorial Analyst pour Synvex.

Ta mission : analyser un post LinkedIn FR collecté dans la watchlist Nexus Editorial. Pour chaque post, tu produis une analyse structurée qui alimentera ensuite les Agents 4 (LinkedinTrends), 6 (Angles) et 7 (Winners). Tu ne juges pas, tu analyses. Aucune flatterie, aucune prescription, ton sec.

=== CONTEXTE SYNVEX (INVARIANT) ===

${brief}

=== TON CIBLE SYNVEX (INVARIANT — référence stylistique pour évaluer transferabilite_assurance) ===

${tone}

=== MISSION ===

Tu reçois un post LinkedIn (texte + métriques + métadonnées auteur). Tu retournes un JSON strictement conforme au schéma PostAnalysis. Aucun texte hors JSON, aucun préambule.

=== CHAMPS DU JSON ===

1. \`post_id\` : string non vide. Reprends exactement la valeur fournie.
2. \`hook_type\` : enum : stat_choc | confession | contrarian | listicle | mini_story | question_provoc | observation_metier | annonce | rant
3. \`hook_extract\` : 1-3 premières phrases du post.
4. \`format\` : enum : punchline | mini_essai | listicle | storytelling | analyse | retour_experience | data_post
5. \`structure_narrative\` : courte description structure.
6. \`longueur_caracteres\` : int ≥ 1.
7. \`longueur_paragraphes\` : int ≥ 1.
8. \`ton\` : enum : lucide | provocateur | pédagogue | confessionnel | analytique | sec | inspirant
9. \`topic_cluster\` : cluster métier large.
10. \`topic_specific\` : sujet précis.
11. \`cta_type\` : enum : aucun | commentaire | DM | lien | question_ouverte
12. \`mecaniques_attention\` : 1-3 strings spécifiques.
13. \`transferabilite_assurance\` : int 0-10 (capacité de transposition vers écosystème assurance FR Synvex).
14. \`raison_performance_hypothese\` : 1-2 phrases sec/factuel.

=== RÈGLES ===

A. Aucune mention Synvex / Orion / Helios / Chiron / Hermès / Argus / Atlas / Cortex.
B. transferabilite_assurance n'est PAS qualité globale du post — capacité de transposition uniquement.
C. hook_type : type DOMINANT, pas fallback observation_metier.
D. ton : DOMINANT du post complet.
E. mecaniques_attention : spécifiques ("Chiffre concret en intro" > "chiffre").
F. raison_performance_hypothese : sec, factuel, mécanique. Pas marketing.`;
}

function buildUserPrompt(clean: CleanPost, raw: RawPost): string {
  const meta = [
    `post_id           : ${clean.post_id}`,
    `profile_id        : ${raw.profile_id ?? '(unknown)'}`,
    `published_at      : ${raw.published_at}`,
    `media_type        : ${raw.media_type ?? '(unknown)'}`,
    `likes/comments/reposts : ${raw.likes}/${raw.comments}/${raw.reposts}`,
    `engagement_score_normalized : ${clean.engagement_score_normalized.toFixed(3)}`,
    `topic_cluster_pre : ${clean.topic_cluster_pre}`,
  ].join('\n');
  return `Analyse le post LinkedIn ci-dessous et retourne UN OBJET JSON conforme au schéma PostAnalysis. Aucun texte hors JSON.

=== MÉTADONNÉES ===
${meta}

=== TEXTE ===
${raw.text ?? '(texte vide)'}

=== INSTRUCTIONS ===
- post_id : reprends EXACTEMENT "${clean.post_id}".
- transferabilite_assurance : ENTIER 0-10 inclus.
- longueur_caracteres et longueur_paragraphes : ENTIERS ≥ 1.
- mecaniques_attention : 1 à 3 entrées spécifiques.

Réponds par UN JSON unique commençant par { et finissant par }.`;
}

async function analyzePost(
  clean: CleanPost,
  raw: RawPost,
  systemPrompt: string,
  log: ReturnType<typeof logger.child>,
): Promise<{
  analysis: PostAnalysis;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  retried: boolean;
}> {
  const userPrompt = buildUserPrompt(clean, raw);
  const messages = [
    { role: 'user' as const, content: userPrompt },
    { role: 'assistant' as const, content: '{' },
  ];
  const systemBlocks = [
    { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
  ];

  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const resp = await callAnthropic({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      temperature: 0.3,
      system: systemBlocks,
      messages,
    });
    const text = extractTextFromResponse(resp);

    let parsed: unknown;
    try {
      parsed = extractJsonFromPrefilledResponse(text);
    } catch (e) {
      lastError = `parse_failed_attempt_${attempt}: ${(e as Error).message}`;
      log.warn({ post_id: clean.post_id, attempt }, 'analyze_parse_failed');
      if (attempt < 2) {
        messages.pop();
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content:
            "Ta réponse précédente n'a pas pu être parsée. Renvoie UN JSON unique commençant par { et finissant par }, sans markdown.",
        });
        messages.push({ role: 'assistant', content: '{' });
      }
      continue;
    }

    const zod = postAnalysisSchema.safeParse(parsed);
    if (!zod.success) {
      const issue = zod.error.issues[0];
      lastError = `zod_failed_attempt_${attempt}: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown'}`;
      log.warn({ post_id: clean.post_id, attempt, issue: lastError }, 'analyze_zod_failed');
      if (attempt < 2) {
        messages.pop();
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: `JSON Zod failed: ${lastError}. Renvoie corrigé. Tous champs string non vides, transferabilite_assurance entier 0-10, longueurs entiers ≥ 1, enums exacts.`,
        });
        messages.push({ role: 'assistant', content: '{' });
      }
      continue;
    }

    let final = zod.data;
    if (final.post_id !== clean.post_id) final = { ...final, post_id: clean.post_id };

    return {
      analysis: final,
      usage: {
        input_tokens: resp.usage.input_tokens,
        output_tokens: resp.usage.output_tokens,
        cache_creation_input_tokens: resp.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: resp.usage.cache_read_input_tokens ?? 0,
      },
      retried: attempt > 1,
    };
  }

  throw new Error(`analyze_post_failed_after_2_attempts: ${lastError} (post_id=${clean.post_id})`);
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'agent-3-post-analysis' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number; force?: boolean };
    const limit = body.limit ?? 100;
    const force = body.force ?? false;
    const sb = getSupabase();

    // Identifie les posts à analyser.
    let targetIds: string[];
    if (force) {
      const { data } = await sb
        .from('clean_posts')
        .select('post_id, engagement_score_normalized')
        .eq('is_relevant', true)
        .order('engagement_score_normalized', { ascending: false })
        .limit(limit);
      targetIds = ((data ?? []) as Array<{ post_id: string }>).map((r) => r.post_id);
    } else {
      const { data: done } = await sb.from('post_analysis').select('post_id');
      const doneSet = new Set(((done ?? []) as Array<{ post_id: string }>).map((r) => r.post_id));
      const { data: cleanAll } = await sb
        .from('clean_posts')
        .select('post_id, engagement_score_normalized')
        .eq('is_relevant', true)
        .order('engagement_score_normalized', { ascending: false })
        .limit(limit + doneSet.size);
      targetIds = ((cleanAll ?? []) as Array<{ post_id: string }>)
        .map((r) => r.post_id)
        .filter((id) => !doneSet.has(id))
        .slice(0, limit);
    }

    if (targetIds.length === 0) {
      return jsonResponse({ analyzed: 0, errors: [], cost_eur: 0, duration_ms: Date.now() - t0 });
    }

    const { data: cleanRows } = await sb.from('clean_posts').select('*').in('post_id', targetIds);
    const { data: rawRows } = await sb.from('raw_posts').select('*').in('post_id', targetIds);
    const cleanByPost = new Map(((cleanRows ?? []) as CleanPost[]).map((c) => [c.post_id, c]));
    const rawByPost = new Map(((rawRows ?? []) as RawPost[]).map((r) => [r.post_id, r]));

    const systemPrompt = await buildSystemPrompt();
    const errors: Array<{ post_id: string; error: string }> = [];
    let totalCostUsd = 0;
    let analyzed = 0;
    let retried = 0;

    for (const postId of targetIds) {
      const clean = cleanByPost.get(postId);
      const raw = rawByPost.get(postId);
      if (!clean || !raw) {
        errors.push({ post_id: postId, error: 'clean_or_raw_missing' });
        continue;
      }
      try {
        const result = await analyzePost(clean, raw, systemPrompt, log);
        const cost = computeAnthropicCost(result.usage, HAIKU_4_5);
        totalCostUsd += cost.cost_usd;
        if (result.retried) retried += 1;
        const { error: upErr } = await sb.from('post_analysis').upsert(
          {
            post_id: result.analysis.post_id,
            analysis_json: result.analysis as unknown,
            transferabilite_assurance: result.analysis.transferabilite_assurance,
          },
          { onConflict: 'post_id' },
        );
        if (upErr) {
          errors.push({ post_id: postId, error: `upsert_failed: ${upErr.message}` });
          continue;
        }
        analyzed += 1;
      } catch (e) {
        errors.push({ post_id: postId, error: (e as Error).message });
      }
    }

    const duration = Date.now() - t0;
    const cost_eur = totalCostUsd * 0.92;
    log.info(
      { analyzed, errors: errors.length, retried, cost_eur, duration_ms: duration },
      'agent_3_done',
    );
    return jsonResponse({
      analyzed,
      errors,
      cost_usd: totalCostUsd,
      cost_eur,
      retried,
      duration_ms: duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_3_failed');
    return errorResponse(msg, 500);
  }
});
