import { describe, expect, it } from 'vitest';
import { visualDecisionSchema } from '../visual-decision.schema.js';

// Brief Gamma v2.1 structuré : 500-800c cible, 400-1000c bornes Zod.
const VALID_BRIEF_650C = [
  'Carrousel LinkedIn 4 slides, format portrait 4:5.',
  "Slide 1 : 'Ratio S/P courtage IARD : ce qui change en 2026' / 'Le contexte ACPR et son effet domino'.",
  "Slide 2 : 'Mécanique réglementaire' / 'Sanction 13 mai' / 'Devoir de conseil documenté' / 'Périmètre délégataires étendu'.",
  "Slide 3 : 'Impact opérationnel' / '3 sur 12' / 'cabinets tiennent un tirage au sort de 3 dossiers'.",
  "Slide 4 : 'Question terrain' / 'Comment vous documentez le conseil aujourd hui ?'",
  'Hiérarchie : titre 64pt slide 1, chiffre 120pt slide 3, body 20pt ailleurs.',
  'Palette : fond #0F1419, texte #F5F5F0, accent #7C3AED. Typo Inter (Bold titres, Regular body, Semibold chiffres). Tone sobre premium. Zéro emoji.',
].join('\n');

const validFixture = {
  post_position: 1 as const,
  visual_recommended: true,
  visual_reason:
    "Post analytique long: un carrousel 4 slides structure l'argumentation et améliore la rétention.",
  visual_type: 'carrousel_4' as const,
  gamma_prompt: VALID_BRIEF_650C,
};

describe('visualDecisionSchema', () => {
  it('parses a recommended visual with structured 500-800c gamma_prompt', () => {
    const result = visualDecisionSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visual_recommended).toBe(true);
      expect(result.data.visual_type).toBe('carrousel_4');
      expect(result.data.gamma_prompt.length).toBeGreaterThanOrEqual(400);
      expect(result.data.gamma_prompt.length).toBeLessThanOrEqual(1000);
    }
  });

  it('rejects when visual_recommended=true and gamma_prompt < 400 chars (v2.1 floor)', () => {
    const invalid = { ...validFixture, gamma_prompt: 'a'.repeat(399) };
    const result = visualDecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'gamma_prompt');
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/at least 400/);
    }
  });

  it('accepts gamma_prompt at 1300 chars (under v2.2 hard cap 1400)', () => {
    const valid = { ...validFixture, gamma_prompt: 'a'.repeat(1300) };
    const result = visualDecisionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects when visual_recommended=true and gamma_prompt > 1400 chars (v2.2 hard cap)', () => {
    const invalid = { ...validFixture, gamma_prompt: 'a'.repeat(1401) };
    const result = visualDecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'gamma_prompt');
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/at most 1400/);
    }
  });

  it('accepts gamma_prompt at the exact bounds (400 and 1400)', () => {
    const at400 = { ...validFixture, gamma_prompt: 'a'.repeat(400) };
    const at1400 = { ...validFixture, gamma_prompt: 'a'.repeat(1400) };
    expect(visualDecisionSchema.safeParse(at400).success).toBe(true);
    expect(visualDecisionSchema.safeParse(at1400).success).toBe(true);
  });

  it('rejects 399c (just under the min 400)', () => {
    const invalid = { ...validFixture, gamma_prompt: 'a'.repeat(399) };
    const result = visualDecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'gamma_prompt');
      expect(issue?.message).toMatch(/at least 400/);
    }
  });

  it('accepts empty gamma_prompt when visual_recommended=false', () => {
    const result = visualDecisionSchema.safeParse({
      ...validFixture,
      visual_recommended: false,
      visual_type: 'aucun' as const,
      gamma_prompt: '',
    });
    expect(result.success).toBe(true);
  });
});
