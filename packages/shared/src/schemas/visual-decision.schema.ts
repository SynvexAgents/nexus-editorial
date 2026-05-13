import { z } from 'zod';
import { postPositionEnum } from './weekly-winners.schema.js';

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
        message: 'gamma_prompt must be at least 50 chars when visual_recommended is true',
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

export type VisualType = z.infer<typeof visualTypeEnum>;
export type VisualDecision = z.infer<typeof visualDecisionSchema>;
