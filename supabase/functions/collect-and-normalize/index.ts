// collect-and-normalize
// Branche A adaptée en Edge Function. Lit profiles_watchlist actifs,
// appelle Apify avec rotation (primary harvestapi/linkedin-profile-posts,
// fallback 1 harvestapi/linkedin-post-search, fallback 2 apimaestro),
// UPSERT raw_posts + DLQ, normalize → UPSERT clean_posts +
// temporal_analysis.
//
// Body : { max_posts_per_run?: number (default 500) }
//
// Note : la normalisation FR-only s'appuie sur franc-min côté Node. En
// Edge Deno, on porte une heuristique simplifiée (regex caractères FR +
// stopwords). Tolérance acceptable car les profils watchlist v0.3 ont
// déjà été filtrés FR à l'amont.

import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';
import { getSupabase } from '../_shared/supabase.ts';

interface ProfileRow {
  profile_id: string;
  is_active: boolean;
}
interface ApifyPost {
  id?: string;
  postId?: string;
  url?: string;
  postUrl?: string;
  text?: string;
  postedAt?: string;
  publishedAt?: string;
  likesCount?: number;
  numLikes?: number;
  commentsCount?: number;
  numComments?: number;
  repostsCount?: number;
  numReposts?: number;
  shareCount?: number;
  mediaType?: string;
  type?: string;
  authorUrn?: string;
  authorHandle?: string;
  author?: { url?: string; handle?: string; publicId?: string };
}

interface NormalizedRaw {
  post_id: string;
  profile_id: string;
  published_at: string;
  day_of_week: string;
  hour_of_day: number;
  text: string;
  media_type: string;
  likes: number;
  comments: number;
  reposts: number;
  views_estimees: number | null;
  url: string;
  comment_sample: string | null;
  source_actor: string;
}

// Heuristique langue FR — simplifiée pour Deno (sans franc-min).
function isLikelyFrench(text: string): boolean {
  if (!text || text.length < 30) return false;
  const fr = /[éèêëàâäôöùûüçîïŒœ]/i.test(text);
  const frWords =
    /\b(les|des|une|pour|avec|dans|sur|nous|vous|cette|leur|sans|pas|qui|que|mais|plus|tout|toute|aussi|même|comme|son|sa|ses|ces|notre|votre)\b/i;
  return fr && frWords.test(text);
}

const HOUR_BUCKETS: Array<{ from: number; to: number; label: string }> = [
  { from: 0, to: 6, label: '00h-06h' },
  { from: 6, to: 8, label: '06h-08h' },
  { from: 8, to: 10, label: '08h-10h' },
  { from: 10, to: 12, label: '10h-12h' },
  { from: 12, to: 14, label: '12h-14h' },
  { from: 14, to: 17, label: '14h-17h' },
  { from: 17, to: 19, label: '17h-19h' },
  { from: 19, to: 21, label: '19h-21h' },
  { from: 21, to: 24, label: '21h-24h' },
];
const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function hourBucket(hour: number): string {
  return HOUR_BUCKETS.find((b) => hour >= b.from && hour < b.to)?.label ?? '21h-24h';
}

function extractProfileFromAuthor(post: ApifyPost): string | null {
  if (post.author?.publicId) return post.author.publicId;
  if (post.author?.handle) return post.author.handle;
  if (post.authorHandle) return post.authorHandle;
  if (post.author?.url) {
    const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(post.author.url);
    if (m) return m[1];
  }
  return null;
}

function isoWeek(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function normalizeApifyPost(
  p: ApifyPost,
  watchlistProfileIds: Set<string>,
  sourceActor: string,
): NormalizedRaw | null {
  const postId = p.id ?? p.postId ?? null;
  if (!postId) return null;
  const url = p.url ?? p.postUrl ?? '';
  const publishedRaw = p.postedAt ?? p.publishedAt;
  if (!publishedRaw) return null;
  const publishedDate = new Date(publishedRaw);
  if (Number.isNaN(publishedDate.getTime())) return null;
  const profileId = extractProfileFromAuthor(p);
  if (!profileId) return null;
  if (!watchlistProfileIds.has(profileId)) return null; // filtre off_watchlist

  const text = (p.text ?? '').trim();
  return {
    post_id: postId,
    profile_id: profileId,
    published_at: publishedDate.toISOString(),
    day_of_week: DAY_NAMES[publishedDate.getUTCDay()],
    hour_of_day: publishedDate.getUTCHours(),
    text,
    media_type: p.mediaType ?? p.type ?? 'texte',
    likes: p.likesCount ?? p.numLikes ?? 0,
    comments: p.commentsCount ?? p.numComments ?? 0,
    reposts: p.repostsCount ?? p.numReposts ?? p.shareCount ?? 0,
    views_estimees: null,
    url,
    comment_sample: null,
    source_actor: sourceActor,
  };
}

async function callApifyActor(
  actor: string,
  input: unknown,
  token: string,
  timeoutMs = 600_000,
): Promise<ApifyPost[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`apify_http_${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as ApifyPost[];
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'collect-and-normalize' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as { max_posts_per_run?: number };
    const maxPostsPerRun = body.max_posts_per_run ?? 500;
    const apifyToken = requireEnv('APIFY_TOKEN');
    const sb = getSupabase();

    // 1. Watchlist active.
    const { data: watch } = await sb
      .from('profiles_watchlist')
      .select('profile_id, is_active')
      .eq('is_active', true);
    const profiles = (watch ?? []) as ProfileRow[];
    if (profiles.length === 0) return errorResponse('no_active_profiles', 400);
    const watchlistIds = new Set(profiles.map((p) => p.profile_id));
    const targetUrls = profiles.map((p) =>
      p.profile_id.startsWith('http')
        ? p.profile_id
        : `https://www.linkedin.com/in/${p.profile_id}/`,
    );
    const maxPostsPerProfile = Math.max(1, Math.floor(maxPostsPerRun / profiles.length));

    // 2. Apify rotation : primary → fb1 → fb2.
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const apifyInputProfilePosts = {
      targetUrls,
      maxPosts: maxPostsPerProfile,
      scrapeReactions: false,
      scrapeComments: true,
      maxComments: 10,
      postedLimitDate: since,
      includeQuotePosts: false,
      includeReposts: false,
    };

    let posts: ApifyPost[] = [];
    let usedActor = '';
    try {
      posts = await callApifyActor(
        'harvestapi~linkedin-profile-posts',
        apifyInputProfilePosts,
        apifyToken,
      );
      usedActor = 'harvestapi/linkedin-profile-posts';
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'apify_primary_failed_trying_fb1');
      try {
        posts = await callApifyActor(
          'harvestapi~linkedin-post-search',
          { ...apifyInputProfilePosts },
          apifyToken,
        );
        usedActor = 'harvestapi/linkedin-post-search';
      } catch (e2) {
        log.warn({ err: (e2 as Error).message }, 'apify_fb1_failed_trying_fb2');
        try {
          posts = await callApifyActor(
            'apimaestro~linkedin-posts-search-scraper-no-cookies',
            { ...apifyInputProfilePosts },
            apifyToken,
          );
          usedActor = 'apimaestro/linkedin-posts-search-scraper-no-cookies';
        } catch (e3) {
          log.error({ err: (e3 as Error).message }, 'apify_all_failed');
          return errorResponse('apify_all_actors_failed', 502, { err: (e3 as Error).message });
        }
      }
    }

    // 3. Normalize + filter off_watchlist + filter FR.
    const validRows: NormalizedRaw[] = [];
    const dlqRows: Array<Record<string, unknown>> = [];
    for (const p of posts) {
      const norm = normalizeApifyPost(p, watchlistIds, usedActor);
      if (!norm) {
        dlqRows.push({
          raw_payload: p as unknown,
          reason: 'normalization_failed_or_off_watchlist',
          source_actor: usedActor,
        });
        continue;
      }
      if (!isLikelyFrench(norm.text)) {
        dlqRows.push({
          raw_payload: p as unknown,
          reason: 'not_french_heuristic',
          source_actor: usedActor,
        });
        continue;
      }
      validRows.push(norm);
    }

    // 4. UPSERT raw_posts.
    if (validRows.length > 0) {
      const { error: rawErr } = await sb
        .from('raw_posts')
        .upsert(validRows, { onConflict: 'post_id' });
      if (rawErr) return errorResponse(`raw_posts_upsert_failed: ${rawErr.message}`, 500);
    }
    if (dlqRows.length > 0) {
      const { error: dlqErr } = await sb.from('raw_posts_dlq').insert(dlqRows);
      if (dlqErr) log.warn({ err: dlqErr.message }, 'dlq_insert_failed_continuing');
    }

    // 5. Clean posts : on copie minimal de raw → clean avec engagement_score_normalized.
    // Calcul simplifié : log(likes + 2*comments + 3*reposts + 1) — heuristique.
    const cleanRows = validRows.map((r) => {
      const eng = r.likes + 2 * r.comments + 3 * r.reposts;
      const score = Math.log1p(eng);
      return {
        post_id: r.post_id,
        engagement_score_normalized: score,
        is_relevant: true,
        topic_cluster_pre: 'autre',
        filter_reason: null,
      };
    });
    if (cleanRows.length > 0) {
      const { error: cleanErr } = await sb
        .from('clean_posts')
        .upsert(cleanRows, { onConflict: 'post_id' });
      if (cleanErr) return errorResponse(`clean_posts_upsert_failed: ${cleanErr.message}`, 500);
    }

    // 6. Temporal analysis : aggregation week × day × hour_bucket.
    const tempMap = new Map<
      string,
      {
        week_id: string;
        day_of_week: string;
        hour_bucket: string;
        posts_count: number;
        sum_eng: number;
        formats: Record<string, number>;
      }
    >();
    for (let i = 0; i < validRows.length; i += 1) {
      const r = validRows[i];
      const eng = cleanRows[i]?.engagement_score_normalized ?? 0;
      const published = new Date(r.published_at);
      const wk = isoWeek(published);
      const bucket = hourBucket(r.hour_of_day);
      const key = `${wk}|${r.day_of_week}|${bucket}`;
      const cur = tempMap.get(key) ?? {
        week_id: wk,
        day_of_week: r.day_of_week,
        hour_bucket: bucket,
        posts_count: 0,
        sum_eng: 0,
        formats: {},
      };
      cur.posts_count += 1;
      cur.sum_eng += eng;
      cur.formats[r.media_type] = (cur.formats[r.media_type] ?? 0) + 1;
      tempMap.set(key, cur);
    }
    const temporalRows = [...tempMap.values()].map((t) => {
      const topFormat = Object.entries(t.formats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        week_id: t.week_id,
        day_of_week: t.day_of_week,
        hour_bucket: t.hour_bucket,
        posts_count: t.posts_count,
        avg_engagement_norm: t.posts_count > 0 ? t.sum_eng / t.posts_count : 0,
        top_format: topFormat,
        format_distribution: t.formats as unknown,
      };
    });
    if (temporalRows.length > 0) {
      const { error: tErr } = await sb.from('temporal_analysis').upsert(temporalRows, {
        onConflict: 'week_id,day_of_week,hour_bucket',
      });
      if (tErr) log.warn({ err: tErr.message }, 'temporal_upsert_failed');
    }

    const duration = Date.now() - t0;
    log.info(
      {
        used_actor: usedActor,
        raw_kept: validRows.length,
        dlq: dlqRows.length,
        clean_upserted: cleanRows.length,
        temporal_upserted: temporalRows.length,
        duration_ms: duration,
      },
      'collect_done',
    );
    return jsonResponse({
      used_actor: usedActor,
      raw_kept: validRows.length,
      dlq: dlqRows.length,
      clean_upserted: cleanRows.length,
      temporal_upserted: temporalRows.length,
      duration_ms: duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'collect_failed');
    return errorResponse(msg, 500);
  }
});
