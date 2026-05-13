import { z } from 'zod';

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

export const angleSchema = z.object({
  angle_id: z.string().regex(/^W\d{1,2}-A[1-8]$/, {
    message: 'angle_id must match pattern W{week}-A{1..8}, e.g. W21-A3',
  }),
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
});

export const weeklyAnglesSchema = z.array(angleSchema).length(8, {
  message: 'weekly angles must contain exactly 8 entries',
});

export type Archetype = z.infer<typeof archetypeEnum>;
export type LongueurCible = z.infer<typeof longueurCibleEnum>;
export type Icp = z.infer<typeof icpEnum>;
export type Angle = z.infer<typeof angleSchema>;
export type WeeklyAngles = z.infer<typeof weeklyAnglesSchema>;
