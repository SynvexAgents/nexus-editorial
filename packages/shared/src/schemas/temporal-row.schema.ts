import { z } from 'zod';
import { mediaTypeEnum } from './raw-post.schema.js';

export const dayOfWeekFullEnum = z.enum(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);

export const hourBucketEnum = z.enum([
  '06h-08h',
  '08h-10h',
  '10h-12h',
  '12h-14h',
  '14h-17h',
  '17h-19h',
  '19h-21h',
  'autre',
]);

// Partial map: clé = `MediaType` (string), valeur = part [0..1]. On laisse la
// clé en `z.string()` pour conserver des objets potentiellement partiels
// (les buckets temporels n'ont pas systématiquement tous les media_type).
export const formatDistributionSchema = z.record(z.string(), z.number().min(0).max(1));

export const temporalRowSchema = z.object({
  week_id: z.string().regex(/^\d{4}-W\d{2}$/, {
    message: 'week_id must be ISO yyyy-Www, e.g. 2026-W21',
  }),
  day_of_week: dayOfWeekFullEnum,
  hour_bucket: hourBucketEnum,
  posts_count: z.number().int().positive(),
  avg_engagement_norm: z.number(),
  top_format: mediaTypeEnum,
  format_distribution: formatDistributionSchema,
});

export type TemporalRow = z.infer<typeof temporalRowSchema>;
export type DayOfWeek = z.infer<typeof dayOfWeekFullEnum>;
export type HourBucket = z.infer<typeof hourBucketEnum>;
