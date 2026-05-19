/**
 * winners-post-processor — pipeline déterministe post-Opus pour Agent 7.
 *
 * Vérifie les claims de l'auto-check (le LLM a-t-il menti ?), valide la
 * complémentarité, ajuste la longueur_finale réelle, détecte mentions
 * produits Synvex / lexique banni.
 *
 * Ne MODIFIE PAS le post_final lui-même (la rédaction reste sous la
 * responsabilité du Director Agent 7). On override uniquement les
 * booléens de l'auto-check, on corrige longueur_finale, et on flag les
 * incohérences pour revue humaine.
 */
import type { ProduitSynvex, WeeklyAngles, WeeklyWinners } from '@nexus/shared';
import { PRODUITS_SYNVEX } from '@nexus/shared';

/** Lexique banni (cf. synvex-voice-tone.md). Insensible casse. */
const BANNED_LEXIQUE = [
  'synergie',
  'synergique',
  'disruption',
  'disruptif',
  'révolution',
  'révolutionner',
  'révolutionnaire',
  'transformation digitale',
  'paradigme',
  'holistique',
  '360°',
  'game-changer',
  'next-gen',
  'leverage',
  'expérience client',
  'user-centric',
  'data-driven',
  'best in class',
  'world-class',
  "à l'ère de l'IA",
  "l'avenir de l'assurance",
  'le futur du courtage',
  '100% conforme',
  "0% d'erreur",
  'garantie ACPR',
  'magique',
  'incroyable',
];
// On compile une regex unique, échappée. "écosystème" est conditionnellement
// banni : "écosystème" seul = banni, mais "écosystème assurance" toléré. On
// gère cette exception séparément dans la fonction de check.
const BANNED_LEXIQUE_REGEX = new RegExp(
  `\\b(${BANNED_LEXIQUE.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);
// "écosystème" banni sauf "écosystème assurance". On match "écosystème" suivi
// d'autre chose que " assurance".
const ECOSYSTEME_BANNED_REGEX = /\bécosystème\b(?!\s+assurance\b)/i;
// "boost" : mot banni mais on tolère "booster" si verbe technique. La règle
// est stricte : on bloque le mot exact "boost" en isolation (ou conjugaison
// nominale). On garde simple : on cible "\bboost\b" et "\bboostez?\b".
const BOOST_BANNED_REGEX = /\bboost(?:e|es|ez|er|ée|ées|és)?\b/i;

// v2 mai 2026 : catalogue 9 produits Synvex (ajout de Vega et Nexus).
const SYNVEX_PRODUCT_NAMES = [
  'Orion',
  'Vega',
  'Helios',
  'Chiron',
  'Hermès',
  'Hermes',
  'Argus',
  'Nexus',
  'Atlas',
  'Cortex',
];
const SYNVEX_PRODUCT_REGEX = new RegExp(`\\b(${SYNVEX_PRODUCT_NAMES.join('|')})\\b`, 'i');
const SYNVEX_NAME_REGEX = /\bSynvex\b/gi;

const METIER_VOCAB_REGEX =
  /\b(S\/P|IBNR|ACPR|RGPD|bordereau|bordereaux|MGA|mutuelle|mutuelles|courtage|claims|sinistre|sinistres|prime|primes|matrice|fronteur|fronting|réassureur|reassureur|réassurance|reassurance|assureur|assureurs|insurtech|loss ratio|ratio combiné|ratio combine|indemnisation|EIOPA|Solvency|solvabilité|CatNat|catnat|IARD|rétrocession|retrocession|conventions sinistres|audit trail|matrice de délégation)\b/gi;

const BANNED_HOOKS = [
  /^et si je vous disais/i,
  /^hier soir/i,
  /^beaucoup pensent que/i,
  /^on me demande souvent/i,
  /^voici \d+\s+choses/i,
  /^\d+\s+ans plus tard/i,
  /^devinez quoi/i,
  /^j'ai une question pour vous/i,
  /^personne n'en parle/i,
];

export interface WinnerOverride {
  post_position: number;
  field: string;
  from: unknown;
  to: unknown;
  reason: string;
}

export interface WinnersValidationReport {
  /** Nombre d'archétypes distincts dans les 3 winners. */
  archetypes_distinct: number;
  /** Nombre d'ICP distincts dans les 3 winners. */
  icp_distinct: number;
  /** Nombre de longueurs cibles distinctes (basé sur l'angle d'origine). */
  longueurs_distinct: number;
  // v2 mai 2026 — diversité produit Synvex
  produits_synvex_distinct: number;
  produits_synvex_used: ProduitSynvex[];
  /** True si ≥ 2 produits distincts sur 3 winners (cible idéale : 3). */
  produit_synvex_diversity_ok: boolean;
  /** Liste de tous les overrides appliqués (audit trail). */
  overrides: WinnerOverride[];
  /** Flags critiques (mention Synvex multiple, complémentarité KO). */
  critical_flags: string[];
  /** True si complémentarité OK (≥ 2 archétypes ET ≥ 2 ICP). */
  complementarite_ok: boolean;
}

export interface PostProcessWinnersOutput {
  winners: WeeklyWinners;
  validation_report: WinnersValidationReport;
}

/** Vérifie si un texte contient un mot du lexique banni. */
function containsBannedLexique(text: string): boolean {
  if (BANNED_LEXIQUE_REGEX.test(text)) return true;
  if (ECOSYSTEME_BANNED_REGEX.test(text)) return true;
  if (BOOST_BANNED_REGEX.test(text)) return true;
  return false;
}

/** Vérifie si la première phrase contient un hook banni. */
function containsBannedHook(post: string): boolean {
  const first = post.trim().slice(0, 200);
  for (const re of BANNED_HOOKS) {
    if (re.test(first)) return true;
  }
  return false;
}

/** Compte les mentions de Synvex (insensible casse). */
function countSynvexMentions(text: string): number {
  const matches = text.match(SYNVEX_NAME_REGEX);
  return matches ? matches.length : 0;
}

/** Compte les termes métier assurance distincts dans le post. */
function countMetierTerms(text: string): number {
  const matches = text.match(METIER_VOCAB_REGEX);
  if (!matches) return 0;
  // Distinct (insensible casse).
  return new Set(matches.map((m) => m.toLowerCase())).size;
}

export function postProcessWinners(
  winners: WeeklyWinners,
  angles: WeeklyAngles,
): PostProcessWinnersOutput {
  const angleById = new Map<string, WeeklyAngles[number]>(angles.map((a) => [a.angle_id, a]));
  const overrides: WinnerOverride[] = [];
  const criticalFlags: string[] = [];

  const processed: WeeklyWinners = winners.map((w) => {
    let mutable = { ...w, checklist_qualite_passee: { ...w.checklist_qualite_passee } };
    const post = mutable.post_final;
    const hook = mutable.hook_variantes.join('\n');
    const allText = `${post}\n${hook}`;

    // --- 1. anti_cliche_ok : claim TRUE mais lexique/hook banni détecté ---
    const hasBannedLex = containsBannedLexique(allText);
    const hasBannedHook = containsBannedHook(post);
    if (mutable.checklist_qualite_passee.anti_cliche_ok && (hasBannedLex || hasBannedHook)) {
      overrides.push({
        post_position: mutable.post_position,
        field: 'anti_cliche_ok',
        from: true,
        to: false,
        reason: hasBannedLex
          ? 'lexique banni détecté (synergie / disruption / etc.)'
          : 'hook banni détecté en première phrase',
      });
      mutable.checklist_qualite_passee.anti_cliche_ok = false;
    }

    // --- 2. absence_survente_ok : claim TRUE mais produit Synvex ou >1 mention Synvex ---
    const synvexCount = countSynvexMentions(allText);
    const hasProduct = SYNVEX_PRODUCT_REGEX.test(allText);
    if (mutable.checklist_qualite_passee.absence_survente_ok && (hasProduct || synvexCount > 1)) {
      overrides.push({
        post_position: mutable.post_position,
        field: 'absence_survente_ok',
        from: true,
        to: false,
        reason: hasProduct
          ? `nom produit Synvex mentionné (${SYNVEX_PRODUCT_REGEX.exec(allText)?.[0] ?? ''})`
          : `Synvex mentionné ${synvexCount} fois (max 1)`,
      });
      mutable.checklist_qualite_passee.absence_survente_ok = false;
    }
    if (synvexCount > 1) {
      criticalFlags.push(
        `position ${mutable.post_position}: Synvex mentionné ${synvexCount} fois (max 1).`,
      );
    }
    if (hasProduct) {
      criticalFlags.push(
        `position ${mutable.post_position}: nom produit Synvex (${SYNVEX_PRODUCT_REGEX.exec(allText)?.[0] ?? ''}) dans le post.`,
      );
    }

    // --- 3. vocabulaire_metier_ok : claim TRUE mais < 2 termes métier distincts ---
    const metierCount = countMetierTerms(post);
    if (mutable.checklist_qualite_passee.vocabulaire_metier_ok && metierCount < 2) {
      overrides.push({
        post_position: mutable.post_position,
        field: 'vocabulaire_metier_ok',
        from: true,
        to: false,
        reason: `${metierCount} termes métier distincts trouvés (min 2)`,
      });
      mutable.checklist_qualite_passee.vocabulaire_metier_ok = false;
    }

    // --- 4. longueur_finale : recalcule depuis post_final ---
    const realLength = post.length;
    if (mutable.longueur_finale !== realLength) {
      overrides.push({
        post_position: mutable.post_position,
        field: 'longueur_finale',
        from: mutable.longueur_finale,
        to: realLength,
        reason: 'recalcul depuis post_final.length',
      });
      mutable = { ...mutable, longueur_finale: realLength };
    }

    // --- 5. v2 produit_synvex_ancrage : hérité de l'angle source si absent ---
    if (!mutable.produit_synvex_ancrage) {
      const angleIdForLookup =
        mutable.fusion_used === false
          ? mutable.winner_id
          : (mutable.fusion_used as [string, string])[0];
      const a = angleById.get(angleIdForLookup);
      if (a?.produit_synvex_ancrage) {
        overrides.push({
          post_position: mutable.post_position,
          field: 'produit_synvex_ancrage',
          from: undefined,
          to: a.produit_synvex_ancrage,
          reason: `hérité de l'angle source ${angleIdForLookup}`,
        });
        mutable = { ...mutable, produit_synvex_ancrage: a.produit_synvex_ancrage };
      }
    }
    // Vérifie validité du produit si présent (defense in depth — Zod l'a déjà
    // validé sauf si Agent 7 sort un enum custom).
    if (
      mutable.produit_synvex_ancrage &&
      !PRODUITS_SYNVEX.includes(mutable.produit_synvex_ancrage)
    ) {
      criticalFlags.push(
        `position ${mutable.post_position}: produit_synvex_ancrage invalide (${String(mutable.produit_synvex_ancrage)}).`,
      );
    }

    return mutable;
  }) as WeeklyWinners;

  // --- 5. Validation complémentarité (basée sur les angles d'origine). ---
  // Pour chaque winner, on cherche son archetype et son icp via :
  //   - si fusion_used = false : winner_id = angle_id → lookup direct
  //   - si fusion_used = [id1, id2] : prend archetype du 1er angle (convention)
  const archetypesUsed: string[] = [];
  const icpsUsed: string[] = [];
  const longueursUsed: string[] = [];
  for (const w of processed) {
    const angleIdForLookup =
      w.fusion_used === false ? w.winner_id : (w.fusion_used as [string, string])[0];
    const a = angleById.get(angleIdForLookup);
    if (a) {
      archetypesUsed.push(a.archetype);
      icpsUsed.push(a.icp_vise);
      longueursUsed.push(a.longueur_cible);
    }
  }
  const archetypesDistinct = new Set(archetypesUsed).size;
  const icpsDistinct = new Set(icpsUsed).size;
  const longueursDistinct = new Set(longueursUsed).size;

  if (archetypesDistinct < 2 || icpsDistinct < 2) {
    criticalFlags.push(
      `complémentarité insuffisante : ${archetypesDistinct} archétypes, ${icpsDistinct} ICP distincts (min 2 chacun).`,
    );
  }

  // --- 6. Validation cohérence fusion_used : les angle_ids cités doivent
  //        exister dans les angles d'origine. ---
  for (const w of processed) {
    if (w.fusion_used !== false) {
      const [id1, id2] = w.fusion_used as [string, string];
      if (!angleById.has(id1) || !angleById.has(id2)) {
        criticalFlags.push(
          `position ${w.post_position}: fusion référence angle inconnu (${id1} ou ${id2}).`,
        );
      }
    }
  }

  // v2 — Diversité produit Synvex sur les 3 winners.
  const produitsUsed: ProduitSynvex[] = [];
  for (const w of processed) {
    if (w.produit_synvex_ancrage && PRODUITS_SYNVEX.includes(w.produit_synvex_ancrage)) {
      produitsUsed.push(w.produit_synvex_ancrage);
    }
  }
  const produitsDistinct = new Set(produitsUsed).size;
  // Cible idéale : 3 produits distincts. Acceptable : ≥ 2.
  const produitDiversityOk = produitsDistinct >= 2;
  if (!produitDiversityOk && produitsUsed.length > 0) {
    criticalFlags.push(
      `diversité produit insuffisante : ${produitsDistinct} produit(s) distinct(s) sur 3 winners (min 2).`,
    );
  }

  return {
    winners: processed,
    validation_report: {
      archetypes_distinct: archetypesDistinct,
      icp_distinct: icpsDistinct,
      longueurs_distinct: longueursDistinct,
      produits_synvex_distinct: produitsDistinct,
      produits_synvex_used: produitsUsed,
      produit_synvex_diversity_ok: produitDiversityOk,
      overrides,
      critical_flags: criticalFlags,
      complementarite_ok: archetypesDistinct >= 2 && icpsDistinct >= 2,
    },
  };
}
