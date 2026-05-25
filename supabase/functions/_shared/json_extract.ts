// supabase/functions/_shared/json_extract.ts
// Helpers d'extraction JSON depuis les réponses LLM (avec ou sans prefill).

import { repairJson } from './json-repair.ts';

/**
 * Extrait un OBJET JSON {...} depuis une réponse texte. Tolérant aux
 * fences markdown et au texte trailing. Pour les modèles sans prefill
 * (Opus 4.7, qui exige que la conversation finisse sur message user).
 */
export function extractJsonObject(rawText: string): unknown {
  let text = rawText.trim();
  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no_json_object_found_in_response');
  }
  return JSON.parse(text.substring(start, end + 1));
}

/**
 * Extrait un OBJET JSON avec prefill `{` prépendé. Pour Haiku 4.5 où
 * on utilise `messages: [..., { role: 'assistant', content: '{' }]`.
 *
 * v2.2.1 : tente JSON.parse en l'état ; si fail, applique repairJson et
 * retente une seule fois. Si toujours fail, throw l'erreur originale (pas
 * celle du retry) pour préserver le diagnostic le plus pertinent.
 */
export function extractJsonFromPrefilledResponse(rawText: string): unknown {
  let text = `{${rawText}`;
  text = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no_json_object_found_in_response');
  }
  const slice = text.substring(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (firstErr) {
    try {
      return JSON.parse(repairJson(slice));
    } catch {
      throw firstErr;
    }
  }
}

/**
 * Extrait un ARRAY JSON [...] depuis une réponse texte. Utilisé pour
 * les retours Perplexity (Agent 5) qui renvoient un array racine.
 */
export function extractJsonArray(rawText: string): unknown {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no_json_array_found');
  }
  return JSON.parse(cleaned.substring(start, end + 1));
}
