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
    // v2.2 (mai 2026, post-W22) : brief Gamma structuré 500-800c cible, hard
    // cap Zod 1400c. Au-dessous de 400c → sous-spécifié, Gamma improvise mal.
    // Au-dessus de 1400c → l'Edge Function tronque proprement à la dernière
    // phrase complète AVANT la validation Zod (cf. truncateAtSentence +
    // pipeline dans agent-8-visual-decision/index.ts). On garde un cap
    // 1400c en Zod comme dernier filet : si la troncature échoue ou est
    // contournée, on protège la DB.
    if (data.visual_recommended && data.gamma_prompt.length < 400) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gamma_prompt'],
        message: 'gamma_prompt must be at least 400 chars when visual_recommended is true (target 500-800)',
      });
    }
    if (data.visual_recommended && data.gamma_prompt.length > 1400) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gamma_prompt'],
        message: 'gamma_prompt must be at most 1400 chars when visual_recommended is true (target 500-800, hard cap 1400)',
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
