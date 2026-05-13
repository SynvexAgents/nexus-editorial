import { describe, expect, it } from 'vitest';
import { type WeeklyWinner, weeklyWinnersSchema } from '../weekly-winners.schema.js';

const makeWinner = (position: 1 | 2 | 3): WeeklyWinner => ({
  post_position: position,
  scoring: [
    {
      angle_id: `W21-A${position}`,
      score_total: 0.84,
      sous_scores: {
        actualite: 0.9,
        defendabilite: 0.8,
        risque: 0.7,
        adequation_voix: 0.9,
      },
      commentaire: 'Score solide, ancrage actualité ACPR la rend défendable.',
    },
  ],
  winner_id: `W21-A${position}`,
  fusion_used: false as const,
  rationale_strategique:
    "Position 1 capitalise sur l'actualité ACPR. Pas de fusion: l'angle se suffit à lui-même et la dilution affaiblirait le constat.",
  post_final:
    "Les courtiers IARD parlent encore de digitalisation. Les compagnies ont déjà bougé.\n\nL'écart se creuse depuis 18 mois...",
  hook_variantes: [
    'Les courtiers IARD parlent encore de digitalisation.',
    "L'écart compagnies / courtiers se creuse depuis 18 mois.",
    'Trois compagnies ont basculé en STP cette année. Les courtiers regardent.',
  ] as [string, string, string],
  cta_recommande: 'Question ouverte: où en êtes-vous sur la délégation de souscription ?',
  longueur_finale: 1420,
  checklist_qualite_passee: {
    anti_cliche_ok: true,
    ancrage_actu_assurance_ok: true,
    ton_synvex_ok: true,
    longueur_alignee_tendance_ok: true,
    absence_survente_ok: true,
    vocabulaire_metier_ok: true,
  },
});

const validFixture: WeeklyWinner[] = [makeWinner(1), makeWinner(2), makeWinner(3)];

describe('weeklyWinnersSchema', () => {
  it('parses exactly 3 winners with valid checklist and fusion=false', () => {
    const result = weeklyWinnersSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data[0]?.checklist_qualite_passee.anti_cliche_ok).toBe(true);
    }
  });

  it('rejects when hook_variantes does not have exactly 3 entries', () => {
    const invalid = [
      { ...validFixture[0], hook_variantes: ['only one'] as unknown as [string, string, string] },
      validFixture[1],
      validFixture[2],
    ];
    const result = weeklyWinnersSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
