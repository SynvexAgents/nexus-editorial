// mark-post-published
// Endpoint POST. Marouane colle l'URL LinkedIn d'un post fraîchement publié.
// On lit weekly_reports.winners_json pour récupérer la metadata du winner
// (archetype, icp, length_target, score, lead_trigger_present), on insère
// dans published_posts avec next_scrape_at = published_at + 7 jours, et on
// met à jour weekly_reports.post_states[<position>] = "published".
//
// Body : { week_id: string, position: 1|2|3, linkedin_url: string,
//          published_at?: ISO string }
// Sortie : { success: true, post_id, next_scrape_at, post_states }
//          ou { success: false, reason: "already_published", post_id }

import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import type { WeeklyWinner, WeeklyWinners } from '../_shared/schemas.ts';
import { getSupabase } from '../_shared/supabase.ts';

const LINKEDIN_URL_REGEX = /^https:\/\/(?:www\.)?linkedin\.com\/(?:posts|feed\/update)\//;

interface MarkBody {
  week_id?: unknown;
  position?: unknown;
  linkedin_url?: unknown;
  published_at?: unknown;
}

function validateBody(body: MarkBody): { error: string } | {
  week_id: string;
  position: 1 | 2 | 3;
  linkedin_url: string;
  published_at: string;
} {
  if (typeof body.week_id !== 'string' || !/^\d{4}-W\d{2}$/.test(body.week_id)) {
    return { error: 'invalid_week_id (format YYYY-Www attendu)' };
  }
  if (
    typeof body.position !== 'number' ||
    !Number.isInteger(body.position) ||
    body.position < 1 ||
    body.position > 3
  ) {
    return { error: 'invalid_position (1, 2 ou 3 attendu)' };
  }
  if (typeof body.linkedin_url !== 'string' || !LINKEDIN_URL_REGEX.test(body.linkedin_url)) {
    return { error: 'invalid_linkedin_url (format attendu : https://www.linkedin.com/posts/...)' };
  }
  const publishedAt =
    typeof body.published_at === 'string' && body.published_at.length > 0
      ? body.published_at
      : new Date().toISOString();
  if (Number.isNaN(new Date(publishedAt).getTime())) {
    return { error: 'invalid_published_at (ISO 8601 attendu)' };
  }
  return {
    week_id: body.week_id,
    position: body.position as 1 | 2 | 3,
    linkedin_url: body.linkedin_url,
    published_at: publishedAt,
  };
}

function findWinnerAt(winners: WeeklyWinners, position: 1 | 2 | 3): WeeklyWinner | undefined {
  return winners.find((w) => w.post_position === position);
}

function hasLeadTrigger(winner: WeeklyWinner): boolean {
  // Le sous-score lead_trigger_presence (v2.1, mai 2026) est ajouté par Agent 7
  // dans chaque entrée scoring. Le winner peut avoir 1 ou 2 entrées (cas fusion).
  // On considère lead_trigger_present = true si AU MOINS une entrée a un
  // lead_trigger_presence ≥ 6.
  for (const s of winner.scoring) {
    const sub = s.sous_scores ?? {};
    const lt = (sub as Record<string, number>).lead_trigger_presence;
    if (typeof lt === 'number' && lt >= 6) return true;
  }
  return false;
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'mark-post-published' });

  try {
    const body = (await req.json().catch(() => ({}))) as MarkBody;
    const validated = validateBody(body);
    if ('error' in validated) return errorResponse(validated.error, 400);
    const { week_id, position, linkedin_url, published_at } = validated;

    const sb = getSupabase();

    // 1. Idempotence : URL déjà enregistrée ?
    const { data: existing } = await sb
      .from('published_posts')
      .select('post_id, next_scrape_at, published_at')
      .eq('linkedin_url', linkedin_url)
      .maybeSingle();
    if (existing) {
      const row = existing as { post_id: string; next_scrape_at: string | null };
      log.info({ post_id: row.post_id, week_id, position }, 'already_published');
      return jsonResponse({
        success: false,
        reason: 'already_published',
        post_id: row.post_id,
        next_scrape_at: row.next_scrape_at,
      });
    }

    // 2. Lire winners_json pour récupérer metadata + angles_json pour icp/longueur
    const { data: reportRow, error: reportErr } = await sb
      .from('weekly_reports')
      .select('winners_json, angles_json, post_states')
      .eq('week_id', week_id)
      .maybeSingle();
    if (reportErr) return errorResponse(`weekly_reports_select_failed: ${reportErr.message}`, 500);
    if (!reportRow) return errorResponse(`week_not_found: ${week_id}`, 404);

    const r = reportRow as {
      winners_json: WeeklyWinners | null;
      angles_json: Array<{
        angle_id: string;
        archetype?: string;
        icp_vise?: string;
        longueur_cible?: string;
      }> | null;
      post_states: Record<string, string> | null;
    };
    if (!r.winners_json) return errorResponse(`winners_json_missing: ${week_id}`, 400);

    const winner = findWinnerAt(r.winners_json, position);
    if (!winner)
      return errorResponse(`winner_at_position_missing: position ${position}`, 400);

    // 3. Pour archetype/icp/length_target, on remonte à l'angle source.
    // Pour une fusion, on prend le 1er angle de la paire.
    const angleId =
      winner.fusion_used === false
        ? winner.winner_id
        : (winner.fusion_used as [string, string])[0];
    const sourceAngle = (r.angles_json ?? []).find((a) => a.angle_id === angleId);
    const archetype = sourceAngle?.archetype ?? 'inconnu';
    const icp = sourceAngle?.icp_vise ?? null;
    const lengthTarget = sourceAngle?.longueur_cible ?? null;

    // score_generation : moyenne pondérée score_total des entrées scoring.
    const scores = winner.scoring
      .map((s) => Number(s.score_total))
      .filter((n) => Number.isFinite(n));
    const scoreAvg =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const leadTrigger = hasLeadTrigger(winner);

    // 4. INSERT published_posts
    const publishedDate = new Date(published_at);
    const nextScrape = new Date(publishedDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { data: inserted, error: insErr } = await sb
      .from('published_posts')
      .insert({
        week_id,
        position,
        archetype,
        icp,
        length_target: lengthTarget,
        score_generation: scoreAvg,
        lead_trigger_present: leadTrigger,
        linkedin_url,
        published_at,
        next_scrape_at: nextScrape.toISOString(),
      })
      .select('post_id, next_scrape_at')
      .single();
    if (insErr) return errorResponse(`insert_failed: ${insErr.message}`, 500);
    const row = inserted as { post_id: string; next_scrape_at: string };

    // 5. UPDATE weekly_reports.post_states[<position>] = "published"
    const newStates = { ...(r.post_states ?? {}), [String(position)]: 'published' };
    const { error: upErr } = await sb
      .from('weekly_reports')
      .update({ post_states: newStates })
      .eq('week_id', week_id);
    if (upErr) log.warn({ err: upErr.message }, 'post_states_update_failed_non_fatal');

    log.info(
      {
        post_id: row.post_id,
        week_id,
        position,
        archetype,
        icp,
        lead_trigger: leadTrigger,
      },
      'post_marked_published',
    );

    return jsonResponse({
      success: true,
      post_id: row.post_id,
      next_scrape_at: row.next_scrape_at,
      post_states: newStates,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'mark_post_failed');
    return errorResponse(msg, 500);
  }
});
