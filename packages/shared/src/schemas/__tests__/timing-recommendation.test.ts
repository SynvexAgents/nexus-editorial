import { describe, expect, it } from 'vitest';
import { timingRecommendationSchema } from '../timing-recommendation.schema.js';

const validFixture = {
  post_position: 1 as const,
  day_recommended: 'Mar' as const,
  hour_recommended: '08:30',
  confidence: 0.82,
  rationale:
    'Mardi 08:30 reste le pic observé sur les analyses lucides du panel. Audience dirigeante en pré-réunion.',
  alternative_slot: {
    day: 'Jeu' as const,
    hour: '09:00',
  },
};

describe('timingRecommendationSchema', () => {
  it('parses a realistic timing recommendation at HH:30', () => {
    const result = timingRecommendationSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hour_recommended).toBe('08:30');
      expect(result.data.confidence).toBeGreaterThan(0);
    }
  });

  it('rejects an hour that is not on the hour or half-hour', () => {
    const invalid = { ...validFixture, hour_recommended: '08:15' };
    const result = timingRecommendationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
