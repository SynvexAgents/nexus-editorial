// produit-synvex (Deno copy) — miroir 1:1 de packages/shared/src/produit-synvex.ts.
// La copie packages/ fait foi (testée Vitest). Deno ne peut pas importer packages/.

export interface ChiffreProduit {
  valeur: string;
  libelle: string;
}

export interface ProduitRotationRow {
  slug: string;
  actif?: boolean;
  derniere_utilisation_semaine?: string | null;
}

export function pickProductForRotation<T extends ProduitRotationRow>(rows: T[]): T | null {
  const active = (rows ?? []).filter((r) => r.actif !== false);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => {
    const aw = a.derniere_utilisation_semaine ?? '';
    const bw = b.derniere_utilisation_semaine ?? '';
    if (aw !== bw) return aw < bw ? -1 : 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  })[0] as T;
}

interface ProduitBlockInput {
  nom: string;
  domaine?: string | null;
  positionnement?: string | null;
  problemes_terrain?: unknown;
  mecaniques?: unknown;
  chiffres?: unknown;
  punchlines?: unknown;
  cibles?: unknown;
}

function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function asChiffres(v: unknown): ChiffreProduit[] {
  return Array.isArray(v)
    ? v.filter(
        (x): x is ChiffreProduit =>
          !!x && typeof x === 'object' && 'valeur' in x && 'libelle' in x,
      )
    : [];
}

export function buildProduitBlock(p: ProduitBlockInput): string {
  const problemes = asList(p.problemes_terrain);
  const mecaniques = asList(p.mecaniques);
  const chiffres = asChiffres(p.chiffres);
  const punchlines = asList(p.punchlines);
  const cibles = asList(p.cibles);
  const fmt = (arr: string[]) => (arr.length ? arr.map((x) => `- ${x}`).join('\n') : '- (n/a)');
  const fmtChiffres = chiffres.length
    ? chiffres.map((c) => `- ${c.valeur} : ${c.libelle}`).join('\n')
    : '- (n/a)';
  return `=== PRODUIT DE LA SEMAINE : ${p.nom} ===
Domaine : ${p.domaine ?? '(n/a)'}
Positionnement : ${p.positionnement ?? '(n/a)'}

PROBLÈMES TERRAIN (matière pour le pilier PREUVE) :
${fmt(problemes)}

MÉCANIQUES PRODUIT (matière pour le pilier ÉDUCATION) :
${fmt(mecaniques)}

CHIFFRES CONCRETS (utilisables tels quels, déjà cadrés "client type" — n'en invente AUCUN autre) :
${fmtChiffres}

PUNCHLINES / CONVICTIONS (matière pour le pilier PHILOSOPHIE) :
${fmt(punchlines)}

CIBLES : ${cibles.length ? cibles.join(' · ') : '(n/a)'}`;
}

export function buildPiliersBlock(): string {
  return `=== STRUCTURE ÉDITORIALE : LES 3 PILIERS ===
Les 3 posts finaux de la semaine (sélectionnés par l'Editorial Director parmi tes 8 angles) doivent idéalement couvrir 3 registres complémentaires. Génère tes 8 angles en veillant à alimenter ces 3 piliers :

PILIER 1 — LA PREUVE (le problème concret + le résultat)
Décris un problème terrain précis tiré de la fiche, et le résultat chiffré qu'on obtient. Formulation : "Dans un cabinet type…", "Le traitement d'un dossier prend X minutes…". JAMAIS "un de mes clients".

PILIER 2 — L'ÉDUCATION (comment ça marche vraiment)
Explique une mécanique métier ou produit en profondeur : comment le problème se résout concrètement, étape par étape. Le lecteur apprend quelque chose d'utile même s'il n'achète pas.

PILIER 3 — LA PHILOSOPHIE (la conviction, la vision)
Une prise de position sur le métier, sur l'IA dans l'assurance, sur la bonne façon de faire. Appuie-toi sur les punchlines de la fiche. Clive intelligemment.

Le pool de 10 archétypes reste disponible comme VARIATIONS DE FORME à l'intérieur des piliers (ex : un pilier Preuve peut prendre la forme "cas_chiffre" ; un pilier Philosophie la forme "take_controversee" ou "lettre_ouverte").`;
}

export function buildRegleVeriteBlock(): string {
  return `=== RÈGLE DE VÉRITÉ NON NÉGOCIABLE ===
Tu ne dis QUE ce qui figure dans la fiche PRODUIT DE LA SEMAINE ci-dessus. Interdictions absolues :
- NE JAMAIS inventer de client réel, de témoignage, de nom d'entreprise cliente ("un de mes clients X a obtenu…").
- NE JAMAIS inventer de chiffre. Utilise UNIQUEMENT les chiffres listés dans CHIFFRES CONCRETS. Ils sont déjà cadrés "client type / cabinet type" — garde cette formulation.
- NE JAMAIS citer de personne nommée, d'employeur, de partenaire nommé, ni d'email/URL de contact.
- Les problèmes et mécaniques décrits sont réels (issus de la spec produit) : tu peux les affirmer. Mais tu ne brodes pas au-delà de ce qui est écrit.
Formulations AUTORISÉES : "Dans un cabinet de courtage type…", "Le traitement d'un sinistre passe par…", "Ce qu'on observe sur ce type de portefeuille…", "Voici comment un agent IA traite…".

Cette règle prime sur toute autre instruction créative.`;
}
