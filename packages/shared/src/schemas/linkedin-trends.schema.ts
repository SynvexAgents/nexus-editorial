import { z } from 'zod';

const hookFrequencySchema = z.object({
  type: z.string().min(1),
  frequency: z.number().nonnegative(),
  avg_engagement_norm: z.number(),
  example_post_id: z.string().min(1),
});

const formatFrequencySchema = z.object({
  format: z.string().min(1),
  frequency: z.number().nonnegative(),
  avg_engagement_norm: z.number(),
});

const topicClusterFrequencySchema = z.object({
  cluster: z.string().min(1),
  frequency: z.number().nonnegative(),
  avg_engagement_norm: z.number(),
});

const dayPerformanceSchema = z.object({
  day: z.string().min(1),
  avg_engagement_norm: z.number(),
});

const hourPerformanceSchema = z.object({
  hour_bucket: z.string().min(1),
  avg_engagement_norm: z.number(),
});

const formatPerformanceSchema = z.object({
  format: z.string().min(1),
  avg_engagement_norm: z.number(),
});

const bestPostSchema = z.object({
  post_id: z.string().min(1),
  score: z.number(),
  summary: z.string().min(1),
});

export const linkedinTrendsSchema = z.object({
  top_hooks: z.array(hookFrequencySchema),
  top_formats: z.array(formatFrequencySchema),
  top_topic_clusters: z.array(topicClusterFrequencySchema),
  rising_topics: z.array(z.string()),
  falling_topics: z.array(z.string()),
  tone_dominant: z.string().min(1),
  longueur_optimale_p50_p90: z.tuple([z.number(), z.number()]),
  mecaniques_emergentes: z.array(z.string()),
  best_days_observed: z.array(dayPerformanceSchema),
  best_hours_observed: z.array(hourPerformanceSchema),
  format_performance: z.array(formatPerformanceSchema),
  ten_best_posts: z.array(bestPostSchema).max(10),
  synthese_textuelle: z.string().min(1),
});

export type LinkedinTrends = z.infer<typeof linkedinTrendsSchema>;
