import { type ApifyPostNormalized, type MediaType, apifyPostMinimalSchema } from '@nexus/shared';
import { parsePublishedAt } from './date-utils.js';

export type ApifyActorId =
  | 'harvestapi/linkedin-profile-posts'
  | 'harvestapi/linkedin-post-search'
  | 'apimaestro/linkedin-posts-search-scraper-no-cookies';

export interface MapResult {
  post: ApifyPostNormalized | null;
  error_reason: string | null;
}

const safeString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v != null ? String(v) : fallback;

const safeInt = (v: unknown, fallback = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
  }
  return fallback;
};

const normaliseText = (text: string): string => text.replace(/\s+/g, ' ').trim();

const detectMediaTypeFromImages = (
  images: unknown,
  hasVideo = false,
  hasDocument = false,
): MediaType => {
  if (hasDocument) return 'document';
  if (hasVideo) return 'video';
  if (Array.isArray(images)) {
    if (images.length > 1) return 'carrousel';
    if (images.length === 1) return 'image';
  }
  return 'texte';
};

const pickTopComments = (comments: unknown, topN = 5): ApifyPostNormalized['comment_sample'] => {
  if (!Array.isArray(comments) || comments.length === 0) return null;

  const items = comments
    .map((c: unknown) => {
      const obj = (c ?? {}) as Record<string, unknown>;
      const author =
        safeString(obj.authorName) ||
        safeString((obj.author as Record<string, unknown> | undefined)?.name) ||
        'unknown';
      const text = safeString(obj.commentary) || safeString(obj.text) || safeString(obj.content);
      const likes = safeInt(obj.likes ?? obj.reactions ?? obj.likesCount);
      return { author, text, likes };
    })
    .filter((c) => c.text.length > 0);

  if (items.length === 0) return null;
  items.sort((a, b) => b.likes - a.likes);
  return items.slice(0, topN);
};

const validate = (candidate: Partial<ApifyPostNormalized>, raw: unknown): MapResult => {
  const minimal = {
    post_id: candidate.post_id,
    author_id: candidate.author_id,
    published_at: candidate.published_at,
    text: candidate.text,
  };
  const parsed = apifyPostMinimalSchema.safeParse(minimal);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      post: null,
      error_reason: `minimal_schema_failed:${issue?.path.join('.') ?? 'unknown'}:${issue?.message ?? 'unknown'}`,
    };
  }
  return {
    post: candidate as ApifyPostNormalized,
    error_reason: null,
  };
};

/**
 * harvestapi/linkedin-profile-posts (acteur principal).
 *
 * Schéma de sortie observé (mai 2026) :
 *   { id, linkedinUrl, content,
 *     author: { name, publicIdentifier, linkedinUrl, ... },
 *     postedAt: { date, timestamp, relative },
 *     engagement: { likes, comments, shares },
 *     postImages: [{ url, ... }],
 *     comments: [{ commentary, author: { name }, likes, ... }],
 *     ... }
 */
export function mapHarvestApiProfilePosts(raw: unknown): MapResult {
  if (raw == null || typeof raw !== 'object') {
    return { post: null, error_reason: 'not_object' };
  }
  const r = raw as Record<string, unknown>;

  const post_id = safeString(r.id ?? r.urn ?? r.postId);
  const author = (r.author ?? {}) as Record<string, unknown>;
  const author_id =
    safeString(author.publicIdentifier) ||
    safeString(author.urn) ||
    safeString(author.profileId) ||
    safeString(r.authorUrn);
  const parsedDate = parsePublishedAt(r.postedAt ?? r.publishedAt ?? r.time);
  const published_at = parsedDate?.toISOString() ?? '';
  const text = normaliseText(safeString(r.content ?? r.text));

  const engagement = (r.engagement ?? {}) as Record<string, unknown>;
  const likes = safeInt(engagement.likes ?? r.likes ?? r.reactionsCount);
  const comments = safeInt(engagement.comments ?? r.comments ?? r.commentsCount);
  const reposts = safeInt(engagement.shares ?? r.shares ?? r.reposts);
  const views = r.views != null ? safeInt(r.views) : null;
  const url = safeString(r.linkedinUrl ?? r.url) || null;

  const media_type = detectMediaTypeFromImages(
    r.postImages,
    Boolean(r.video || r.videoUrl),
    Boolean(r.document || r.documentUrl),
  );
  const comment_sample = pickTopComments(r.comments);

  return validate(
    {
      post_id,
      author_id,
      published_at,
      text,
      likes,
      comments,
      reposts,
      views,
      url,
      media_type,
      comment_sample,
    },
    raw,
  );
}

/**
 * harvestapi/linkedin-post-search (fallback 1, même provider).
 * Schéma quasi-identique au profile-posts (HarvestAPI partage le format).
 * On délègue donc.
 */
export function mapHarvestApiPostSearch(raw: unknown): MapResult {
  return mapHarvestApiProfilePosts(raw);
}

/**
 * apimaestro/linkedin-posts-search-scraper-no-cookies (fallback 2).
 *
 * Schéma de sortie observé (mai 2026) :
 *   { post_url, text, post_id (parfois absent → dériver de post_url),
 *     author: { profile_url, name, ... },
 *     posted_at, reactions: { LIKE, ... } ou like_count,
 *     comment_count, share_count, ... }
 */
export function mapApiMaestroPost(raw: unknown): MapResult {
  if (raw == null || typeof raw !== 'object') {
    return { post: null, error_reason: 'not_object' };
  }
  const r = raw as Record<string, unknown>;

  const url = safeString(r.post_url ?? r.postUrl ?? r.url) || null;

  // apimaestro n'expose pas toujours post_id ; on le dérive de l'URL si besoin.
  let post_id = safeString(r.post_id ?? r.postId ?? r.urn ?? r.id);
  if (!post_id && url) {
    const m = url.match(/(?:activity[-_:])(\d{10,})/);
    if (m?.[1]) post_id = `urn:li:activity:${m[1]}`;
  }

  const author = (r.author ?? {}) as Record<string, unknown>;
  const author_id =
    safeString(author.profile_url) ||
    safeString(author.profileUrl) ||
    safeString(author.public_identifier) ||
    safeString(r.author_profile_url);

  const parsedDate = parsePublishedAt(r.posted_at ?? r.postedAt ?? r.published_at);
  const published_at = parsedDate?.toISOString() ?? '';
  const text = normaliseText(safeString(r.text ?? r.content ?? r.post_text));

  const reactions = (r.reactions ?? {}) as Record<string, unknown>;
  const likes = safeInt(reactions.LIKE ?? r.like_count ?? r.likes ?? r.reactions_count);
  const comments = safeInt(r.comment_count ?? r.comments_count ?? r.comments);
  const reposts = safeInt(r.share_count ?? r.shares ?? r.reposts);
  const views = r.view_count != null ? safeInt(r.view_count) : null;

  const media_type = detectMediaTypeFromImages(
    r.images ?? r.media,
    Boolean(r.video_url ?? r.video),
    Boolean(r.document_url ?? r.document),
  );

  return validate(
    {
      post_id,
      author_id,
      published_at,
      text,
      likes,
      comments,
      reposts,
      views,
      url,
      media_type,
      comment_sample: pickTopComments(r.comments_sample ?? r.comments_array),
    },
    raw,
  );
}

/**
 * Dispatcher : retourne le bon mapper pour un actorId connu.
 * Lever explicitement plutôt que renvoyer un fallback silencieux : on veut
 * voir tout de suite un actor non câblé.
 */
export function getMapperFor(actorId: ApifyActorId): (raw: unknown) => MapResult {
  switch (actorId) {
    case 'harvestapi/linkedin-profile-posts':
      return mapHarvestApiProfilePosts;
    case 'harvestapi/linkedin-post-search':
      return mapHarvestApiPostSearch;
    case 'apimaestro/linkedin-posts-search-scraper-no-cookies':
      return mapApiMaestroPost;
    default: {
      const _exhaustive: never = actorId;
      throw new Error(`no mapper registered for actor ${String(_exhaustive)}`);
    }
  }
}
