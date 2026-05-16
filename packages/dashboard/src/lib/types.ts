// Types métier UI Nexus Editorial. Miroirs simplifiés des schémas
// Zod côté backend (packages/shared/src/schemas/) — copiés ici en
// pur TypeScript pour rester self-contained côté front (le bundle
// Vite n'importe pas Zod inutilement).

export type Archetype =
  | 'constat_lucide'
  | 'retour_experience_metier'
  | 'contrarian_assurance'
  | 'pedagogie_technique'
  | 'observation_signal_faible'
  | 'analyse_donnee'
  | 'anecdote_terrain'
  | 'these_marche';

export type LongueurCible = 'court' | 'moyen' | 'long';
export type Icp = 'courtier' | 'MGA' | 'mutuelle' | 'insurtech' | 'dirigeant_general';
export type VisualType =
  | 'aucun'
  | 'image_unique'
  | 'carrousel_4'
  | 'carrousel_6'
  | 'data_viz_single';
export type Day = 'Lun' | 'Mar' | 'Mer' | 'Jeu' | 'Ven';
export type PostPosition = 1 | 2 | 3;

export interface Angle {
  angle_id: string;
  archetype: Archetype;
  titre_interne: string;
  hook_brut: string;
  these_centrale: string;
  promesse_lecteur: string;
  structure_proposee: string;
  longueur_cible: LongueurCible;
  tonalite: string;
  ancrage_assurance: string;
  ancrage_linkedin: string;
  icp_vise: Icp;
  risques: string[];
}

export interface ChecklistQualite {
  anti_cliche_ok: boolean;
  ancrage_actu_assurance_ok: boolean;
  ton_synvex_ok: boolean;
  longueur_alignee_tendance_ok: boolean;
  absence_survente_ok: boolean;
  vocabulaire_metier_ok: boolean;
}

export type ChecklistKey = keyof ChecklistQualite;

export interface AngleScoring {
  angle_id: string;
  score_total: number;
  sous_scores: Record<string, number>;
  commentaire: string;
}

export interface WeeklyWinner {
  post_position: PostPosition;
  winner_id: string;
  fusion_used: false | [string, string];
  scoring: AngleScoring[];
  rationale_strategique: string;
  post_final: string;
  hook_variantes: [string, string, string];
  cta_recommande: string;
  longueur_finale: number;
  checklist_qualite_passee: ChecklistQualite;
}

export interface VisualDecision {
  post_position: PostPosition;
  visual_recommended: boolean;
  visual_reason: string;
  visual_type: VisualType;
  gamma_prompt: string;
}

export interface TimingRecommendation {
  post_position: PostPosition;
  day_recommended: Day;
  hour_recommended: string;
  confidence: number;
  rationale: string;
  alternative_slot: { day: Day; hour: string };
}

export interface InsuranceTrendItem {
  titre: string;
  source_url: string;
  resume_2_lignes: string;
  date: string;
  impact_metier: string;
}

export interface InsuranceTrends {
  regulation_acpr: InsuranceTrendItem[];
  sinistres_fraude: InsuranceTrendItem[];
  courtage_distribution: InsuranceTrendItem[];
  mutuelles_complementaires: InsuranceTrendItem[];
  insurtech_ia_assurance: InsuranceTrendItem[];
  back_office_productivite: InsuranceTrendItem[];
  signaux_faibles: InsuranceTrendItem[];
  actualites_majeures: InsuranceTrendItem[];
  synthese_textuelle: string;
}

export interface LinkedinTrends {
  top_hooks: Array<{
    type: string;
    frequency: number;
    avg_engagement_norm: number;
    example_post_id: string;
  }>;
  top_formats: Array<{ format: string; frequency: number; avg_engagement_norm: number }>;
  top_topic_clusters: Array<{ cluster: string; frequency: number; avg_engagement_norm: number }>;
  rising_topics: string[];
  falling_topics: string[];
  tone_dominant: string;
  longueur_optimale_p50_p90: [number, number];
  mecaniques_emergentes: string[];
  best_days_observed: Array<{ day: string; avg_engagement_norm: number }>;
  best_hours_observed: Array<{ hour_bucket: string; avg_engagement_norm: number }>;
  format_performance: Array<{ format: string; avg_engagement_norm: number }>;
  ten_best_posts: Array<{ post_id: string; score: number; summary: string }>;
  synthese_textuelle: string;
}

export interface WeeklyReportRow {
  week_id: string;
  produced_at: string | null;
  linkedin_trends_json: LinkedinTrends | null;
  insurance_trends_json: InsuranceTrends | null;
  angles_json: Angle[] | null;
  winners_json: WeeklyWinner[] | null;
  visuals_json: VisualDecision[] | null;
  timing_json: TimingRecommendation[] | null;
  human_validated: boolean | null;
  human_notes: string | null;
}

export interface EditorialPerformanceInput {
  week_id: string;
  post_position: PostPosition;
  post_id_internal: string;
  published_at?: string;
  archetype: Archetype;
  icp_vise: Icp;
  likes_7d: number;
  comments_7d: number;
  reposts_7d: number;
  impressions_7d: number;
  dm_received: number;
  notes_qualite?: string;
}

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  constat_lucide: 'Constat lucide',
  retour_experience_metier: "Retour d'expérience",
  contrarian_assurance: 'Contrarian',
  pedagogie_technique: 'Pédagogie technique',
  observation_signal_faible: 'Signal faible',
  analyse_donnee: 'Analyse de donnée',
  anecdote_terrain: 'Anecdote terrain',
  these_marche: 'Thèse de marché',
};

export const ICP_LABELS: Record<Icp, string> = {
  courtier: 'Courtier',
  MGA: 'MGA',
  mutuelle: 'Mutuelle',
  insurtech: 'Insurtech',
  dirigeant_general: 'Dirigeant général',
};

export const LONGUEUR_LABELS: Record<LongueurCible, string> = {
  court: 'Court (< 500c)',
  moyen: 'Moyen (500–1200c)',
  long: 'Long (> 1200c)',
};

export const VISUAL_TYPE_LABELS: Record<VisualType, string> = {
  aucun: 'Aucun',
  image_unique: 'Image unique',
  carrousel_4: 'Carrousel 4 slides',
  carrousel_6: 'Carrousel 6 slides',
  data_viz_single: 'Data viz',
};

export const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  anti_cliche_ok: 'Anti-cliché',
  ancrage_actu_assurance_ok: 'Ancrage actu',
  ton_synvex_ok: 'Ton Synvex',
  longueur_alignee_tendance_ok: 'Longueur alignée',
  absence_survente_ok: 'Pas de survente',
  vocabulaire_metier_ok: 'Vocabulaire métier',
};
