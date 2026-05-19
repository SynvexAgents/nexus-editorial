// scrape-post-performance
// Endpoint POST. Appelé par le cron n8n "Nexus Measurement Loop" à J+7 et J+14
// pour chaque post publié. Appelle un actor Apify (générique via env
// APIFY_ACTOR_ID_POST_STATS) avec linkedin_url, parse likes/comments/reposts,
// INSERT dans post_performance, met à jour scrape_dX_done + next_scrape_at.
//
// Body : { post_id: string (uuid), days_since_publish: 7 | 14 }
// Sortie : { success: true, perf_id, metrics: {...}, next_scrape_at }
//          ou { skipped: true, reason: "archived" | "already_scraped" }

import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { getEnv, requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';
import { getSupabase } from '../_shared/supabase.ts';

interface ScrapeBody {
  post_id?: unknown;
  days_since_publish?: unknown;
}

interface ApifyMetrics {
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  impressions: number | null;
  raw: unknown;
}

function pickNumber(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Appelle l'actor Apify configuré via APIFY_ACTOR_ID_POST_STATS. Le contrat
 * exact dépend de l'actor — on tolère plusieurs schémas de réponse en lisant
 * les champs probables (likes/likesCount/numLikes, etc.).
 *
 * Documentation actor à fournir par Marouane (free-form): l'actor doit
 * accepter en input { "post_url": "<linkedin url>" } ou { "url": "..." } et
 * retourner un item avec au minimum { likes, comments, reposts }.
 */
async function callApifyActor(
  linkedinUrl: string,
  log: ReturnType<typeof logger.child>,
): Promise<ApifyMetrics> {
  const actorId = requireEnv('APIFY_ACTOR_ID_POST_STATS');
  const token = requireEnv('APIFY_TOKEN');
  // Apify actor run synchronous + get dataset items in one call.
  // Endpoint: POST https://api.apify.com/v2/acts/<actor-id>/run-sync-get-dataset-items?token=...
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const inputBody = { post_url: linkedinUrl, url: linkedinUrl, postUrl: linkedinUrl };

  let attempt = 0;
  let lastErr = '';
  while (attempt < 2) {
    attempt += 1;
    try {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 90_000);
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputBody),
        signal: ac.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        const text = await resp.text();
        lastErr = `apify_http_${resp.status}: ${text.slice(0, 200)}`;
        log.warn({ attempt, status: resp.status }, 'apify_actor_http_error');
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }
        throw new Error(lastErr);
      }
      const items = (await resp.json()) as unknown[];
      if (!Array.isArray(items) || items.length === 0) {
        lastErr = 'apify_empty_dataset';
        log.warn({ attempt }, 'apify_actor_empty');
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }
        throw new Error(lastErr);
      }
      const item = items[0];
      const metrics: ApifyMetrics = {
        likes: pickNumber(item, ['likes', 'likesCount', 'numLikes', 'reactions', 'reactionsCount']),
        comments: pickNumber(item, ['comments', 'commentsCount', 'numComments']),
        reposts: pickNumber(item, [
          'reposts',
          'repostsCount',
          'shares',
          'sharesCount',
          'numReposts',
        ]),
        impressions: pickNumber(item, ['impressions', 'views', 'viewsCount', 'numImpressions']),
        raw: item,
      };
      return metrics;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = msg;
      log.warn({ attempt, err: msg }, 'apify_actor_call_failed');
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`apify_failed_after_2_attempts: ${lastErr}`);
}

async function notifyFailure(postId: string, linkedinUrl: string, errMsg: string): Promise<void> {
  const apiKey = getEnv('RESEND_API_KEY');
  const to = getEnv('NOTIFY_EMAIL_TO');
  const from = getEnv('NOTIFY_EMAIL_FROM', 'onboarding@resend.dev');
  if (!apiKey || !to) return; // best-effort
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to,
        subject: `Nexus Measurement — scrape échoué pour post ${postId.slice(0, 8)}`,
        text: `Le scrape Apify a échoué 2 fois pour le post :\n\npost_id : ${postId}\nURL : ${linkedinUrl}\n\nErreur : ${errMsg}\n\nLe workflow principal n'est PAS bloqué — c'est un échec best-effort. À investiguer manuellement.\n\n— Nexus Editorial (Measurement Loop)`,
      }),
    });
  } catch {
    // Swallow — notification est best-effort.
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'scrape-post-performance' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as ScrapeBody;
    const postId = typeof body.post_id === 'string' ? body.post_id : '';
    const days = body.days_since_publish;
    if (!postId) return errorResponse('invalid_post_id', 400);
    if (days !== 7 && days !== 14) return errorResponse('invalid_days_since_publish', 400);

    const sb = getSupabase();
    const { data: row, error: selErr } = await sb
      .from('published_posts')
      .select('post_id, linkedin_url, published_at, archived, scrape_d7_done, scrape_d14_done')
      .eq('post_id', postId)
      .maybeSingle();
    if (selErr) return errorResponse(`select_failed: ${selErr.message}`, 500);
    if (!row) return errorResponse(`post_not_found: ${postId}`, 404);

    const r = row as {
      post_id: string;
      linkedin_url: string;
      published_at: string;
      archived: boolean;
      scrape_d7_done: boolean;
      scrape_d14_done: boolean;
    };

    if (r.archived) {
      return jsonResponse({ skipped: true, reason: 'archived', post_id: postId });
    }
    if (days === 7 && r.scrape_d7_done) {
      return jsonResponse({ skipped: true, reason: 'already_scraped_d7', post_id: postId });
    }
    if (days === 14 && r.scrape_d14_done) {
      return jsonResponse({ skipped: true, reason: 'already_scraped_d14', post_id: postId });
    }

    // Appel Apify (retry interne 1x).
    let metrics: ApifyMetrics;
    try {
      metrics = await callApifyActor(r.linkedin_url, log);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg, post_id: postId }, 'apify_failed_final');
      await notifyFailure(postId, r.linkedin_url, msg);
      return errorResponse(`scrape_failed: ${msg}`, 502);
    }

    // INSERT post_performance
    const { data: inserted, error: insErr } = await sb
      .from('post_performance')
      .insert({
        post_id: postId,
        days_since_publish: days,
        likes: metrics.likes,
        comments: metrics.comments,
        reposts: metrics.reposts,
        impressions: metrics.impressions,
        raw_apify_response: metrics.raw,
      })
      .select('perf_id, measured_at')
      .single();
    if (insErr) return errorResponse(`insert_perf_failed: ${insErr.message}`, 500);
    const perf = inserted as { perf_id: string; measured_at: string };

    // Update published_posts : scrape_dX_done + next_scrape_at
    const publishedAt = new Date(r.published_at);
    let nextScrape: string | null = null;
    const update: Record<string, unknown> = {};
    if (days === 7) {
      update.scrape_d7_done = true;
      nextScrape = new Date(publishedAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
      update.next_scrape_at = nextScrape;
    } else {
      update.scrape_d14_done = true;
      update.next_scrape_at = null; // boucle terminée pour ce post
    }
    const { error: upErr } = await sb.from('published_posts').update(update).eq('post_id', postId);
    if (upErr) log.warn({ err: upErr.message }, 'published_posts_update_non_fatal');

    const duration = Date.now() - t0;
    log.info(
      {
        post_id: postId,
        days,
        likes: metrics.likes,
        comments: metrics.comments,
        reposts: metrics.reposts,
        impressions: metrics.impressions,
        duration_ms: duration,
      },
      'scrape_done',
    );

    return jsonResponse({
      success: true,
      perf_id: perf.perf_id,
      measured_at: perf.measured_at,
      metrics: {
        likes: metrics.likes,
        comments: metrics.comments,
        reposts: metrics.reposts,
        impressions: metrics.impressions,
      },
      next_scrape_at: nextScrape,
      duration_ms: duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'scrape_post_failed');
    return errorResponse(msg, 500);
  }
});
