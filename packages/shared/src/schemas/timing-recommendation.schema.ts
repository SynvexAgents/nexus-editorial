import { z } from 'zod';
import { postPositionEnum } from './weekly-winners.schema.js';

export const dayEnum = z.enum(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']);

const hourPattern = /^([01]\d|2[0-3]):(00|30)$/;

export const hourSchema = z.string().regex(hourPattern, {
  message: 'hour must be HH:00 or HH:30, 24h format (e.g. 08:30, 14:00)',
});

const alternativeSlotSchema = z.object({
  day: dayEnum,
  hour: hourSchema,
});

export const timingRecommendationSchema = z.object({
  post_position: postPositionEnum,
  day_recommended: dayEnum,
  hour_recommended: hourSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  alternative_slot: alternativeSlotSchema,
});

export type Day = z.infer<typeof dayEnum>;
export type TimingRecommendation = z.infer<typeof timingRecommendationSchema>;
