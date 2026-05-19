// supabase/functions/_shared/schemas.ts
// Port des schémas Zod du package @nexus/shared. Deno-compatible
// (esm.sh résout Zod 3). Source de vérité côté monorepo : tests vitest
// pour ces schémas font foi ; le port ici est purement structurel.

import { z } from 'https://esm.sh/zod@3.23.8';

// ----------------------------------------------------------------------------
// PostAnalysis (Agent 3)
// ----------------------------------------------------------------------------
export const hookTypeEnum = z.enum([
  'stat_choc',
  'confession',
  'contrarian',
  'listicle',
  'mini_story',
  'question_provoc',
  'observation_metier',
  'annonce',
  'rant',
]);
export const formatEnum = z.enum([
  'punchline',
  'mini_essai',
  'listicle',
  'storytelling',
  'analyse',
  'retour_experience',
  'data_post',
]);
export const tonEnum = z.enum([
  'lucide',
  'provocateur',
  'pédagogue',
  'confessionnel',
  'analytique',
  'sec',
  'inspirant',
]);
export const ctaTypeEnum = z.enum(['aucun', 'commentaire', 'DM', 'lien', 'question_ouverte']);

export const postAnalysisSchema = z.object({
  post_id: z.string().min(1),
  hook_type: hookTypeEnum,
  hook_extract: z.string().min(1),
  format: formatEnum,
  structure_narrative: z.string().min(1),
  longueur_caracteres: z.number().int().positive(),
  longueur_paragraphes: z.number().int().positive(),
  ton: tonEnum,
  topic_cluster: z.string().min(1),
  topic_specific: z.string().min(1),
  cta_type: ctaTypeEnum,
  mecaniques_attention: z.array(z.string().min(1)).min(1).max(3),
  transferabilite_assurance: z.number().int().min(0).max(10),
  raison_performance_hypothese: z.string().min(1),
});
export type PostAnalysis = z.infer<typeof postAnalysisSchema>;

// ----------------------------------------------------------------------------
// LinkedinTrends (Agent 4)
// ----------------------------------------------------------------------------
export const linkedinTrendsSchema = z.object({
  top_hooks: z.array(
    z.object({
      type: z.string(),
      frequency: z.number().min(0),
      avg_engagement_norm: z.number(),
      example_post_id: z.string().min(1),
    }),
  ),
  top_formats: z.array(
    z.object({
      format: z.string().min(1),
      frequency: z.number().min(0),
      avg_engagement_norm: z.number(),
    }),
  ),
  top_topic_clusters: z.array(
    z.object({
      cluster: z.string().min(1),
      frequency: z.number().min(0),
      avg_engagement_norm: z.number(),
    }),
  ),
  rising_topics: z.array(z.string()),
  falling_topics: z.array(z.string()),
  tone_dominant: z.string().min(1),
  longueur_optimale_p50_p90: z.tuple([z.number(), z.number()]),
  mecaniques_emergentes: z.array(z.string()),
  best_days_observed: z.array(
    z.object({ day: z.string().min(1), avg_engagement_norm: z.number() }),
  ),
  best_hours_observed: z.array(
    z.object({ hour_bucket: z.string().min(1), avg_engagement_norm: z.number() }),
  ),
  format_performance: z.array(
    z.object({ format: z.string().min(1), avg_engagement_norm: z.number() }),
  ),
  ten_best_posts: z
    .array(z.object({ post_id: z.string().min(1), score: z.number(), summary: z.string().min(1) }))
    .max(10),
  synthese_textuelle: z.string().min(1),
});
export type LinkedinTrends = z.infer<typeof linkedinTrendsSchema>;

// ----------------------------------------------------------------------------
// InsuranceTrends (Agent 5)
// ----------------------------------------------------------------------------
export const insuranceTrendItemSchema = z.object({
  titre: z.string().min(1),
  source_url: z.string().url(),
  resume_2_lignes: z.string().min(1),
  date: z.string().datetime({ offset: true }),
  impact_metier: z.string().min(1),
});
export type InsuranceTrendItem = z.infer<typeof insuranceTrendItemSchema>;

export const insuranceTrendsSchema = z.object({
  regulation_acpr: z.array(insuranceTrendItemSchema),
  sinistres_fraude: z.array(insuranceTrendItemSchema),
  courtage_distribution: z.array(insuranceTrendItemSchema),
  mutuelles_complementaires: z.array(insuranceTrendItemSchema),
  insurtech_ia_assurance: z.array(insuranceTrendItemSchema),
  back_office_productivite: z.array(insuranceTrendItemSchema),
  signaux_faibles: z.array(insuranceTrendItemSchema),
  actualites_majeures: z.array(insuranceTrendItemSchema),
  synthese_textuelle: z.string().min(1),
});
export type InsuranceTrends = z.infer<typeof insuranceTrendsSchema>;

// ----------------------------------------------------------------------------
// WeeklyAngles (Agent 6)
// ----------------------------------------------------------------------------
export const archetypeEnum = z.enum([
  'constat_lucide',
  'retour_experience_metier',
  'contrarian_assurance',
  'pedagogie_technique',
  'observation_signal_faible',
  'analyse_donnee',
  'anecdote_terrain',
  'these_marche',
]);
export const longueurCibleEnum = z.enum(['court', 'moyen', 'long']);
export const icpEnum = z.enum(['courtier', 'MGA', 'mutuelle', 'insurtech', 'dirigeant_general']);

// v2 mai 2026 — catalogue Synvex 9 produits pour bridge produit.
export const produitSynvexEnum = z.enum([
  'Orion',
  'Vega',
  'Chiron',
  'Argus',
  'Helios',
  'Hermès',
  'Nexus',
  'Atlas',
  'Cortex',
]);
export type ProduitSynvex = z.infer<typeof produitSynvexEnum>;
export const PRODUITS_SYNVEX: readonly ProduitSynvex[] = [
  'Orion',
  'Vega',
  'Chiron',
  'Argus',
  'Helios',
  'Hermès',
  'Nexus',
  'Atlas',
  'Cortex',
] as const;

export const angleSchema = z.object({
  angle_id: z.string().regex(/^W\d{1,2}-A[1-8]$/),
  archetype: archetypeEnum,
  titre_interne: z.string().min(1),
  hook_brut: z.string().min(1),
  these_centrale: z.string().min(1),
  promesse_lecteur: z.string().min(1),
  structure_proposee: z.string().min(1),
  longueur_cible: longueurCibleEnum,
  tonalite: z.string().min(1),
  ancrage_assurance: z.string().min(1),
  ancrage_linkedin: z.string().min(1),
  icp_vise: icpEnum,
  risques: z.array(z.string()),
  // v2 : optional pour backward compat (angles_json v1 sans le champ).
  produit_synvex_ancrage: produitSynvexEnum.optional(),
});
export type Angle = z.infer<typeof angleSchema>;
export const weeklyAnglesSchema = z.array(angleSchema).length(8);
export type WeeklyAngles = z.infer<typeof weeklyAnglesSchema>;
export type Archetype = z.infer<typeof archetypeEnum>;

// ----------------------------------------------------------------------------
// WeeklyWinners (Agent 7)
// ----------------------------------------------------------------------------
export const postPositionEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const checklistQualiteSchema = z.object({
  anti_cliche_ok: z.boolean(),
  ancrage_actu_assurance_ok: z.boolean(),
  ton_synvex_ok: z.boolean(),
  longueur_alignee_tendance_ok: z.boolean(),
  absence_survente_ok: z.boolean(),
  vocabulaire_metier_ok: z.boolean(),
});
export const fusionUsedSchema = z.union([
  z.literal(false),
  z.tuple([z.string().min(1), z.string().min(1)]),
]);
export const angleScoringSchema = z.object({
  angle_id: z.string().min(1),
  score_total: z.number(),
  // Opus 4.7 omet parfois sous_scores quand le score global est bas.
  // On tolère l'omission en défaultant à un objet vide ; downstream OK.
  sous_scores: z.record(z.string(), z.number()).optional().default({}),
  commentaire: z.string().min(1),
});
export const weeklyWinnerSchema = z.object({
  post_position: postPositionEnum,
  scoring: z.array(angleScoringSchema),
  winner_id: z.string().min(1),
  fusion_used: fusionUsedSchema,
  rationale_strategique: z.string().min(1),
  post_final: z.string().min(1),
  hook_variantes: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  cta_recommande: z.string().min(1),
  longueur_finale: z.number().int().positive(),
  checklist_qualite_passee: checklistQualiteSchema,
  // v2 : optional pour backward compat (winners_json v1 sans le champ).
  produit_synvex_ancrage: produitSynvexEnum.optional(),
});
export type WeeklyWinner = z.infer<typeof weeklyWinnerSchema>;
export const weeklyWinnersSchema = z.array(weeklyWinnerSchema).length(3);
export type WeeklyWinners = z.infer<typeof weeklyWinnersSchema>;

// ----------------------------------------------------------------------------
// VisualDecision (Agent 8)
// ----------------------------------------------------------------------------
export const visualTypeEnum = z.enum([
  'aucun',
  'image_unique',
  'carrousel_4',
  'carrousel_6',
  'data_viz_single',
]);
export const visualDecisionSchema = z
  .object({
    post_position: postPositionEnum,
    visual_recommended: z.boolean(),
    visual_reason: z.string().min(1),
    visual_type: visualTypeEnum,
    gamma_prompt: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.visual_recommended && data.gamma_prompt.length < 50) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gamma_prompt'],
        message: 'gamma_prompt must be ≥ 50 chars when visual_recommended is true',
      });
    }
    if (data.visual_recommended && data.visual_type === 'aucun') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visual_type'],
        message: 'visual_type cannot be "aucun" when visual_recommended is true',
      });
    }
  });
export type VisualDecision = z.infer<typeof visualDecisionSchema>;
export const visualsArraySchema = z.array(visualDecisionSchema).length(3);

// ----------------------------------------------------------------------------
// TimingRecommendation (Agent 9)
// ----------------------------------------------------------------------------
export const dayEnum = z.enum(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']);
export const hourSchema = z.string().regex(/^([01]\d|2[0-3]):(00|30)$/);
export const timingRecommendationSchema = z.object({
  post_position: postPositionEnum,
  day_recommended: dayEnum,
  hour_recommended: hourSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  alternative_slot: z.object({ day: dayEnum, hour: hourSchema }),
});
export type TimingRecommendation = z.infer<typeof timingRecommendationSchema>;
export type Day = z.infer<typeof dayEnum>;
