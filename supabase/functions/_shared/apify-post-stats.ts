// apify-post-stats (Deno copy) — miroir 1:1 de
// packages/shared/src/apify-post-stats.ts. Deno ne peut pas importer depuis
// packages/, donc on duplique. Toute modification doit être propagée des 2
// côtés (les Vitest tests testent la copie packages/shared, qui fait foi).

export interface ParsedApifyStats {
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  impressions: number | null;
  raw: unknown;
}

export function parseApifyResponse(item: unknown): ParsedApifyStats {
  const sc = (item as { social_count?: Record<string, unknown> } | null)?.social_count;
  const pickNum = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  return {
    likes: pickNum(sc?.num_likes),
    comments: pickNum(sc?.num_comments),
    reposts: pickNum(sc?.num_shares),
    impressions: null,
    raw: item,
  };
}
