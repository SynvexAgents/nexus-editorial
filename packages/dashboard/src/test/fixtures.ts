import type {
  Angle,
  TimingRecommendation,
  VisualDecision,
  WeeklyReportRow,
  WeeklyWinner,
} from '../lib/types';

export function makeAngle(over: Partial<Angle> = {}): Angle {
  return {
    angle_id: 'W20-A1',
    archetype: 'constat_lucide',
    titre_interne: 'Titre test',
    hook_brut: 'Hook brut.',
    these_centrale: 'Thèse.',
    promesse_lecteur: 'Promesse.',
    structure_proposee: 'Constat → mécanique.',
    longueur_cible: 'court',
    tonalite: 'sec',
    ancrage_assurance: 'Ratio S/P.',
    ancrage_linkedin: 'Hook chiffre.',
    icp_vise: 'courtier',
    risques: ['ton'],
    ...over,
  };
}

export function makeWinner(over: Partial<WeeklyWinner> = {}): WeeklyWinner {
  return {
    post_position: 1,
    winner_id: 'W20-A1',
    fusion_used: false,
    scoring: [
      {
        angle_id: 'W20-A1',
        score_total: 7.5,
        sous_scores: { engagement_potentiel: 8 },
        commentaire: 'OK',
      },
    ],
    rationale_strategique: 'Couvre le pan opé.',
    post_final:
      'Le ratio S/P en MRP collective se compresse. Les courtiers absorbent. La marge se réduit silencieusement.',
    hook_variantes: ['Hook A.', 'Hook B.', 'Hook C.'],
    cta_recommande: 'aucun CTA',
    longueur_finale: 100,
    checklist_qualite_passee: {
      anti_cliche_ok: true,
      ancrage_actu_assurance_ok: true,
      ton_synvex_ok: true,
      longueur_alignee_tendance_ok: true,
      absence_survente_ok: true,
      vocabulaire_metier_ok: true,
    },
    ...over,
  };
}

export function makeVisual(over: Partial<VisualDecision> = {}): VisualDecision {
  return {
    post_position: 1,
    visual_recommended: false,
    visual_reason: 'Texte porte seul.',
    visual_type: 'aucun',
    gamma_prompt: '',
    ...over,
  };
}

export function makeTiming(over: Partial<TimingRecommendation> = {}): TimingRecommendation {
  return {
    post_position: 1,
    day_recommended: 'Mar',
    hour_recommended: '09:00',
    confidence: 0.8,
    rationale: 'Mar 09:00 pic.',
    alternative_slot: { day: 'Lun', hour: '09:00' },
    ...over,
  };
}

export function makeReport(over: Partial<WeeklyReportRow> = {}): WeeklyReportRow {
  return {
    week_id: '2026-W20',
    produced_at: '2026-05-14T22:30:00+02:00',
    linkedin_trends_json: null,
    insurance_trends_json: null,
    angles_json: [makeAngle()],
    winners_json: [makeWinner()],
    visuals_json: [makeVisual()],
    timing_json: [makeTiming()],
    human_validated: false,
    human_notes: null,
    ...over,
  };
}
