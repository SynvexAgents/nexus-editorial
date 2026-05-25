// visual-prompt-truncate (Deno copy) — miroir 1:1 de
// packages/shared/src/visual-prompt-truncate.ts. Deno ne peut pas importer
// depuis packages/, donc on duplique. La copie packages/ fait foi (testée
// par Vitest). Voir l'original pour les commentaires détaillés.

export interface TruncateResult {
  text: string;
  truncated: boolean;
  removed_chars: number;
  clean_cut: boolean;
}

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

  const sentenceEndPattern = /[.!?](?:\s|$)/g;
  let lastEnd = -1;
  let m: RegExpExecArray | null = sentenceEndPattern.exec(window);
  while (m !== null) {
    const endIdx = m.index + 1;
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
