// agent-4-linkedin-trends
// Endpoint POST. Synthétise une semaine de PostAnalyses en LinkedinTrends
// via Haiku 4.5 + post-processor déterministe (tri + diversités).
// UPSERT weekly_reports.linkedin_trends_json.
//
// Body : { week_id: string, force?: boolean, min_posts?: number }

import { callAnthropic, extractTextFromResponse } from '../_shared/anthropic.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { extractJsonFromPrefilledResponse } from '../_shared/json_extract.ts';
import { logger } from '../_shared/logger.ts';
import { HAIKU_4_5, computeAnthropicCost } from '../_shared/pricing.ts';
import {
  type LinkedinTrends,
  type PostAnalysis,
  linkedinTrendsSchema,
} from '../_shared/schemas.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { loadContextBrief, loadVoiceTone } from '../_shared/system_prompts.ts';
import { currentIsoWeek } from '../_shared/week.ts';

interface PostAnalysisEnriched {
  analysis: PostAnalysis;
  engagement_score_normalized: number;
  text_excerpt: string;
  media_type: string;
  likes: number;
  comments: number;
  reposts: number;
}
interface TemporalRow {
  week_id: string;
  day_of_week: string;
  hour_bucket: string;
  posts_count: number;
  avg_engagement_norm: number;
  top_format: string | null;
  format_distribution: unknown;
}
interface TrendsInput {
  week_id: string;
  post_analyses: PostAnalysisEnriched[];
  temporal_rows: TemporalRow[];
}

const DATA_QUALITY_PATTERNS: RegExp[] = [
  /data[\s_-]*quality(?:[\s_-]*warning)?/i,
  /diversit[ée][\s_-]*[ée]ditoriale/i,
  /valeurs?[\s_-]*distinctes?/i,
];
const ALREADY_FLAGGED_PATTERNS: RegExp[] = [
  /diversit[ée][\s_-]*[ée]ditoriale[\s_-]*limit[ée]e/i,
  /data[\s_-]*quality[\s_-]*warning/i,
];

function splitSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  return t.split(/(?<=[.!?])\s+/);
}
function stripDataQuality(text: string): string {
  const kept = splitSentences(text).filter((s) => !DATA_QUALITY_PATTERNS.some((re) => re.test(s)));
  const joined = kept.join(' ').trim();
  return joined.length < 20 ? text.trim() : joined;
}
function hasFlagged(text: string): boolean {
  return ALREADY_FLAGGED_PATTERNS.some((re) => re.test(text));
}

function postProcessTrends(
  trends: LinkedinTrends,
  inputs: TrendsInput,
): { trends: LinkedinTrends; stats: Record<string, unknown> } {
  const sortDesc = <T extends { avg_engagement_norm: number }>(a: T[]): T[] =>
    [...a].sort((x, y) => y.avg_engagement_norm - x.avg_engagement_norm);

  const top_hooks = sortDesc(trends.top_hooks);
  const top_formats = sortDesc(trends.top_formats);
  const top_topic_clusters = sortDesc(trends.top_topic_clusters);

  const hook_d = new Set(inputs.post_analyses.map((p) => p.analysis.hook_type)).size;
  const fmt_d = new Set(inputs.post_analyses.map((p) => p.analysis.format)).size;
  const ton_d = new Set(inputs.post_analyses.map((p) => p.analysis.ton)).size;
  const all_ok = hook_d >= 3 && fmt_d >= 3 && ton_d >= 3;

  let synthese_textuelle = trends.synthese_textuelle;
  let stripped = 0;
  let noteInserted = false;
  if (all_ok) {
    const before = splitSentences(synthese_textuelle).length;
    synthese_textuelle = stripDataQuality(synthese_textuelle);
    stripped = Math.max(0, before - splitSentences(synthese_textuelle).length);
  } else if (!hasFlagged(synthese_textuelle)) {
    synthese_textuelle =
      `Diversité éditoriale limitée cette semaine (hook_type: ${hook_d}, format: ${fmt_d}, ton: ${ton_d} valeurs distinctes). ${synthese_textuelle}`.trim();
    noteInserted = true;
  }

  return {
    trends: { ...trends, top_hooks, top_formats, top_topic_clusters, synthese_textuelle },
    stats: {
      hook_diversity: hook_d,
      format_diversity: fmt_d,
      ton_diversity: ton_d,
      all_ok,
      stripped,
      note_inserted: noteInserted,
    },
  };
}

async function buildSystemPrompt(): Promise<string> {
  const [brief, tone] = await Promise.all([loadContextBrief(), loadVoiceTone()]);
  return `=== RÔLE ===

Tu es l'Editorial Trends Synthesizer du système Nexus Editorial de Synvex. Tu analyses une semaine de posts LinkedIn FR pour en extraire les tendances éditoriales utiles à la production de contenu Synvex sur l'assurance.

Ton mode : sec, lucide, analytique. Aucune flatterie, aucune prescription.

=== CONTEXTE SYNVEX (INVARIANT) ===

${brief}

=== TON CIBLE (INVARIANT — pour la synthese_textuelle) ===

${tone}

=== MISSION ===

Inputs : week_id, post_analyses (10-50 entrées avec analysis + engagement + text_excerpt + métriques), temporal_rows (jour × heure × format).

Produis un JSON conforme au schéma LinkedinTrends répondant à : "Quelles formes éditoriales performent sur LinkedIn FR cette semaine, et lesquelles sont transférables au discours Synvex assurance ?"

Aucun texte hors JSON. Aucun préambule. Aucune balise markdown.

=== CHAMPS DU JSON ===

1. top_hooks : 3-5 hook_types. { type, frequency, avg_engagement_norm, example_post_id }. Ordre indifférent (post-processing trie).
2. top_formats : 3-5 { format, frequency, avg_engagement_norm }. Ordre indifférent.
3. top_topic_clusters : 5 max { cluster, frequency, avg_engagement_norm }. cluster = topic_specific.
4. rising_topics : topic_specific apparaissant ≥ 2 fois ET engagement moy > 1.0. Si vide, mention "baseline trop courte" obligatoire dans synthese_textuelle.
5. falling_topics : ≥ 2 fois ET engagement moy < 0.8. Idem règle baseline si vide.
6. tone_dominant : ton majoritaire dans TOP 10 posts.
7. longueur_optimale_p50_p90 : [médiane, p90] des longueur_caracteres des posts > 1.0 engagement (sinon sur ensemble).
8. mecaniques_emergentes : mécaniques récurrentes top 10 (≥ 3 occurrences), REFORMULÉES en catégorie générique.
9. best_days_observed : { day, avg_engagement_norm } dérivé temporal_rows.
10. best_hours_observed : { hour_bucket, avg_engagement_norm } dérivé temporal_rows.
11. format_performance : { format, avg_engagement_norm } group by format.
12. ten_best_posts : EXACTEMENT 10 { post_id, score, summary }. summary = UNE phrase pourquoi instructif pour Synvex.
13. synthese_textuelle : 5-10 lignes FR, ton Synvex (sec, lucide, vouvoiement).

=== DATA QUALITY ===

N'ajoute AUCUNE note méta-mesure (diversité, data quality) dans synthese_textuelle. Concentre-toi sur le signal éditorial. La méta-mesure est calculée par post-processing déterministe.

=== CONTRAINTES STRICTES ===

A. Aucune mention Synvex / Orion / Helios / Chiron / Hermès / Argus / Atlas / Cortex.
B. Aucun jugement moral, flatterie, prescription.
C. Pas de chiffre orphelin : statistiques depuis inputs uniquement.
D. JSON pur, pas de markdown.
E. synthese_textuelle : aucun lexique banni (synergie, disruption, révolution, transformation digitale, game-changer, boost, à l'ère de l'IA, etc.) ni hook banni.`;
}

function buildUserPrompt(input: TrendsInput): string {
  return `Voici les données de la semaine ${input.week_id}.

Synthétise les tendances éditoriales selon le schéma LinkedinTrends.

Réponds par UN SEUL objet JSON commençant par { et finissant par }.

=== INPUT JSON ===
${JSON.stringify(input, null, 2)}`;
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'agent-4-linkedin-trends' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      week_id?: string;
      force?: boolean;
      min_posts?: number;
    };
    const weekId = body.week_id ?? currentIsoWeek();
    const minPosts = body.min_posts ?? 10;
    const sb = getSupabase();

    if (!body.force) {
      const { data: existing } = await sb
        .from('weekly_reports')
        .select('linkedin_trends_json')
        .eq('week_id', weekId)
        .maybeSingle();
      if (existing && (existing as { linkedin_trends_json: unknown }).linkedin_trends_json) {
        return jsonResponse({ skipped: true, reason: 'already_synthesized', week_id: weekId });
      }
    }

    // Charge post_analyses + clean_posts + raw_posts pour enrichir.
    const { data: pa } = await sb
      .from('post_analysis')
      .select('post_id, analysis_json')
      .returns<Array<{ post_id: string; analysis_json: PostAnalysis }>>();
    if (!pa || pa.length < minPosts) {
      return errorResponse('insufficient_volume', 400, {
        received: pa?.length ?? 0,
        required: minPosts,
      });
    }

    const postIds = pa.map((p) => p.post_id);
    const { data: cleanRows } = await sb
      .from('clean_posts')
      .select('post_id, engagement_score_normalized')
      .in('post_id', postIds);
    const { data: rawRows } = await sb
      .from('raw_posts')
      .select('post_id, text, media_type, likes, comments, reposts')
      .in('post_id', postIds);
    const cleanByPost = new Map(
      ((cleanRows ?? []) as Array<{ post_id: string; engagement_score_normalized: number }>).map(
        (r) => [r.post_id, r],
      ),
    );
    const rawByPost = new Map(
      (
        (rawRows ?? []) as Array<{
          post_id: string;
          text: string | null;
          media_type: string | null;
          likes: number;
          comments: number;
          reposts: number;
        }>
      ).map((r) => [r.post_id, r]),
    );

    const post_analyses: PostAnalysisEnriched[] = pa
      .map((p) => {
        const c = cleanByPost.get(p.post_id);
        const r = rawByPost.get(p.post_id);
        if (!c || !r) return null;
        return {
          analysis: p.analysis_json,
          engagement_score_normalized: c.engagement_score_normalized,
          text_excerpt: (r.text ?? '').slice(0, 400),
          media_type: r.media_type ?? 'texte',
          likes: r.likes,
          comments: r.comments,
          reposts: r.reposts,
        } satisfies PostAnalysisEnriched;
      })
      .filter((x): x is PostAnalysisEnriched => x !== null);

    const { data: temporal } = await sb
      .from('temporal_analysis')
      .select(
        'week_id, day_of_week, hour_bucket, posts_count, avg_engagement_norm, top_format, format_distribution',
      )
      .eq('week_id', weekId);
    const temporal_rows = (temporal ?? []) as TemporalRow[];

    const input: TrendsInput = { week_id: weekId, post_analyses, temporal_rows };
    const systemPrompt = await buildSystemPrompt();

    const messages = [
      { role: 'user' as const, content: buildUserPrompt(input) },
      { role: 'assistant' as const, content: '{' },
    ];
    const systemBlocks = [
      { type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } },
    ];

    let lastError: string | null = null;
    let final: { trends: LinkedinTrends; usage: Record<string, number>; retried: boolean } | null =
      null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const resp = await callAnthropic({
        model: 'claude-haiku-4-5',
        max_tokens: 8192,
        temperature: 0.4,
        system: systemBlocks,
        messages,
      });
      const text = extractTextFromResponse(resp);
      let parsed: unknown;
      try {
        parsed = extractJsonFromPrefilledResponse(text);
      } catch (e) {
        lastError = `parse_failed_${attempt}: ${(e as Error).message}`;
        log.warn({ attempt }, 'agent4_parse_failed');
        if (attempt < 2) {
          messages.pop();
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: "Ta réponse n'a pas pu être parsée. Renvoie UN JSON unique.",
          });
          messages.push({ role: 'assistant', content: '{' });
        }
        continue;
      }
      const zod = linkedinTrendsSchema.safeParse(parsed);
      if (!zod.success) {
        const issue = zod.error.issues[0];
        lastError = `zod_failed_${attempt}: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown'}`;
        log.warn({ attempt, issue: lastError }, 'agent4_zod_failed');
        if (attempt < 2) {
          messages.pop();
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Zod failed: ${lastError}. Renvoie corrigé strictement conforme.`,
          });
          messages.push({ role: 'assistant', content: '{' });
        }
        continue;
      }
      final = {
        trends: zod.data as LinkedinTrends,
        usage: {
          input_tokens: resp.usage.input_tokens,
          output_tokens: resp.usage.output_tokens,
          cache_creation_input_tokens: resp.usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: resp.usage.cache_read_input_tokens ?? 0,
        },
        retried: attempt > 1,
      };
      break;
    }

    if (!final) return errorResponse(`agent_4_failed_after_2_attempts: ${lastError}`, 500);

    const pp = postProcessTrends(final.trends, input);
    const cost = computeAnthropicCost(
      {
        input_tokens: final.usage.input_tokens,
        output_tokens: final.usage.output_tokens,
        cache_creation_input_tokens: final.usage.cache_creation_input_tokens,
        cache_read_input_tokens: final.usage.cache_read_input_tokens,
      },
      HAIKU_4_5,
    );

    const { error: upErr } = await sb.from('weekly_reports').upsert(
      {
        week_id: weekId,
        linkedin_trends_json: pp.trends as unknown,
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
        retried: final.retried,
        ...pp.stats,
      },
      'agent_4_done',
    );
    return jsonResponse({
      week_id: weekId,
      items_processed: post_analyses.length,
      retried: final.retried,
      duration_ms: duration,
      cost_usd: cost.cost_usd,
      cost_eur: cost.cost_eur,
      post_process_stats: pp.stats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_4_failed');
    return errorResponse(msg, 500);
  }
});
