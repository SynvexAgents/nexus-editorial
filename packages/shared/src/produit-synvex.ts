// produit-synvex — types + helpers purs pour le corpus produit (carburant
// éditorial Agent 6). Scrubbing données sensibles + rotation déterministe.

export interface ChiffreProduit {
  valeur: string;
  libelle: string;
}

export interface ProduitSynvexRecord {
  slug: string;
  nom: string;
  domaine: string;
  positionnement: string;
  problemes_terrain: string[];
  mecaniques: string[];
  chiffres: ChiffreProduit[];
  cibles: string[];
  punchlines: string[];
  differenciation: string;
  actif?: boolean;
}

/** Ligne telle que lue depuis Supabase (rotation). */
export interface ProduitRotationRow {
  slug: string;
  actif?: boolean;
  derniere_utilisation_semaine?: string | null;
}

// ---------------------------------------------------------------------------
// SCRUB — données sensibles à ne JAMAIS laisser entrer en base / ressortir.
// Anciens employeurs, emails/URLs de contact, mentions confidentielles,
// signature nominative du fondateur.
// ---------------------------------------------------------------------------
const SENSITIVE_PATTERNS: RegExp[] = [
  /MSH\s*International/gi,
  /\bMSH\b/g,
  /\bHenner\b/gi,
  /\bMarouane\s+Borsali\b/gi,
  /CONFIDENTIAL\s*[·.\-]?\s*FOR\s+EXECUTIVE\s+REVIEW/gi,
  /\bFOR\s+EXECUTIVE\s+REVIEW\b/gi,
  /\bCONFIDENTIAL\b/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // emails
  /\bsynvex\.ai(?:\/[A-Za-z0-9-]+)?/gi, // URLs synvex.ai/xxx
];

/** Liste des tokens sensibles (pour tests de garde / scan de seed). */
export const SENSITIVE_TOKENS: readonly string[] = [
  'MSH',
  'Henner',
  'Marouane',
  'Borsali',
  'CONFIDENTIAL',
  'EXECUTIVE REVIEW',
  '@',
  'synvex.ai',
];

/** Retire toute donnée sensible d'une chaîne (idempotent). */
export function scrubSensitive(text: string): string {
  if (typeof text !== 'string') return '';
  let out = text;
  for (const re of SENSITIVE_PATTERNS) out = out.replace(re, '');
  // Normalise les espaces laissés par les suppressions.
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
}

/** True si la chaîne contient encore un token sensible (pour garde-tests). */
export function containsSensitive(text: string): boolean {
  if (typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return (
    /msh\s*international/.test(lower) ||
    /\bhenner\b/.test(lower) ||
    /marouane|borsali/.test(lower) ||
    /confidential|executive review/.test(lower) ||
    /@[a-z0-9.-]+\.[a-z]{2,}/.test(lower) ||
    /synvex\.ai/.test(lower)
  );
}

/**
 * Assemble un contenu_brut complet et déjà-scrubé à partir des champs
 * structurés (eux-mêmes scrubés). Évite de stocker le texte PDF brut
 * (qui contient les données sensibles).
 */
export function assembleContenuBrut(p: ProduitSynvexRecord): string {
  const lines = [
    `${p.nom} — ${p.domaine}`,
    '',
    p.positionnement,
    '',
    'PROBLÈMES TERRAIN :',
    ...p.problemes_terrain.map((x) => `- ${x}`),
    '',
    'MÉCANIQUES :',
    ...p.mecaniques.map((x) => `- ${x}`),
    '',
    'CHIFFRES :',
    ...p.chiffres.map((c) => `- ${c.valeur} — ${c.libelle}`),
    '',
    'CIBLES :',
    ...p.cibles.map((x) => `- ${x}`),
    '',
    'PUNCHLINES :',
    ...p.punchlines.map((x) => `- ${x}`),
    '',
    `DIFFÉRENCIATION : ${p.differenciation}`,
  ];
  return scrubSensitive(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// ROTATION — pioche le produit le moins récemment utilisé.
// ---------------------------------------------------------------------------
/**
 * Sélectionne le produit actif le moins récemment utilisé :
 *   1. priorité aux produits jamais utilisés (derniere_utilisation_semaine null)
 *   2. sinon, plus petit week_id (le plus ancien) — ordre lexicographique ISO
 *   3. tie-break : slug ascendant
 * Retourne null si aucun produit actif.
 */
export function pickProductForRotation<T extends ProduitRotationRow>(rows: T[]): T | null {
  const active = (rows ?? []).filter((r) => r.actif !== false);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => {
    const aw = a.derniere_utilisation_semaine ?? '';
    const bw = b.derniere_utilisation_semaine ?? '';
    if (aw !== bw) return aw < bw ? -1 : 1; // '' (jamais utilisé) trie en premier
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  })[0] as T;
}

// ---------------------------------------------------------------------------
// PROMPT BLOCKS — fiche produit, 3 piliers, règle de vérité (Agent 6).
// ---------------------------------------------------------------------------
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

/** Bloc "PRODUIT DE LA SEMAINE" injecté dans le prompt système Agent 6. */
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

/** Bloc structure 3 piliers (Preuve / Éducation / Philosophie). */
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

/** Bloc règle de vérité non négociable. */
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
