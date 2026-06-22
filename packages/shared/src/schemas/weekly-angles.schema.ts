import { z } from 'zod';

// Union de l'ancien set fixe (v1/v2, W19-W22) + des 7 archétypes ajoutés
// au "diversity engine" (v2.3, mai 2026). L'enum reste un SUPER-ENSEMBLE pour
// que les angles_json historiques (anciens noms) restent parsables. La
// GÉNÉRATION (Agent 6) est désormais cadrée vers le POOL DE 10 actif
// (cf. ARCHETYPE_POOL dans editorial-memory.ts) ; les 5 anciens archétypes
// hors-pool (retour_experience_metier, contrarian_assurance, pedagogie_technique,
// observation_signal_faible, analyse_donnee) ne sont conservés ici que pour la
// rétro-compatibilité de lecture.
export const archetypeEnum = z.enum([
  // --- Pool actif (10) ---
  'constat_lucide',
  'anecdote_terrain',
  'these_marche',
  'question_contre_intuitive',
  'cas_chiffre',
  'take_controversee',
  'decryptage_process',
  'retour_experience',
  'lettre_ouverte',
  'comparaison_cross_secteur',
  // --- Anciens archétypes (lecture rétro-compatible uniquement) ---
  'retour_experience_metier',
  'contrarian_assurance',
  'pedagogie_technique',
  'observation_signal_faible',
  'analyse_donnee',
]);

export const longueurCibleEnum = z.enum(['court', 'moyen', 'long']);

export const icpEnum = z.enum(['courtier', 'MGA', 'mutuelle', 'insurtech', 'dirigeant_general']);

// Catalogue Synvex 2026 — 9 produits. Source de vérité pour la
// rotation équitable de bridge produit (stratégie v2 mai 2026).
// Cf. docs/synvex-context-brief.md §9 pour les fiches détaillées.
export const produitSynvexEnum = z.enum([
  'Orion', // Acquisition B2B done-for-you
  'Vega', // Veille & réponse appels d'offres assurance
  'Chiron', // Remboursement santé humaine+animale + pilotage S/P
  'Argus', // Agent sinistres IARD pro + Control Layer
  'Helios', // Pilotage sinistralité prévoyance / IJ
  'Hermès', // Pilotage cabinet courtage (4 fuites)
  'Nexus', // Performance Intelligence Platform transversale
  'Atlas', // Agent IA quotidien cabinet courtage
  'Cortex', // Plateforme IA sinistres bout-en-bout multi-marques
]);

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
  // Champ v2 (mai 2026) : produit Synvex d'ancrage pour cet angle.
  // .optional() pour rester backward compatible avec les angles_json
  // produits en v1 (W19, W20). Toute génération v2 et au-delà doit
  // toujours fournir le champ — validé en post-processing.
  produit_synvex_ancrage: produitSynvexEnum.optional(),
});

export const weeklyAnglesSchema = z.array(angleSchema).length(8, {
  message: 'weekly angles must contain exactly 8 entries',
});

export type Archetype = z.infer<typeof archetypeEnum>;
export type LongueurCible = z.infer<typeof longueurCibleEnum>;
export type Icp = z.infer<typeof icpEnum>;
export type ProduitSynvex = z.infer<typeof produitSynvexEnum>;
export type Angle = z.infer<typeof angleSchema>;
export type WeeklyAngles = z.infer<typeof weeklyAnglesSchema>;

/** Liste fixe ordonnée des 9 produits. Utilisée pour la rotation équitable. */
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
