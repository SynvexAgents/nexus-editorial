// apify-post-stats — parser pur pour la sortie de l'actor Apify
// `data-slayer/linkedin-post-analytics-scraper` (id HFElvVpoWmD1bD9A7).
//
// Output observé (1 item par scrape, run-sync-get-dataset-items) :
//   {
//     post_text, post_link, urn, posted_at, is_repost,
//     social_count: {
//       num_comments: number,
//       num_likes: number,
//       num_shares: number,
//       reaction_type_counts: [{ count, reaction_type }, ...]
//     },
//     comments_urn, reactions_urn, reposts_urn,
//     document_component, links_in_post, actor
//   }
//
// Le parser est volontairement défensif : retourne null sur chaque champ
// absent ou non-number pour qu'on persiste un NULL côté DB plutôt qu'un
// 0 trompeur. raw_apify_response stocke l'item entier pour audit/debug.

export interface ParsedApifyStats {
  likes: number | null;
  comments: number | null;
  reposts: number | null;
  /** LinkedIn ne publie pas les impressions sur les posts publics → toujours null. */
  impressions: number | null;
  /** Payload original tel que reçu d'Apify (insert dans post_performance.raw_apify_response). */
  raw: unknown;
}

/**
 * Lit `social_count.num_likes / num_comments / num_shares` et retourne le
 * mapping {likes, comments, reposts, impressions, raw}. Tolère :
 *   - item null ou non-object → tout null, raw=item
 *   - social_count absent → tout null, raw=item
 *   - champ individuel manquant ou non-number → ce champ null, autres OK
 */
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
