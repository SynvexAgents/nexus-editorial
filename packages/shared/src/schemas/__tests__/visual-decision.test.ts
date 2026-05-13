import { describe, expect, it } from 'vitest';
import { visualDecisionSchema } from '../visual-decision.schema.js';

const validFixture = {
  post_position: 1 as const,
  visual_recommended: true,
  visual_reason:
    "Post analytique long: un carrousel 4 slides structure l'argumentation et améliore la rétention.",
  visual_type: 'carrousel_4' as const,
  gamma_prompt:
    'Carrousel 4 slides, fond blanc cassé, typo sans-serif sombre. Slide 1 titre "Ratio S/P courtage IARD: ce qui change en 2026". Slide 2-3 chiffres. Slide 4 question ouverte. Pas d\'icônes décoratives.',
};

describe('visualDecisionSchema', () => {
  it('parses a recommended visual with gamma_prompt > 50 chars', () => {
    const result = visualDecisionSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visual_recommended).toBe(true);
      expect(result.data.visual_type).toBe('carrousel_4');
    }
  });

  it('rejects when visual_recommended=true but gamma_prompt is too short', () => {
    const invalid = { ...validFixture, gamma_prompt: 'too short' };
    const result = visualDecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'gamma_prompt');
      expect(issue).toBeDefined();
    }
  });
});
