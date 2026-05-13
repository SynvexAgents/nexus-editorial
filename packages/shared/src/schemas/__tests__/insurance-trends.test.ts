import { describe, expect, it } from 'vitest';
import { insuranceTrendsSchema } from '../insurance-trends.schema.js';

const validItem = {
  titre: 'ACPR publie sa doctrine sur la gouvernance IA en assurance',
  source_url: 'https://acpr.banque-france.fr/communique-2026-05-doctrine-ia',
  resume_2_lignes:
    'Doctrine clarifiant les attendus en gouvernance et explicabilité des modèles IA chez les assureurs. Échéance conformité Q4 2027.',
  date: '2026-05-12T09:00:00+02:00',
  impact_metier:
    'Tout déploiement IA en souscription, sinistres ou tarification devra documenter sa chaîne de validation humaine.',
};

const validFixture = {
  regulation_acpr: [validItem],
  sinistres_fraude: [],
  courtage_distribution: [
    {
      titre: 'Consolidation accélérée des cabinets IARD',
      source_url: 'https://argusdelassurance.com/article-consolidation-2026',
      resume_2_lignes:
        'Trois opérations majeures sur le marché du courtage régional cette semaine. Pression sur les commissions linéaires.',
      date: '2026-05-10T11:00:00+02:00',
      impact_metier:
        'Recomposition de la carte des apporteurs, pression sur les rétrocessions des MGA.',
    },
  ],
  mutuelles_complementaires: [],
  insurtech_ia_assurance: [],
  back_office_productivite: [],
  signaux_faibles: [],
  actualites_majeures: [],
  synthese_textuelle:
    "Semaine marquée par la doctrine ACPR sur l'IA et une nouvelle vague de consolidation des courtiers IARD.",
};

describe('insuranceTrendsSchema', () => {
  it('parses a realistic weekly insurance trends report with one ACPR item', () => {
    const result = insuranceTrendsSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.regulation_acpr[0]?.source_url).toMatch(/^https:\/\/acpr/);
    }
  });

  it('rejects an item with a non-URL source_url', () => {
    const invalid = {
      ...validFixture,
      regulation_acpr: [{ ...validItem, source_url: 'not-a-valid-url' }],
    };
    const result = insuranceTrendsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
