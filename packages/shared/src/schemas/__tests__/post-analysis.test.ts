import { describe, expect, it } from 'vitest';
import { postAnalysisSchema } from '../post-analysis.schema.js';

const validFixture = {
  post_id: 'urn:li:activity:7165432109876543210',
  hook_type: 'observation_metier' as const,
  hook_extract:
    "Les courtiers parlent encore de digitalisation. Les compagnies ont déjà bougé. L'écart se creuse.",
  format: 'analyse' as const,
  structure_narrative: 'Constat → mécanisme → conséquence métier',
  longueur_caracteres: 1340,
  longueur_paragraphes: 6,
  ton: 'lucide' as const,
  topic_cluster: 'distribution_assurance',
  topic_specific: 'digitalisation_courtiers_iard',
  cta_type: 'commentaire' as const,
  mecaniques_attention: ['chiffre concret en intro', 'opposition courtier/compagnie'],
  transferabilite_assurance: 8,
  raison_performance_hypothese:
    'Ancrage métier précis sans hype. Audience cible (courtiers IARD) reconnaît le constat.',
};

describe('postAnalysisSchema', () => {
  it('parses a realistic FR courtier post analysis', () => {
    const result = postAnalysisSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.transferabilite_assurance).toBe(8);
      expect(result.data.hook_type).toBe('observation_metier');
    }
  });

  it('rejects transferabilite_assurance outside [0,10]', () => {
    const invalid = { ...validFixture, transferabilite_assurance: 15 };
    const result = postAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'transferabilite_assurance',
      );
      expect(issue).toBeDefined();
    }
  });
});
