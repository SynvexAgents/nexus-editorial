import { describe, expect, it } from 'vitest';
import { computeEngagementScore, detectFrench, normalize } from '../normalizer.js';
import {
  EN_TEXT_LONG,
  FR_TEXT_AUTRE,
  FR_TEXT_COMMERCIAL,
  FR_TEXT_MARCHE,
  FR_TEXT_OPERATIONNEL,
  FR_TEXT_PILOTAGE,
  FR_TEXT_REGLEMENTAIRE,
  FR_TEXT_SELF_PROMO,
  FR_TEXT_TECH_IA,
  FR_TEXT_TOO_SHORT,
  buildRawPost,
} from './fixtures.js';

const FIXED_NOW = (): Date => new Date('2026-05-13T08:00:00.000Z');

const baselines = new Map<string, number>([
  ['profile_a', 100],
  ['profile_b', 80],
]);
const followers = new Map<string, number>([
  ['profile_a', 10000],
  ['profile_b', 8000],
]);

describe('normalize() — happy path with 10 posts', () => {
  it('keeps 6 valid posts and rejects 4 with the correct reasons', () => {
    const rawPosts = [
      buildRawPost({ post_id: 'p1', profile_id: 'profile_a', text: FR_TEXT_PILOTAGE }),
      buildRawPost({ post_id: 'p2', profile_id: 'profile_b', text: FR_TEXT_COMMERCIAL }),
      buildRawPost({ post_id: 'p3', profile_id: 'profile_a', text: FR_TEXT_REGLEMENTAIRE }),
      buildRawPost({ post_id: 'p4', profile_id: 'profile_b', text: FR_TEXT_OPERATIONNEL }),
      buildRawPost({ post_id: 'p5', profile_id: 'profile_a', text: FR_TEXT_TECH_IA }),
      buildRawPost({ post_id: 'p6', profile_id: 'profile_a', text: FR_TEXT_MARCHE }),
      buildRawPost({ post_id: 'p7_short', profile_id: 'profile_a', text: FR_TEXT_TOO_SHORT }),
      buildRawPost({ post_id: 'p8_en', profile_id: 'profile_a', text: EN_TEXT_LONG }),
      buildRawPost({ post_id: 'p9_promo', profile_id: 'profile_a', text: FR_TEXT_SELF_PROMO }),
      buildRawPost({
        post_id: 'p10_low',
        profile_id: 'profile_a',
        text: FR_TEXT_AUTRE,
        likes: 10,
        comments: 1,
        reposts: 0,
      }),
    ];

    const result = normalize(rawPosts, baselines, followers, { now: FIXED_NOW });

    expect(result.stats.total_in).toBe(10);
    expect(result.stats.kept).toBe(6);
    expect(result.stats.rejected).toBe(4);
    expect(result.stats.rejected_breakdown).toEqual({
      off_watchlist: 0,
      too_short: 1,
      non_fr: 1,
      self_promo: 1,
      below_author_baseline: 1,
    });

    const reasonByPostId = new Map(result.rejected.map((r) => [r.post_id, r.reason]));
    expect(reasonByPostId.get('p7_short')).toBe('too_short');
    expect(reasonByPostId.get('p8_en')).toBe('non_fr');
    expect(reasonByPostId.get('p9_promo')).toBe('self_promo');
    expect(reasonByPostId.get('p10_low')).toBe('below_author_baseline');
  });
});

describe('normalize() — scoring formula', () => {
  it('computes engagement_score_normalized to within 0.001 epsilon for known inputs', () => {
    const score = computeEngagementScore({
      likes: 80,
      comments: 10,
      reposts: 2,
      baseline_author: 100,
      followers: 10000,
    });

    expect(score.engagement_raw).toBe(120);
    expect(score.engagement_ratio).toBeCloseTo(1.2, 5);
    // follower_factor = log10(10001) / log10(100000) ≈ 0.80000869
    // score = 1.2 * (1 + 0.3 * 1/0.80000869) ≈ 1.6499870
    expect(score.engagement_score_normalized).toBeGreaterThan(1.6499);
    expect(score.engagement_score_normalized).toBeLessThan(1.6501);
  });

  it('returns engagement_ratio = 1.0 when post is first occurrence (no baseline)', () => {
    const post = buildRawPost({
      post_id: 'first_post',
      profile_id: 'new_profile',
      text: FR_TEXT_PILOTAGE,
      likes: 50,
      comments: 5,
      reposts: 1,
    });
    const result = normalize([post], new Map(), followers, { now: FIXED_NOW });
    expect(result.stats.kept).toBe(1);
    expect(result.clean_posts[0]?.engagement_ratio).toBeCloseTo(1.0, 5);
  });
});

describe('normalize() — individual filters', () => {
  it('rejects a post shorter than 200 characters with reason="too_short"', () => {
    const post = buildRawPost({
      post_id: 'too_short_only',
      profile_id: 'profile_a',
      text: FR_TEXT_TOO_SHORT,
    });
    const result = normalize([post], baselines, followers, { now: FIXED_NOW });
    expect(result.stats.kept).toBe(0);
    expect(result.rejected[0]).toEqual({ post_id: 'too_short_only', reason: 'too_short' });
  });

  it('rejects an English post with reason="non_fr"', () => {
    const post = buildRawPost({
      post_id: 'en_only',
      profile_id: 'profile_a',
      text: EN_TEXT_LONG,
    });
    const result = normalize([post], baselines, followers, { now: FIXED_NOW });
    expect(result.rejected[0]).toEqual({ post_id: 'en_only', reason: 'non_fr' });
  });

  it('rejects a self-promo post with reason="self_promo"', () => {
    const post = buildRawPost({
      post_id: 'promo_only',
      profile_id: 'profile_a',
      text: FR_TEXT_SELF_PROMO,
    });
    const result = normalize([post], baselines, followers, { now: FIXED_NOW });
    expect(result.rejected[0]).toEqual({ post_id: 'promo_only', reason: 'self_promo' });
  });

  it('rejects a post with engagement < 0.8 × author baseline', () => {
    // baseline profile_a = 100, threshold = 80.
    // likes=10, comments=1, reposts=0 → raw = 10+3+0 = 13. Ratio = 0.13.
    const post = buildRawPost({
      post_id: 'low_engagement',
      profile_id: 'profile_a',
      text: FR_TEXT_PILOTAGE,
      likes: 10,
      comments: 1,
      reposts: 0,
    });
    const result = normalize([post], baselines, followers, { now: FIXED_NOW });
    expect(result.rejected[0]).toEqual({
      post_id: 'low_engagement',
      reason: 'below_author_baseline',
    });
  });

  it('rejects an off-watchlist post when activeProfileIds is provided', () => {
    const post = buildRawPost({
      post_id: 'unknown_profile',
      profile_id: 'profile_xyz',
      text: FR_TEXT_PILOTAGE,
    });
    const result = normalize([post], baselines, followers, {
      now: FIXED_NOW,
      activeProfileIds: new Set(['profile_a', 'profile_b']),
    });
    expect(result.rejected[0]).toEqual({ post_id: 'unknown_profile', reason: 'off_watchlist' });
  });
});

describe('normalize() — temporal_analysis aggregation', () => {
  it('aggregates 5 valid posts on Tuesday 09:30 Paris into a single temporal row', () => {
    const tuesdayPosts = Array.from({ length: 5 }, (_, i) =>
      buildRawPost({
        post_id: `tue_${i + 1}`,
        profile_id: 'profile_a',
        text: FR_TEXT_PILOTAGE,
        published_at: '2026-05-12T09:30:00+02:00',
      }),
    );

    const result = normalize(tuesdayPosts, baselines, followers, { now: FIXED_NOW });

    expect(result.stats.kept).toBe(5);
    expect(result.temporal_rows).toHaveLength(1);
    const row = result.temporal_rows[0]!;
    expect(row.day_of_week).toBe('Mar');
    expect(row.hour_bucket).toBe('08h-10h');
    expect(row.posts_count).toBe(5);
    expect(row.week_id).toMatch(/^2026-W\d{2}$/);
    expect(row.top_format).toBe('texte');
    expect(row.format_distribution.texte).toBeCloseTo(1.0, 5);
  });
});

describe('normalize() — idempotence', () => {
  it('produces identical output when called twice on the same input', () => {
    const rawPosts = [
      buildRawPost({ post_id: 'i1', profile_id: 'profile_a', text: FR_TEXT_PILOTAGE }),
      buildRawPost({ post_id: 'i2', profile_id: 'profile_b', text: FR_TEXT_COMMERCIAL }),
      buildRawPost({ post_id: 'i3', profile_id: 'profile_a', text: FR_TEXT_REGLEMENTAIRE }),
    ];
    const a = normalize(rawPosts, baselines, followers, { now: FIXED_NOW });
    const b = normalize(rawPosts, baselines, followers, { now: FIXED_NOW });
    expect(b).toEqual(a);
  });

  it('deduplicates posts with the same post_id (keeps first occurrence)', () => {
    const post = buildRawPost({ post_id: 'dup', profile_id: 'profile_a', text: FR_TEXT_PILOTAGE });
    const result = normalize([post, post, post], baselines, followers, { now: FIXED_NOW });
    expect(result.stats.total_in).toBe(3);
    expect(result.stats.kept).toBe(1);
  });
});

describe('normalize() — topic_cluster_pre', () => {
  it('detects each of the 7 clusters from canonical sample texts', () => {
    const cases: Array<{ post_id: string; text: string; expected: string }> = [
      { post_id: 'tc_pilotage', text: FR_TEXT_PILOTAGE, expected: 'pilotage' },
      { post_id: 'tc_commercial', text: FR_TEXT_COMMERCIAL, expected: 'commercial' },
      { post_id: 'tc_reglementaire', text: FR_TEXT_REGLEMENTAIRE, expected: 'reglementaire' },
      { post_id: 'tc_operationnel', text: FR_TEXT_OPERATIONNEL, expected: 'operationnel' },
      { post_id: 'tc_tech_ia', text: FR_TEXT_TECH_IA, expected: 'tech_ia' },
      { post_id: 'tc_marche', text: FR_TEXT_MARCHE, expected: 'marche_assurance' },
      { post_id: 'tc_autre', text: FR_TEXT_AUTRE, expected: 'autre' },
    ];

    const rawPosts = cases.map((c) =>
      buildRawPost({ post_id: c.post_id, profile_id: 'profile_a', text: c.text }),
    );

    const result = normalize(rawPosts, baselines, followers, { now: FIXED_NOW });

    expect(result.stats.kept).toBe(7);
    const clusterByPostId = new Map(
      result.clean_posts.map((p) => [p.row.post_id, p.row.topic_cluster_pre]),
    );
    for (const c of cases) {
      expect(clusterByPostId.get(c.post_id)).toBe(c.expected);
    }
  });
});

describe('detectFrench()', () => {
  it('returns isFr=true on real French insurance text', () => {
    const r = detectFrench(FR_TEXT_PILOTAGE);
    expect(r.isFr).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('returns isFr=false on English text', () => {
    const r = detectFrench(EN_TEXT_LONG);
    expect(r.isFr).toBe(false);
  });

  it('returns isFr=false on text shorter than 50 chars', () => {
    const r = detectFrench('court billet français');
    expect(r.isFr).toBe(false);
  });
});
