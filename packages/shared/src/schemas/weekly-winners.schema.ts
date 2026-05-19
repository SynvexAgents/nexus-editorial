import { z } from 'zod';
import { produitSynvexEnum } from './weekly-angles.schema.js';

export const postPositionEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const angleScoringSchema = z.object({
  angle_id: z.string().min(1),
  score_total: z.number(),
  sous_scores: z.record(z.string(), z.number()),
  commentaire: z.string().min(1),
});

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
  // Champ v2 (mai 2026) : produit Synvex d'ancrage de ce winner.
  // Hérité de l'angle source par Agent 7 ; rempli en post-processing
  // si fusion. .optional() pour rester backward compatible avec les
  // winners_json v1 (W19, W20).
  produit_synvex_ancrage: produitSynvexEnum.optional(),
});

export const weeklyWinnersSchema = z.array(weeklyWinnerSchema).length(3, {
  message: 'weekly winners must contain exactly 3 entries',
});

export type PostPosition = z.infer<typeof postPositionEnum>;
export type ChecklistQualite = z.infer<typeof checklistQualiteSchema>;
export type FusionUsed = z.infer<typeof fusionUsedSchema>;
export type WeeklyWinner = z.infer<typeof weeklyWinnerSchema>;
export type WeeklyWinners = z.infer<typeof weeklyWinnersSchema>;
