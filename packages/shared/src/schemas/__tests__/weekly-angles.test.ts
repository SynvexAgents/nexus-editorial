import { describe, expect, it } from 'vitest';
import { type Angle, weeklyAnglesSchema } from '../weekly-angles.schema.js';

const makeAngle = (index: number): Angle => ({
  angle_id: `W21-A${index}`,
  archetype: 'constat_lucide',
  titre_interne: `Angle interne ${index} sur sinistres IARD`,
  hook_brut: `Premier paragraphe constat sec sur le ratio S/P observé en ${index}.`,
  these_centrale: 'Les courtiers sous-estiment encore la dérive du loss ratio Q1.',
  promesse_lecteur:
    "Comprendre pourquoi la prime d'équilibre dérape malgré les hausses tarifaires.",
  structure_proposee: 'Constat chiffré → mécanisme IBNR → arbitrage souscription → ouverture.',
  longueur_cible: 'moyen',
  tonalite: 'lucide et analytique',
  ancrage_assurance: 'Cycles courts IARD pro, segments artisans/commerçants.',
  ancrage_linkedin: 'Format analyse 1200-1500 caractères confirmé par la veille de la semaine.',
  icp_vise: 'courtier',
  risques: ['risque de paraître trop technique', 'éviter cliché "marché qui se durcit"'],
});

const validFixture = Array.from({ length: 8 }, (_, i) => makeAngle(i + 1));

describe('weeklyAnglesSchema', () => {
  it('parses exactly 8 angles with valid IDs and enums', () => {
    const result = weeklyAnglesSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(8);
      expect(result.data[0]?.angle_id).toBe('W21-A1');
    }
  });

  it('rejects an array of 7 angles or a malformed angle_id', () => {
    const tooShort = validFixture.slice(0, 7);
    const result = weeklyAnglesSchema.safeParse(tooShort);
    expect(result.success).toBe(false);

    const badId = [
      ...validFixture.slice(0, 7),
      { ...validFixture[7], angle_id: 'BAD-FORMAT' } as Angle,
    ];
    const result2 = weeklyAnglesSchema.safeParse(badId);
    expect(result2.success).toBe(false);
  });

  it('accepts the v2.3 diversity-engine archetypes (pool of 10)', () => {
    const pool = [
      'constat_lucide',
      'anecdote_terrain',
      'these_marche',
      'question_contre_intuitive',
      'cas_chiffre',
      'take_controversee',
      'decryptage_process',
      'retour_experience',
    ] as const;
    const angles = pool.map((arch, i) => ({ ...makeAngle(i + 1), archetype: arch }) as Angle);
    const result = weeklyAnglesSchema.safeParse(angles);
    expect(result.success).toBe(true);
  });

  it('still accepts legacy archetypes (backward-compat reading of W19-W22)', () => {
    const legacy = { ...makeAngle(1), archetype: 'retour_experience_metier' } as Angle;
    const angles = [legacy, ...validFixture.slice(1)];
    const result = weeklyAnglesSchema.safeParse(angles);
    expect(result.success).toBe(true);
  });
});
