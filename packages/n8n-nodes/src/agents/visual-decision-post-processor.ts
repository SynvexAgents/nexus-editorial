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
 *      - gamma_prompt DOIT être ≥ 50 caractères → flag si trop court.
 *
 * Note : le schéma Zod superRefine bloque déjà les cas 2 à l'entrée
 * (visual_type='aucun' + recommended=true ou gamma_prompt<50 + true).
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
      if (mutable.gamma_prompt.length < 50) {
        criticalFlags.push(
          `position ${mutable.post_position}: visual_recommended=true mais gamma_prompt < 50 chars (${mutable.gamma_prompt.length}).`,
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
