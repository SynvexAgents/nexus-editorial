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
    // v2.1 (mai 2026) : brief Gamma structuré 500-800c, bornes Zod 400-1000c.
    // Au-dessous de 400c → sous-spécifié, Gamma improvise mal. Au-dessus de
    // 1000c → bruit qui dilue les instructions clés. Cible idéale 500-800c
    // (signalée par post-processor en warning si hors plage mais dans bornes).
    if (data.visual_recommended && data.gamma_prompt.length < 400) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gamma_prompt'],
        message: 'gamma_prompt must be at least 400 chars when visual_recommended is true (target 500-800)',
      });
    }
    if (data.visual_recommended && data.gamma_prompt.length > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gamma_prompt'],
        message: 'gamma_prompt must be at most 1000 chars when visual_recommended is true (target 500-800)',
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
