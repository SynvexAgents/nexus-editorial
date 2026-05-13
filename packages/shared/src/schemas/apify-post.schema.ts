import { z } from 'zod';

/**
 * Schéma minimal validé en sortie de chaque acteur Apify, après mapping vers
 * un format normalisé interne. Toute sortie qui n'a pas ces 4 champs part en
 * DLQ avec error_reason.
 */
export const apifyPostMinimalSchema = z.object({
  post_id: z.string().min(1),
  author_id: z.string().min(1),
  published_at: z.string().datetime({ offset: true }),
  text: z.string().min(1),
});

/**
 * Schéma "post normalisé Apify" : ce que chaque mapper d'acteur retourne en
 * sortie. Plus riche que le minimal — inclut métriques d'engagement et media.
 * Aligné sur la colonne raw_posts (mais sans calculer day_of_week / hour_of_day
 * — ça se fait au moment de l'insertion).
 */
export const apifyPostNormalizedSchema = apifyPostMinimalSchema.extend({
  url: z.string().nullable(),
  likes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  reposts: z.number().int().nonnegative().default(0),
  views: z.number().int().nonnegative().nullable(),
  media_type: z.enum(['texte', 'image', 'carrousel', 'video', 'document']),
  comment_sample: z
    .array(
      z.object({
        author: z.string(),
        text: z.string(),
        likes: z.number().int().nonnegative().default(0),
      }),
    )
    .nullable(),
});

export type ApifyPostMinimal = z.infer<typeof apifyPostMinimalSchema>;
export type ApifyPostNormalized = z.infer<typeof apifyPostNormalizedSchema>;
