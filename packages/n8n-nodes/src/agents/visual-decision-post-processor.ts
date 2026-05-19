/**
 * visual-decision-post-processor — checks déterministes sur la sortie
 * Agent 8 (Visual Decision).
 *
 * Règles de cohérence visual_recommended ↔ visual_type ↔ gamma_prompt :
 *
 *   1. Si visual_recommended=false :
 *      - visual_type DOIT être "aucun" → override si autre valeur.
 *      - gamma_prompt DOIT être "" → override si non vide.
 *   2. Si visual_recommended=true :
 *      - visual_type DOIT être ≠ "aucun" → flag critique si "aucun"
 *        (on n'override pas, c'est ambigu — Marouane décide).
 *      - gamma_prompt DOIT être entre 400 et 1000 caractères (v2.1).
 *        Cible idéale 500-800 → flag si hors cible mais dans bornes Zod.
 *        Cible 500-800 = brief Gamma structuré complet (6 sections).
 *
 * Note : le schéma Zod superRefine bloque déjà les cas 2 à l'entrée
 * (visual_type='aucun' + recommended=true ou gamma_prompt hors [400,1000]).
 * Ce post-processor reste utile pour les cas 1 (recommended=false mais
 * type/prompt non cohérents), qui passent Zod mais sont sémantiquement
 * erronés.
 */
import type { VisualsArray } from './visual-decision.js';

export interface VisualOverride {
  post_position: number;
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
}

export interface VisualsValidationReport {
  total_visuals: number;
  visual_recommended_count: number;
  overrides: VisualOverride[];
  critical_flags: string[];
}

export interface PostProcessVisualsOutput {
  visuals: VisualsArray;
  validation_report: VisualsValidationReport;
}

export function postProcessVisuals(visuals: VisualsArray): PostProcessVisualsOutput {
  const overrides: VisualOverride[] = [];
  const criticalFlags: string[] = [];

  const processed: VisualsArray = visuals.map((v) => {
    let mutable = { ...v };

    if (!mutable.visual_recommended) {
      // Cohérence : visual_type doit être "aucun".
      if (mutable.visual_type !== 'aucun') {
        overrides.push({
          post_position: mutable.post_position,
          field: 'visual_type',
          from: mutable.visual_type,
          to: 'aucun',
          reason: 'visual_recommended=false implique visual_type="aucun"',
        });
        mutable = { ...mutable, visual_type: 'aucun' };
      }
      // Cohérence : gamma_prompt doit être "".
      if (mutable.gamma_prompt !== '') {
        overrides.push({
          post_position: mutable.post_position,
          field: 'gamma_prompt',
          from: mutable.gamma_prompt.slice(0, 80),
          to: '',
          reason: 'visual_recommended=false implique gamma_prompt vide',
        });
        mutable = { ...mutable, gamma_prompt: '' };
      }
    } else {
      // visual_recommended = true → on flag les incohérences plutôt
      // qu'override (Zod a déjà bloqué les cas extrêmes).
      if (mutable.visual_type === 'aucun') {
        criticalFlags.push(
          `position ${mutable.post_position}: visual_recommended=true mais visual_type="aucun" (incohérence Zod-bypass).`,
        );
      }
      const len = mutable.gamma_prompt.length;
      if (len < 400) {
        criticalFlags.push(
          `position ${mutable.post_position}: visual_recommended=true mais gamma_prompt ${len}c < 400 (bornes Zod 400-1000, cible 500-800).`,
        );
      } else if (len < 500) {
        criticalFlags.push(
          `position ${mutable.post_position}: gamma_prompt ${len}c sous la cible (500-800), risque de brief sous-spécifié.`,
        );
      } else if (len > 800) {
        criticalFlags.push(
          `position ${mutable.post_position}: gamma_prompt ${len}c au-dessus de la cible (500-800), risque de bruit qui dilue les instructions.`,
        );
      }
    }

    return mutable;
  }) as VisualsArray;

  return {
    visuals: processed,
    validation_report: {
      total_visuals: processed.length,
      visual_recommended_count: processed.filter((v) => v.visual_recommended).length,
      overrides,
      critical_flags: criticalFlags,
    },
  };
}
