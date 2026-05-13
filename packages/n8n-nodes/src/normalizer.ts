import type {
  CleanPost,
  DayOfWeek,
  FilterReason,
  HourBucket,
  MediaType,
  RawPost,
  TemporalRow,
  TopicClusterPre,
} from '@nexus/shared';
import { francAll } from 'franc-min';
import { toHourBucket, toIsoWeekId, toParisDateParts } from './date-utils.js';

// ============================================================================
// Filtres d'exclusion — patterns regex compilés une fois
// ============================================================================

const SELF_PROMO_PATTERNS: RegExp[] = [
  /réservez\s+(votre|une)\s+démo/i,
  /lien\s+(en|dans)\s+bio/i,
  /cliquez\s+ici\s+pour/i,
  /n[''']hésitez\s+pas\s+à\s+me\s+contacter/i,
  /\bdm\s+moi\b/i,
  /inscrivez-vous\s+(à|au)\s+(notre|mon)/i,
  /profitez\s+de\s+[0-9]+\s*%/i,
  /offre\s+(spéciale|limitée)/i,
];

const isSelfPromo = (text: string): boolean => SELF_PROMO_PATTERNS.some((re) => re.test(text));

// ============================================================================
// Pré-clustering thématique métier — premier match dans l'ordre
// ============================================================================

interface TopicRule {
  cluster: TopicClusterPre;
  pattern: RegExp;
}

const TOPIC_RULES: TopicRule[] = [
  {
    cluster: 'pilotage',
    pattern: /\b(s\/p|loss\s*ratio|ratio\s*combiné|ibnr|prime\s+d['']équilibre|dérive)\b/i,
  },
  {
    cluster: 'commercial',
    pattern: /\b(bordereau|commission|rétrocession|rétention|apporteur|churn)\b/i,
  },
  {
    cluster: 'reglementaire',
    pattern: /\b(acpr|rgpd|audit\s+trail|conformité|défendabilité)\b/i,
  },
  {
    cluster: 'operationnel',
    pattern: /\b(sinistre|indemnisation|\bij\b|fraude|\bmrp\b|\brc\s*pro\b)\b/i,
  },
  {
    cluster: 'tech_ia',
    pattern: /\b(agent\s+ia|llm|claude|gpt|automation|n8n)\b/i,
  },
  {
    cluster: 'marche_assurance',
    pattern: /\b(mga|mutuelle|courtage|insurtech|réassureur|embedded)\b/i,
  },
];

const detectTopicClusterPre = (text: string): TopicClusterPre => {
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(text)) return rule.cluster;
  }
  return 'autre';
};

// ============================================================================
// Détection langue : franc-min, top match doit être 'fra' avec proba >= 0.7
// ============================================================================

const FR_CONFIDENCE_THRESHOLD = 0.7;
const FRANC_MIN_LENGTH = 50;

export function detectFrench(text: string): { isFr: boolean; confidence: number } {
  if (text.length < FRANC_MIN_LENGTH) return { isFr: false, confidence: 0 };
  const results = francAll(text, { minLength: FRANC_MIN_LENGTH });
  if (results.length === 0) return { isFr: false, confidence: 0 };
  const top = results[0];
  if (!top) return { isFr: false, confidence: 0 };
  const [topLang, topScore] = top;
  return {
    isFr: topLang === 'fra' && topScore >= FR_CONFIDENCE_THRESHOLD,
    confidence: topScore,
  };
}

// ============================================================================
// Scoring engagement normalisé — formule du brief, exacte
// ============================================================================

export interface ScoreInputs {
  likes: number;
  comments: number;
  reposts: number;
  baseline_author: number;
  followers: number;
}

export interface ScoreOutputs {
  engagement_raw: number;
  engagement_ratio: number;
  engagement_score_normalized: number;
}

export function computeEngagementScore(inputs: ScoreInputs): ScoreOutputs {
  const engagement_raw = inputs.likes + inputs.comments * 3 + inputs.reposts * 5;
  const baseline = inputs.baseline_author > 0 ? inputs.baseline_author : 1;
  const engagement_ratio = engagement_raw / baseline;
  const followers = inputs.followers > 0 ? inputs.followers : 1000;
  const follower_factor = Math.log10(followers + 1) / Math.log10(100_000);
  const engagement_score_normalized =
    engagement_ratio * (1 + 0.3 * (1 / Math.max(follower_factor, 0.01)));
  return { engagement_raw, engagement_ratio, engagement_score_normalized };
}

// ============================================================================
// Agrégation temporelle (jour × heure × format)
// ============================================================================

interface TemporalAcc {
  posts_count: number;
  total_engagement_norm: number;
  format_counts: Record<MediaType, number>;
}

const emptyFormatCounts = (): Record<MediaType, number> => ({
  texte: 0,
  image: 0,
  carrousel: 0,
  video: 0,
  document: 0,
});

const pickTopFormat = (counts: Record<MediaType, number>): MediaType => {
  const entries = (Object.entries(counts) as Array<[MediaType, number]>).filter(([, n]) => n > 0);
  if (entries.length === 0) return 'texte';
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0]![0];
};

// ============================================================================
// API publique
// ============================================================================

export interface ScoredCleanPost {
  row: CleanPost;
  engagement_raw: number;
  engagement_ratio: number;
}

export interface RejectedPost {
  post_id: string;
  reason: FilterReason;
}

export type RejectedBreakdown = Record<FilterReason, number>;

export interface NormalizerStats {
  total_in: number;
  kept: number;
  rejected: number;
  rejected_breakdown: RejectedBreakdown;
}

export interface NormalizerResult {
  clean_posts: ScoredCleanPost[];
  temporal_rows: TemporalRow[];
  rejected: RejectedPost[];
  stats: NormalizerStats;
}

export interface NormalizerOptions {
  /**
   * Si fourni, tout post dont `profile_id` n'est pas dans ce set est rejeté
   * avec `reason="off_watchlist"`. Si omis, le filtre off_watchlist est skipped
   * (utile pour les tests où on connaît déjà la pertinence des posts).
   */
  activeProfileIds?: Set<string>;
  /** Override clock pour les tests d'idempotence. */
  now?: () => Date;
}

const MIN_TEXT_LENGTH = 200;
const BASELINE_RATIO_THRESHOLD = 0.8;

const emptyBreakdown = (): RejectedBreakdown => ({
  off_watchlist: 0,
  too_short: 0,
  non_fr: 0,
  self_promo: 0,
  below_author_baseline: 0,
});

export function normalize(
  rawPosts: RawPost[],
  authorBaselines: Map<string, number>,
  followersByAuthor: Map<string, number>,
  options: NormalizerOptions = {},
): NormalizerResult {
  const clean_posts: ScoredCleanPost[] = [];
  const rejected: RejectedPost[] = [];
  const rejected_breakdown = emptyBreakdown();
  const now = options.now ?? (() => new Date());

  // Dédup par post_id en gardant la première occurrence (raw_posts est déjà
  // censé être UPSERT, mais ceinture + bretelles).
  const seen = new Set<string>();
  const deduped: RawPost[] = [];
  for (const p of rawPosts) {
    if (seen.has(p.post_id)) continue;
    seen.add(p.post_id);
    deduped.push(p);
  }

  // Buckets temporels (key: week_id|day_of_week|hour_bucket)
  const temporalBuckets = new Map<
    string,
    TemporalAcc & { week_id: string; day_of_week: DayOfWeek; hour_bucket: HourBucket }
  >();

  for (const post of deduped) {
    const reject = (reason: FilterReason): void => {
      rejected.push({ post_id: post.post_id, reason });
      rejected_breakdown[reason] += 1;
    };

    // --- Étape A : filtres binaires d'exclusion (ordre exact du brief) ---

    // A1. Hors watchlist
    if (options.activeProfileIds) {
      if (!post.profile_id || !options.activeProfileIds.has(post.profile_id)) {
        reject('off_watchlist');
        continue;
      }
    }

    const text = post.text ?? '';

    // A2. Longueur
    if (text.length < MIN_TEXT_LENGTH) {
      reject('too_short');
      continue;
    }

    // A3. Langue (franc-min, confiance >= 0.7)
    const { isFr } = detectFrench(text);
    if (!isFr) {
      reject('non_fr');
      continue;
    }

    // A4. Pub auto-promo (regex)
    if (isSelfPromo(text)) {
      reject('self_promo');
      continue;
    }

    // --- Étape B : scoring engagement normalisé ---

    const profile_id = post.profile_id ?? '';
    const knownBaseline = authorBaselines.get(profile_id);
    const engagement_raw_preview = post.likes + post.comments * 3 + post.reposts * 5;
    // Edge case "première occurrence auteur" : pas de baseline → on prend
    // l'engagement_raw du post lui-même, ce qui donne ratio = 1.
    const baseline_author =
      knownBaseline !== undefined
        ? knownBaseline
        : engagement_raw_preview > 0
          ? engagement_raw_preview
          : 1;

    const followers = followersByAuthor.get(profile_id) ?? 1000;
    const score = computeEngagementScore({
      likes: post.likes,
      comments: post.comments,
      reposts: post.reposts,
      baseline_author,
      followers,
    });

    // --- Étape C : filtre baseline auteur ---
    if (score.engagement_ratio < BASELINE_RATIO_THRESHOLD) {
      reject('below_author_baseline');
      continue;
    }

    // --- Étape D : pré-clustering thématique ---
    const topic_cluster_pre = detectTopicClusterPre(text);

    // --- Post conservé ---
    const cleanRow: CleanPost = {
      post_id: post.post_id,
      engagement_score_normalized: score.engagement_score_normalized,
      is_relevant: true,
      topic_cluster_pre,
      filter_reason: null,
      processed_at: now().toISOString(),
    };
    clean_posts.push({
      row: cleanRow,
      engagement_raw: score.engagement_raw,
      engagement_ratio: score.engagement_ratio,
    });

    // --- Étape E : agrégation temporal_analysis ---
    const parisParts = toParisDateParts(new Date(post.published_at));
    const week_id = toIsoWeekId(parisParts);
    const day_of_week = parisParts.weekday;
    const hour_bucket = toHourBucket(parisParts.hour);
    const key = `${week_id}|${day_of_week}|${hour_bucket}`;
    let bucket = temporalBuckets.get(key);
    if (!bucket) {
      bucket = {
        week_id,
        day_of_week,
        hour_bucket,
        posts_count: 0,
        total_engagement_norm: 0,
        format_counts: emptyFormatCounts(),
      };
      temporalBuckets.set(key, bucket);
    }
    bucket.posts_count += 1;
    bucket.total_engagement_norm += score.engagement_score_normalized;
    const mt = (post.media_type ?? 'texte') as MediaType;
    if (mt in bucket.format_counts) {
      bucket.format_counts[mt] += 1;
    } else {
      bucket.format_counts.texte += 1;
    }
  }

  // Finaliser temporal_rows
  const temporal_rows: TemporalRow[] = Array.from(temporalBuckets.values())
    .map((b) => {
      const total = b.posts_count;
      const distribution: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.format_counts)) {
        if (v > 0) distribution[k] = v / total;
      }
      return {
        week_id: b.week_id,
        day_of_week: b.day_of_week,
        hour_bucket: b.hour_bucket,
        posts_count: b.posts_count,
        avg_engagement_norm: b.total_engagement_norm / b.posts_count,
        top_format: pickTopFormat(b.format_counts),
        format_distribution: distribution,
      } satisfies TemporalRow;
    })
    .sort(
      (a, b) =>
        a.week_id.localeCompare(b.week_id) ||
        a.day_of_week.localeCompare(b.day_of_week) ||
        a.hour_bucket.localeCompare(b.hour_bucket),
    );

  return {
    clean_posts,
    temporal_rows,
    rejected,
    stats: {
      total_in: rawPosts.length,
      kept: clean_posts.length,
      rejected: rejected.length,
      rejected_breakdown,
    },
  };
}
