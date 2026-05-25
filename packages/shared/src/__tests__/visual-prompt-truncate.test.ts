import { describe, expect, it } from 'vitest';
import { truncateAtSentence } from '../visual-prompt-truncate.js';

describe('truncateAtSentence — no-op when under limit', () => {
  it('returns input unchanged when length <= maxLength', () => {
    const text = 'Carrousel 4 slides. Slide 1 : titre. Slide 2 : chiffre central.';
    const r = truncateAtSentence(text, 1400);
    expect(r.truncated).toBe(false);
    expect(r.removed_chars).toBe(0);
    expect(r.text).toBe(text);
  });

  it('handles exact-length input without truncation', () => {
    const text = 'a'.repeat(100);
    const r = truncateAtSentence(text, 100);
    expect(r.truncated).toBe(false);
    expect(r.text.length).toBe(100);
  });
});

describe('truncateAtSentence — cuts at last sentence boundary before maxLength', () => {
  it('cuts at the last ". " before maxLength on a multi-sentence brief', () => {
    // Brief > 1400c avec fins de phrase régulières (block 45c × 40 = 1800c).
    const block = 'Slide simple texte ici qui finit proprement. '; // 45c
    const text = block.repeat(40); // 1800c
    expect(text.length).toBeGreaterThan(1400);

    const r = truncateAtSentence(text, 1400);
    expect(r.truncated).toBe(true);
    expect(r.clean_cut).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(1400);
    // Le résultat finit par une ponctuation (., ! ou ?) — preuve de coupe propre.
    expect(/[.!?]$/.test(r.text)).toBe(true);
    // Aucun mot tronqué : le char après la coupe dans l'original est un espace.
    const nextChar = text.charAt(r.text.length);
    expect(/\s/.test(nextChar) || nextChar === '').toBe(true);
  });

  it('falls back to space cut if no sentence boundary is reachable within window', () => {
    // Texte sans aucune ponctuation finale dans la fenêtre — fallback espace.
    const word = 'mot';
    const text = `${word} `.repeat(500); // 2000c, aucun ".!?"
    const r = truncateAtSentence(text, 1000);
    expect(r.truncated).toBe(true);
    expect(r.clean_cut).toBe(false); // pas de coupe propre à une phrase
    expect(r.text.length).toBeLessThanOrEqual(1000);
    // Mais on doit quand même finir sur un mot complet (pas en plein milieu).
    expect(r.text.endsWith(word)).toBe(true);
  });
});

describe('truncateAtSentence — Agent 8 use case (1400 cap)', () => {
  it('1300c brief stays unchanged (under cap)', () => {
    // Génère exactement 1300c en padding la fin de la dernière phrase.
    const block = 'Slide simple texte ici qui finit proprement. '; // length 45
    const repeats = Math.ceil(1300 / block.length);
    const text = (block.repeat(repeats)).slice(0, 1300);
    expect(text.length).toBe(1300);
    const r = truncateAtSentence(text, 1400);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe(text);
  });

  it('1500c+ brief is truncated to <= 1400c with clean cut', () => {
    // Construit un texte > 1400c avec fins de phrase régulières pour qu'une
    // coupe propre soit possible dans la fenêtre [840, 1400].
    const block = 'Slide simple texte ici qui finit proprement. '; // 45c
    const repeats = Math.ceil(1500 / block.length);
    const text = block.repeat(repeats); // 34 × 45 = 1530c
    expect(text.length).toBeGreaterThan(1400);

    const r = truncateAtSentence(text, 1400);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(1400);
    expect(r.clean_cut).toBe(true);
    expect(r.removed_chars).toBeGreaterThan(0);
    expect(/[.!?]$/.test(r.text)).toBe(true);
  });

  it('removed_chars correctly reflects bytes removed', () => {
    const text = "Phrase un. Phrase deux. Phrase trois.";
    const r = truncateAtSentence(text, 15);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(15);
    expect(r.removed_chars).toBe(text.length - r.text.length);
  });
});

describe('truncateAtSentence — robustness', () => {
  it('handles empty string', () => {
    const r = truncateAtSentence('', 1400);
    expect(r.text).toBe('');
    expect(r.truncated).toBe(false);
  });

  it('handles non-string input gracefully (no throw, empty text out)', () => {
    const r = truncateAtSentence(null as unknown as string, 1400);
    expect(r.text).toBe('');
    expect(r.truncated).toBe(false);
  });
});
