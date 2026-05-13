import { z } from 'zod';

export const mediaTypeEnum = z.enum(['texte', 'image', 'carrousel', 'video', 'document']);

export const commentSampleItemSchema = z.object({
  author: z.string(),
  text: z.string(),
  likes: z.number().int().nonnegative().default(0),
});

export const rawPostSchema = z.object({
  post_id: z.string().min(1),
  profile_id: z.string().min(1).nullable(),
  published_at: z.string().datetime({ offset: true }),
  day_of_week: z.string().nullable(),
  hour_of_day: z.number().int().min(0).max(23).nullable(),
  text: z.string().nullable(),
  media_type: z.string().nullable(),
  likes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  reposts: z.number().int().nonnegative().default(0),
  views_estimees: z.number().int().nonnegative().nullable(),
  url: z.string().nullable(),
  comment_sample: z.array(commentSampleItemSchema).nullable(),
  collected_at: z.string().datetime({ offset: true }).nullable().optional(),
  source_actor: z.string().nullable().optional(),
});

export type RawPost = z.infer<typeof rawPostSchema>;
export type CommentSample = z.infer<typeof commentSampleItemSchema>;
export type MediaType = z.infer<typeof mediaTypeEnum>;
