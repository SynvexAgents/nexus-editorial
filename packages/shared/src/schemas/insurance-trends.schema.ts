import { z } from 'zod';

export const insuranceTrendItemSchema = z.object({
  titre: z.string().min(1),
  source_url: z.string().url(),
  resume_2_lignes: z.string().min(1),
  date: z.string().datetime({ offset: true }),
  impact_metier: z.string().min(1),
});

export const insuranceTrendsSchema = z.object({
  regulation_acpr: z.array(insuranceTrendItemSchema),
  sinistres_fraude: z.array(insuranceTrendItemSchema),
  courtage_distribution: z.array(insuranceTrendItemSchema),
  mutuelles_complementaires: z.array(insuranceTrendItemSchema),
  insurtech_ia_assurance: z.array(insuranceTrendItemSchema),
  back_office_productivite: z.array(insuranceTrendItemSchema),
  signaux_faibles: z.array(insuranceTrendItemSchema),
  actualites_majeures: z.array(insuranceTrendItemSchema),
  synthese_textuelle: z.string().min(1),
});

export type InsuranceTrendItem = z.infer<typeof insuranceTrendItemSchema>;
export type InsuranceTrends = z.infer<typeof insuranceTrendsSchema>;
