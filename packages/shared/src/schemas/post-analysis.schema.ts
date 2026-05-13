import { z } from 'zod';

export const hookTypeEnum = z.enum([
  'stat_choc',
  'confession',
  'contrarian',
  'listicle',
  'mini_story',
  'question_provoc',
  'observation_metier',
  'annonce',
  'rant',
]);

export const formatEnum = z.enum([
  'punchline',
  'mini_essai',
  'listicle',
  'storytelling',
  'analyse',
  'retour_experience',
  'data_post',
]);

export const tonEnum = z.enum([
  'lucide',
  'provocateur',
  'pédagogue',
  'confessionnel',
  'analytique',
  'sec',
  'inspirant',
]);

export const ctaTypeEnum = z.enum(['aucun', 'commentaire', 'DM', 'lien', 'question_ouverte']);

export const postAnalysisSchema = z.object({
  post_id: z.string().min(1),
  hook_type: hookTypeEnum,
  hook_extract: z.string().min(1),
  format: formatEnum,
  structure_narrative: z.string().min(1),
  longueur_caracteres: z.number().int().positive(),
  longueur_paragraphes: z.number().int().positive(),
  ton: tonEnum,
  topic_cluster: z.string().min(1),
  topic_specific: z.string().min(1),
  cta_type: ctaTypeEnum,
  mecaniques_attention: z.array(z.string()),
  transferabilite_assurance: z.number().int().min(0).max(10),
  raison_performance_hypothese: z.string().min(1),
});

export type PostAnalysis = z.infer<typeof postAnalysisSchema>;
export type HookType = z.infer<typeof hookTypeEnum>;
export type PostFormat = z.infer<typeof formatEnum>;
export type PostTon = z.infer<typeof tonEnum>;
export type CtaType = z.infer<typeof ctaTypeEnum>;
