// json-repair (Deno copy) — miroir 1:1 de packages/shared/src/json-repair.ts.
// Deno ne peut pas importer depuis packages/, donc on duplique. La copie
// packages/ fait foi (testée par Vitest).

export function repairJson(text: string): string {
  let out = text;
  out = out.replace(/,(\s*[\]}])/g, '$1');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional, JSON repair
  out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return out;
}
