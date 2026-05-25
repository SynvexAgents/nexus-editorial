// json-repair — helper best-effort pour réparer les sorties JSON malformées
// des LLM. Utilisé en fallback si JSON.parse échoue sur la réponse brute.
//
// v2.2.1 (post-W22) : Haiku 4.5 a généré sur W22 un JSON avec position 3456
// d'erreur. Diagnostic : max_tokens trop bas → troncature côté Anthropic.
// On a élevé max_tokens à 4096, mais on garde ce helper comme filet de sécurité
// pour d'autres modes d'échec courants (trailing commas, caractères de contrôle).

/**
 * Réparations conservatrices :
 *   - retire les trailing commas avant `]` ou `}`
 *   - retire les caractères de contrôle invisibles (U+0000-U+001F) hors \t \n \r
 *
 * On ne touche PAS aux guillemets non-échappés (trop risqué : casserait un
 * brief légitime contenant des citations). Le prompt système renforce déjà
 * cette règle côté LLM.
 */
export function repairJson(text: string): string {
  let out = text;
  // Trailing commas avant ] ou }
  out = out.replace(/,(\s*[\]}])/g, '$1');
  // Caractères de contrôle illégaux dans JSON (sauf \t \n \r qui sont valides
  // hors string ; en pratique JSON.parse les rejette même hors string aussi).
  // L'objectif EXPLICITE de ce regex est de matcher les caractères de contrôle
  // — biome flag inapproprié ici.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional, JSON repair
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return out;
}
