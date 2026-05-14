import type { VisualDecision, WeeklyWinner, WeeklyWinners } from '@nexus/shared';
import { describe, expect, it, vi } from 'vitest';
import { postProcessVisuals } from '../visual-decision-post-processor.js';
import { type AnthropicLike, type VisualsArray, decideVisuals } from '../visual-decision.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWinner(position: 1 | 2 | 3, over: Partial<WeeklyWinner> = {}): WeeklyWinner {
  const base: WeeklyWinner = {
    post_position: position,
    winner_id: `W20-A${position}`,
    fusion_used: false,
    scoring: [],
    rationale_strategique: 'rationale',
    post_final: 'Post final test contenant un constat lucide.',
    hook_variantes: ['Hook A.', 'Hook B.', 'Hook C.'],
    cta_recommande: 'aucun CTA',
    longueur_finale: 50,
    checklist_qualite_passee: {
      anti_cliche_ok: true,
      ancrage_actu_assurance_ok: true,
      ton_synvex_ok: true,
      longueur_alignee_tendance_ok: true,
      absence_survente_ok: true,
      vocabulaire_metier_ok: true,
    },
  };
  return { ...base, ...over };
}

function makeWinners(): WeeklyWinners {
  return [
    makeWinner(1, { longueur_finale: 480 }),
    makeWinner(2, { longueur_finale: 1000 }),
    makeWinner(3, { longueur_finale: 1500 }),
  ] as WeeklyWinners;
}

function makeVisual(position: 1 | 2 | 3, over: Partial<VisualDecision> = {}): VisualDecision {
  // Par défaut : pas de visuel recommandé (cas du constat sec).
  const base: VisualDecision = {
    post_position: position,
    visual_recommended: false,
    visual_reason: 'Le texte porte seul, ajouter un visuel diluerait le constat.',
    visual_type: 'aucun',
    gamma_prompt: '',
  };
  return { ...base, ...over };
}

function makeValidVisuals(): VisualsArray {
  return [
    makeVisual(1, {
      visual_recommended: false,
      visual_reason: 'Constat sec court, un visuel diluerait le punch.',
    }),
    makeVisual(2, {
      visual_recommended: true,
      visual_type: 'carrousel_4',
      visual_reason: 'Pédagogie technique : 4 slides pour décomposer la mécanique.',
      gamma_prompt:
        'Carrousel 4 slides minimaliste, palette neutre gris/bleu nuit/blanc, typographie sérieuse. Slide 1 : titre + chiffre clé. Slide 2 : mécanique réglementaire. Slide 3 : impact opérationnel. Slide 4 : conclusion.',
    }),
    makeVisual(3, {
      visual_recommended: true,
      visual_type: 'carrousel_6',
      visual_reason: 'Thèse marché longue : 6 slides pour étapes 2026-2028.',
      gamma_prompt:
        'Carrousel 6 slides minimaliste, palette neutre, typographie sérieuse. Slide 1 : titre thèse marché. Slides 2-5 : étapes 2026, 2027, 2028 avec un chiffre par étape. Slide 6 : implication structurelle. Aucune illustration gimmick.',
    }),
  ] as VisualsArray;
}

const baseUsage = {
  input_tokens: 1500,
  output_tokens: 800,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

function mockClient(textResponses: string[]): {
  client: AnthropicLike;
  create: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const create = vi.fn(async () => {
    const text = textResponses[i] ?? textResponses[textResponses.length - 1]!;
    i += 1;
    return {
      content: [{ type: 'text' as const, text }],
      usage: { ...baseUsage },
      stop_reason: 'end_turn',
    };
  });
  return { client: { messages: { create } }, create };
}

/** Compose un JSON `{visuals: [...]}` sans le `{` initial (prefill Haiku). */
function jsonText(visuals: VisualsArray): string {
  const full = JSON.stringify({ visuals });
  return full.startsWith('{') ? full.slice(1) : full;
}

// ---------------------------------------------------------------------------
// Tests Agent 8 — decideVisuals
// ---------------------------------------------------------------------------

describe('decideVisuals — happy path', () => {
  it('returns 3 valid visuals on first attempt with cost', async () => {
    const visuals = makeValidVisuals();
    const { client, create } = mockClient([jsonText(visuals)]);

    const result = await decideVisuals(makeWinners(), { client });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.retried).toBe(false);
    expect(result.visuals).toHaveLength(3);
    expect(result.visuals[0]!.visual_recommended).toBe(false);
    expect(result.visuals[1]!.visual_recommended).toBe(true);
    // Cost = 1500/1e6 × 1 + 800/1e6 × 5 = 0.0015 + 0.004 = 0.0055 USD
    expect(result.usage.cost_usd).toBeCloseTo(0.0055, 5);
  });
});

describe('decideVisuals — retry on Zod fail (.length() != 3)', () => {
  it('retries when first response has only 2 visuals', async () => {
    const twoVisuals = makeValidVisuals().slice(0, 2) as unknown as VisualsArray;
    const { client, create } = mockClient([jsonText(twoVisuals), jsonText(makeValidVisuals())]);

    const result = await decideVisuals(makeWinners(), { client });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    expect(result.visuals).toHaveLength(3);
  });
});

describe('decideVisuals — throws after 2 Zod failures', () => {
  it('throws when both attempts return invalid Zod', async () => {
    const twoVisuals = makeValidVisuals().slice(0, 2) as unknown as VisualsArray;
    const { client } = mockClient([jsonText(twoVisuals), jsonText(twoVisuals)]);

    await expect(decideVisuals(makeWinners(), { client })).rejects.toThrow(
      /decide_visuals_failed_after_2_attempts/,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests Agent 8 — postProcessVisuals
// ---------------------------------------------------------------------------

describe('postProcessVisuals — override visual_type when recommended=false', () => {
  it('overrides visual_type to "aucun" when visual_recommended is false', () => {
    const visuals: VisualsArray = [
      makeVisual(1, {
        visual_recommended: false,
        visual_type: 'image_unique', // incohérent
        gamma_prompt: '',
      }),
      makeVisual(2),
      makeVisual(3),
    ] as VisualsArray;

    const result = postProcessVisuals(visuals);

    expect(result.visuals[0]!.visual_type).toBe('aucun');
    const ov = result.validation_report.overrides.find(
      (o) => o.post_position === 1 && o.field === 'visual_type',
    );
    expect(ov).toBeDefined();
    expect(ov?.from).toBe('image_unique');
    expect(ov?.to).toBe('aucun');
  });
});

describe('postProcessVisuals — override gamma_prompt when recommended=false', () => {
  it('overrides gamma_prompt to "" when visual_recommended is false but prompt present', () => {
    const visuals: VisualsArray = [
      makeVisual(1, {
        visual_recommended: false,
        visual_type: 'aucun',
        gamma_prompt: 'Prompt qui ne devrait pas être là.',
      }),
      makeVisual(2),
      makeVisual(3),
    ] as VisualsArray;

    const result = postProcessVisuals(visuals);

    expect(result.visuals[0]!.gamma_prompt).toBe('');
    const ov = result.validation_report.overrides.find(
      (o) => o.post_position === 1 && o.field === 'gamma_prompt',
    );
    expect(ov).toBeDefined();
    expect(ov?.to).toBe('');
  });
});

describe('postProcessVisuals — no overrides on valid input', () => {
  it('returns 0 overrides on coherent visuals', () => {
    const result = postProcessVisuals(makeValidVisuals());
    expect(result.validation_report.overrides).toHaveLength(0);
    expect(result.validation_report.critical_flags).toHaveLength(0);
    expect(result.validation_report.visual_recommended_count).toBe(2);
  });
});

describe('postProcessVisuals — counts visual_recommended correctly', () => {
  it('counts how many visuals have visual_recommended=true', () => {
    const visuals: VisualsArray = [
      makeVisual(1, { visual_recommended: false }),
      makeVisual(2, { visual_recommended: false }),
      makeVisual(3, { visual_recommended: false }),
    ] as VisualsArray;
    const result = postProcessVisuals(visuals);
    expect(result.validation_report.visual_recommended_count).toBe(0);
  });
});
