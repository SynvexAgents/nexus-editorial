import { z } from 'zod';

export const topicClusterPreEnum = z.enum([
  'pilotage',
  'commercial',
  'reglementaire',
  'operationnel',
  'tech_ia',
  'marche_assurance',
  'autre',
]);

export const filterReasonEnum = z.enum([
  'off_watchlist',
  'too_short',
  'non_fr',
  'self_promo',
  'below_author_baseline',
]);

export const cleanPostSchema = z.object({
  post_id: z.string().min(1),
  engagement_score_normalized: z.number(),
  is_relevant: z.boolean(),
  topic_cluster_pre: topicClusterPreEnum,
  filter_reason: filterReasonEnum.nullable(),
  processed_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export type CleanPost = z.infer<typeof cleanPostSchema>;
export type TopicClusterPre = z.infer<typeof topicClusterPreEnum>;
export type FilterReason = z.infer<typeof filterReasonEnum>;
