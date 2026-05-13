import { describe, expect, it } from 'vitest';
import { linkedinTrendsSchema } from '../linkedin-trends.schema.js';

const validFixture = {
  top_hooks: [
    {
      type: 'observation_metier',
      frequency: 12,
      avg_engagement_norm: 0.78,
      example_post_id: 'urn:li:activity:1',
    },
    {
      type: 'contrarian',
      frequency: 8,
      avg_engagement_norm: 0.72,
      example_post_id: 'urn:li:activity:2',
    },
  ],
  top_formats: [
    { format: 'analyse', frequency: 10, avg_engagement_norm: 0.71 },
    { format: 'mini_essai', frequency: 7, avg_engagement_norm: 0.66 },
  ],
  top_topic_clusters: [
    { cluster: 'distribution_assurance', frequency: 6, avg_engagement_norm: 0.69 },
  ],
  rising_topics: ['IA ACPR', 'IBNR temps réel'],
  falling_topics: ['transformation digitale'],
  tone_dominant: 'lucide',
  longueur_optimale_p50_p90: [1100, 1850] as [number, number],
  mecaniques_emergentes: ['carrousel court 4 slides', 'data viz unique'],
  best_days_observed: [
    { day: 'Mardi', avg_engagement_norm: 0.82 },
    { day: 'Jeudi', avg_engagement_norm: 0.79 },
  ],
  best_hours_observed: [{ hour_bucket: '08:00-09:00', avg_engagement_norm: 0.79 }],
  format_performance: [{ format: 'analyse', avg_engagement_norm: 0.71 }],
  ten_best_posts: [
    { post_id: 'urn:li:activity:1', score: 0.91, summary: 'Post ACPR IA distribution' },
  ],
  synthese_textuelle:
    "Semaine dominée par les analyses lucides ancrées dans l'actualité réglementaire. Le contrarian sec performe sur l'audience dirigeante.",
};

describe('linkedinTrendsSchema', () => {
  it('parses a realistic weekly LinkedIn trends snapshot', () => {
    const result = linkedinTrendsSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.longueur_optimale_p50_p90).toEqual([1100, 1850]);
      expect(result.data.ten_best_posts).toHaveLength(1);
    }
  });

  it('rejects ten_best_posts with more than 10 entries', () => {
    const invalid = {
      ...validFixture,
      ten_best_posts: Array.from({ length: 11 }, (_, i) => ({
        post_id: `urn:li:activity:${i}`,
        score: 0.5,
        summary: `Post ${i}`,
      })),
    };
    const result = linkedinTrendsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
