import { describe, expect, it } from 'vitest';
import { repairJson } from '../json-repair.js';
import { visualDecisionSchema } from '../schemas/visual-decision.schema.js';
import { truncateAtSentence } from '../visual-prompt-truncate.js';

// ---------------------------------------------------------------------------
// Tests de non-régression pour le flow Agent 8 (v2.2.1, post-W22).
//
// L'ordre des opérations DOIT être strictement :
//   1. JSON.parse(text)
//   2. truncateAtSentence sur chaque .gamma_prompt > 1400c
//   3. Zod safeParse
//
// Si on inverse 1 et 2, JSON.parse échoue dès que la troncature coupe en
// plein milieu d'une string JSON. Ces tests verrouillent l'ordre.
// ---------------------------------------------------------------------------

function makeBriefBlock(targetLen: number): string {
  // Phrases qui finissent par "." pour permettre une coupe propre par
  // truncateAtSentence. Block de 45c × N → ~targetLen chars.
  const sentence = 'Slide simple texte ici qui finit proprement. ';
  const repeats = Math.ceil(targetLen / sentence.length);
  return sentence.repeat(repeats).slice(0, targetLen);
}

function buildVisualJson(gammaPromptLen: number): string {
  const brief = makeBriefBlock(gammaPromptLen);
  // JSON-encode proprement le brief (escape quotes etc.)
  return JSON.stringify({
    visuals: [
      {
        post_position: 1,
        visual_recommended: true,
        visual_reason: 'Pédagogie technique : 6 slides pour structurer.',
        visual_type: 'carrousel_6',
        gamma_prompt: brief,
      },
    ],
  });
}

describe('Agent 8 flow — parse THEN truncate THEN Zod (correct order)', () => {
  it('full flow accepts a 1500c gamma_prompt by truncating to ≤ 1400c', () => {
    const jsonText = buildVisualJson(1500);
    expect(jsonText.length).toBeGreaterThan(1500); // metadata overhead

    // 1. JSON.parse réussit (le JSON est bien formé)
    const parsed = JSON.parse(jsonText);
    expect(parsed.visuals).toHaveLength(1);
    expect(parsed.visuals[0].gamma_prompt.length).toBe(1500);

    // 2. Truncation APRÈS parse
    const truncatedVisuals = parsed.visuals.map((v: { gamma_prompt: string }) => {
      if (v.gamma_prompt.length > 1400) {
        const t = truncateAtSentence(v.gamma_prompt, 1400);
        return { ...v, gamma_prompt: t.text };
      }
      return v;
    });
    expect(truncatedVisuals[0].gamma_prompt.length).toBeLessThanOrEqual(1400);

    // 3. Zod safeParse réussit sur le résultat tronqué
    const zod = visualDecisionSchema.safeParse(truncatedVisuals[0]);
    expect(zod.success).toBe(true);
  });

  it('1300c gamma_prompt passes through unchanged (no truncation needed)', () => {
    const jsonText = buildVisualJson(1300);
    const parsed = JSON.parse(jsonText);
    const before = parsed.visuals[0].gamma_prompt;
    const truncatedVisuals = parsed.visuals.map((v: { gamma_prompt: string }) => {
      if (v.gamma_prompt.length > 1400) {
        const t = truncateAtSentence(v.gamma_prompt, 1400);
        return { ...v, gamma_prompt: t.text };
      }
      return v;
    });
    expect(truncatedVisuals[0].gamma_prompt).toBe(before);
    const zod = visualDecisionSchema.safeParse(truncatedVisuals[0]);
    expect(zod.success).toBe(true);
  });
});

describe('Agent 8 flow — anti-régression : NE PAS tronquer le JSON brut', () => {
  it("truncating raw JSON text BEFORE parse breaks JSON.parse (régression W22 démontrée)", () => {
    // On simule le bug hypothétique : appliquer truncateAtSentence sur le
    // texte JSON brut au lieu du gamma_prompt extrait.
    const jsonText = buildVisualJson(1500);
    expect(jsonText.length).toBeGreaterThan(1400);

    // Mauvais ordre : tronquer le JSON entier
    const brokenJson = truncateAtSentence(jsonText, 1400).text;

    // JSON.parse DOIT échouer parce qu'on a coupé au milieu de la structure
    // (string non fermée, } manquant, etc.).
    expect(() => JSON.parse(brokenJson)).toThrow();
  });

  it('correct order keeps JSON valid even on briefs > 1400c', () => {
    const jsonText = buildVisualJson(1800);

    // Bon ordre : on parse d'abord
    expect(() => JSON.parse(jsonText)).not.toThrow();
    const parsed = JSON.parse(jsonText);

    // Puis on tronque seulement le champ gamma_prompt
    const truncatedVisuals = parsed.visuals.map((v: { gamma_prompt: string }) => ({
      ...v,
      gamma_prompt: truncateAtSentence(v.gamma_prompt, 1400).text,
    }));
    expect(truncatedVisuals[0].gamma_prompt.length).toBeLessThanOrEqual(1400);
    expect(visualDecisionSchema.safeParse(truncatedVisuals[0]).success).toBe(true);
  });
});

describe('repairJson — best-effort fixes for LLM JSON quirks', () => {
  it('removes trailing comma before closing bracket', () => {
    const broken = '{"visuals":[{"a":1},{"b":2},]}';
    expect(() => JSON.parse(broken)).toThrow();
    const repaired = repairJson(broken);
    expect(() => JSON.parse(repaired)).not.toThrow();
    const obj = JSON.parse(repaired) as { visuals: unknown[] };
    expect(obj.visuals).toHaveLength(2);
  });

  it('removes trailing comma before closing brace', () => {
    const broken = '{"a":1,"b":2,}';
    expect(() => JSON.parse(broken)).toThrow();
    expect(() => JSON.parse(repairJson(broken))).not.toThrow();
  });

  it('strips illegal control characters that break JSON.parse', () => {
    // \x07 (BEL) au milieu : illégal dans une string JSON
    const broken = '{"a":"hello\x07world"}';
    // JSON.parse rejette le caractère de contrôle non échappé
    expect(() => JSON.parse(broken)).toThrow();
    const repaired = repairJson(broken);
    const obj = JSON.parse(repaired) as { a: string };
    expect(obj.a).toBe('helloworld');
  });

  it('leaves valid JSON unchanged (idempotent)', () => {
    const valid = '{"visuals":[{"a":1,"b":[2,3]}]}';
    const repaired = repairJson(valid);
    expect(repaired).toBe(valid);
    expect(JSON.parse(repaired)).toEqual(JSON.parse(valid));
  });

  it('preserves valid \\n inside JSON strings (does not strip escaped newlines)', () => {
    // Les caractères \n ÉCHAPPÉS (deux chars : backslash + n) sont valides
    // dans une string JSON. On ne doit pas les toucher.
    const valid = '{"brief":"Slide 1.\\nSlide 2."}';
    const repaired = repairJson(valid);
    expect(repaired).toBe(valid);
    const obj = JSON.parse(repaired) as { brief: string };
    expect(obj.brief).toContain('\n');
  });
});
