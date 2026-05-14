import { describe, expect, it } from 'vitest';
import { getMapperFor, mapApiMaestroPost, mapHarvestApiProfilePosts } from '../apify-mappers.js';

const harvestApiPostFixture = {
  id: 'urn:li:activity:7165432109876543210',
  linkedinUrl: 'https://www.linkedin.com/posts/marouane-borsali_post-id',
  content:
    "Constat lucide sur le marché du courtage IARD français. La consolidation s'accélère et les bordereaux mensuels se réajustent.",
  author: {
    name: 'Marouane Borsali',
    publicIdentifier: 'marouane-borsali',
    linkedinUrl: 'https://www.linkedin.com/in/marouane-borsali',
  },
  postedAt: {
    date: '2026-05-12T09:30:00+02:00',
    timestamp: 1747035000000,
    relative: '1 day ago',
  },
  engagement: {
    likes: 142,
    comments: 18,
    shares: 4,
  },
  postImages: [],
  comments: [
    {
      commentary: 'Excellent constat, je partage.',
      author: { name: 'Jean Dupont' },
      likes: 5,
    },
    {
      commentary: 'Tout à fait, on observe ça aussi côté MGA.',
      author: { name: 'Marie Martin' },
      likes: 12,
    },
  ],
};

describe('mapHarvestApiProfilePosts()', () => {
  it('maps a realistic HarvestAPI post to ApifyPostNormalized', () => {
    const result = mapHarvestApiProfilePosts(harvestApiPostFixture);
    expect(result.error_reason).toBeNull();
    expect(result.post).toBeTruthy();
    expect(result.post?.post_id).toBe('urn:li:activity:7165432109876543210');
    expect(result.post?.author_id).toBe('marouane-borsali');
    expect(result.post?.likes).toBe(142);
    expect(result.post?.comments).toBe(18);
    expect(result.post?.reposts).toBe(4);
    expect(result.post?.media_type).toBe('texte');
    expect(result.post?.comment_sample).toHaveLength(2);
    // top comment by likes should be sorted first
    expect(result.post?.comment_sample?.[0]?.likes).toBe(12);
  });

  it('detects carrousel media_type when postImages has > 1 item', () => {
    const withImages = {
      ...harvestApiPostFixture,
      postImages: [{ url: 'a.jpg' }, { url: 'b.jpg' }, { url: 'c.jpg' }],
    };
    const result = mapHarvestApiProfilePosts(withImages);
    expect(result.post?.media_type).toBe('carrousel');
  });

  it('rejects a post missing required text via minimal schema check', () => {
    const broken = { ...harvestApiPostFixture, content: '' };
    const result = mapHarvestApiProfilePosts(broken);
    expect(result.post).toBeNull();
    expect(result.error_reason).toContain('minimal_schema_failed');
  });

  it('skips comment items (type:"comment") without sending them to DLQ', () => {
    // harvestapi/linkedin-profile-posts renvoie posts ET commentaires dans le
    // même dataset quand scrapeComments=true. Les commentaires ne sont pas du
    // contenu primaire — le mapper doit signaler skip:* (pas error).
    const commentItem = {
      id: '7459872062829047808',
      type: 'comment',
      actor: { name: 'Commentateur Lambda' },
      commentary: 'Très intéressant ce post.',
      postId: '7459549239333978112',
    };
    const result = mapHarvestApiProfilePosts(commentItem);
    expect(result.post).toBeNull();
    expect(result.error_reason).toBe('skip:comment_item');
  });
});

describe('mapApiMaestroPost()', () => {
  it('derives post_id from post_url when missing', () => {
    const apimaestroFixture = {
      post_url: 'https://www.linkedin.com/feed/update/urn:li:activity:7100000000000000000',
      text: 'Constat sur la dérive des ratios combinés IARD au premier semestre, avec quelques observations terrain.',
      author: {
        profile_url: 'https://www.linkedin.com/in/marouane-borsali',
        name: 'Marouane Borsali',
      },
      posted_at: '2026-05-12T09:30:00+02:00',
      reactions: { LIKE: 50 },
      comment_count: 8,
      share_count: 2,
    };
    const result = mapApiMaestroPost(apimaestroFixture);
    expect(result.error_reason).toBeNull();
    expect(result.post?.post_id).toBe('urn:li:activity:7100000000000000000');
    expect(result.post?.likes).toBe(50);
    expect(result.post?.comments).toBe(8);
  });
});

describe('getMapperFor()', () => {
  it('returns the correct mapper for each known actor id', () => {
    expect(getMapperFor('harvestapi/linkedin-profile-posts')).toBe(mapHarvestApiProfilePosts);
    expect(getMapperFor('apimaestro/linkedin-posts-search-scraper-no-cookies')).toBe(
      mapApiMaestroPost,
    );
  });
});
