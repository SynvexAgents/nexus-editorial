import { describe, expect, it } from 'vitest';
import { parseApifyResponse } from '../apify-post-stats.js';

// Fixture représentative de la sortie actor data-slayer/linkedin-post-analytics-scraper
// (id HFElvVpoWmD1bD9A7) — captée lors du test pré-commit Claude Code.
// Valeurs réelles d'un post Anthropic publié 2026-02-28.
const dataSlayerSample = {
  actor: { actor_name: 'Anthropic', actor_link: '...' },
  post_text: 'A statement on the comments from Secretary of War...',
  post_link: 'https://www.linkedin.com/feed/update/urn:li:activity:7433337757906923520',
  urn: 'urn:li:activity:7433337757906923520',
  posted_at: '2026-02-28T02:30:26.000Z',
  is_repost: false,
  social_count: {
    num_comments: 611,
    num_likes: 10851,
    num_shares: 960,
    reaction_type_counts: [
      { count: 7583, reaction_type: 'LIKE' },
      { count: 1427, reaction_type: 'APPRECIATION' },
      { count: 1358, reaction_type: 'PRAISE' },
      { count: 348, reaction_type: 'EMPATHY' },
      { count: 125, reaction_type: 'INTEREST' },
      { count: 10, reaction_type: 'ENTERTAINMENT' },
    ],
  },
  comments_urn: 'urn:li:fsd_socialDetail:...',
  reactions_urn: '...',
  reposts_urn: '...',
};

describe('parseApifyResponse — data-slayer schema mapping', () => {
  it('maps social_count.num_* to likes/comments/reposts on canonical payload', () => {
    const parsed = parseApifyResponse(dataSlayerSample);
    expect(parsed.likes).toBe(10851);
    expect(parsed.comments).toBe(611);
    expect(parsed.reposts).toBe(960);
    expect(parsed.impressions).toBeNull();
    expect(parsed.raw).toBe(dataSlayerSample);
  });

  it('returns null on each field when social_count is absent', () => {
    const itemWithoutStats = { post_text: 'hello', urn: 'urn:li:activity:123' };
    const parsed = parseApifyResponse(itemWithoutStats);
    expect(parsed.likes).toBeNull();
    expect(parsed.comments).toBeNull();
    expect(parsed.reposts).toBeNull();
    expect(parsed.impressions).toBeNull();
    expect(parsed.raw).toBe(itemWithoutStats);
  });

  it('returns null on a specific field when its value is not a number (string)', () => {
    const itemWithStringLikes = {
      social_count: {
        num_likes: '1234', // chaîne au lieu de number
        num_comments: 56,
        num_shares: 7,
      },
    };
    const parsed = parseApifyResponse(itemWithStringLikes);
    expect(parsed.likes).toBeNull(); // string rejetée
    expect(parsed.comments).toBe(56); // OK
    expect(parsed.reposts).toBe(7); // OK
  });

  it('preserves the full raw payload exactly as received', () => {
    const parsed = parseApifyResponse(dataSlayerSample);
    expect(parsed.raw).toStrictEqual(dataSlayerSample);
    // Notamment reaction_type_counts est préservé pour audit/debug ultérieur.
    const raw = parsed.raw as typeof dataSlayerSample;
    expect(raw.social_count.reaction_type_counts).toHaveLength(6);
    expect(raw.post_link).toBe(dataSlayerSample.post_link);
  });

  it('returns all-null gracefully on null/undefined input (no throw)', () => {
    const onNull = parseApifyResponse(null);
    expect(onNull.likes).toBeNull();
    expect(onNull.comments).toBeNull();
    expect(onNull.reposts).toBeNull();
    expect(onNull.raw).toBeNull();

    const onUndefined = parseApifyResponse(undefined);
    expect(onUndefined.likes).toBeNull();
    expect(onUndefined.raw).toBeUndefined();
  });

  it('returns null on NaN / Infinity values (Number.isFinite filter)', () => {
    const itemWithNaN = {
      social_count: {
        num_likes: Number.NaN,
        num_comments: Number.POSITIVE_INFINITY,
        num_shares: 42,
      },
    };
    const parsed = parseApifyResponse(itemWithNaN);
    expect(parsed.likes).toBeNull();
    expect(parsed.comments).toBeNull();
    expect(parsed.reposts).toBe(42);
  });
});
