// visual-prompt-truncate — helper pur pour tronquer le gamma_prompt d'Agent 8
// à la dernière phrase complète avant maxLength.
//
// Contexte : commit 67d805e a élargi le brief Gamma à 500-800c structuré (6
// sections). Opus 4.7 génère parfois > cap Zod (W22 plantage), on protège
// l'Edge Function via troncature propre AVANT la validation Zod.
//
// Stratégie de troncature :
//   1. Si text.length ≤ maxLength → renvoyer tel quel
//   2. Sinon : chercher le dernier ". " AVANT maxLength, couper juste après
//      (en gardant le point). Marge de sécurité min : ne pas couper si la
//      coupure tombe trop tôt (< minAfterCut chars de texte conservé) →
//      fallback à couper brutalement à maxLength (cas rare).

export interface TruncateResult {
  text: string;
  truncated: boolean;
  /** Caractères supprimés (0 si pas tronqué). */
  removed_chars: number;
  /** True si coupé proprement à une phrase ; false si fallback brutal. */
  clean_cut: boolean;
}

/**
 * Tronque `text` à la dernière phrase complète avant `maxLength`.
 *
 * @param text       Texte d'entrée
 * @param maxLength  Longueur cible maximale (inclusive)
 * @param minAfterCut Longueur minimale du résultat ; sous ce seuil on coupe
 *                    brutalement à maxLength plutôt que de retourner un texte
 *                    quasi vide. Défaut : 60% de maxLength.
 */
export function truncateAtSentence(
  text: string,
  maxLength: number,
  minAfterCut?: number,
): TruncateResult {
  if (typeof text !== 'string' || text.length <= maxLength) {
    return {
      text: typeof text === 'string' ? text : '',
      truncated: false,
      removed_chars: 0,
      clean_cut: true,
    };
  }

  const floor = typeof minAfterCut === 'number' ? minAfterCut : Math.floor(maxLength * 0.6);
  const window = text.slice(0, maxLength);

  // Cherche la dernière fin de phrase dans la fenêtre. On accepte ". ", ".\n",
  // "! ", "? " — patterns multi-langues raisonnables. Le dernier point + espace
  // ou newline est notre point de coupure idéal.
  const sentenceEndPattern = /[.!?](?:\s|$)/g;
  let lastEnd = -1;
  let m: RegExpExecArray | null = sentenceEndPattern.exec(window);
  while (m !== null) {
    // m.index pointe sur le ".", on coupe juste après (inclus).
    const endIdx = m.index + 1; // garde le ponctuation
    if (endIdx <= maxLength) lastEnd = endIdx;
    m = sentenceEndPattern.exec(window);
  }

  if (lastEnd > 0 && lastEnd >= floor) {
    const cut = text.slice(0, lastEnd);
    return {
      text: cut,
      truncated: true,
      removed_chars: text.length - cut.length,
      clean_cut: true,
    };
  }

  // Fallback : pas de point de coupure raisonnable trouvé, on coupe brutal.
  // Couper sur un espace dans la fenêtre [floor, maxLength] si possible pour
  // éviter de scinder un mot.
  const lastSpace = window.lastIndexOf(' ');
  const fallbackCut = lastSpace > floor ? lastSpace : maxLength;
  const out = text.slice(0, fallbackCut).trimEnd();
  return {
    text: out,
    truncated: true,
    removed_chars: text.length - out.length,
    clean_cut: false,
  };
}
