/**
 * angles-post-processor — pipeline déterministe post-Opus pour Agent 6.
 *
 * Étapes :
 *   1. Génération automatique des angle_id = `W{week_num}-A{index+1}`.
 *      Override de ce que Claude a renvoyé, garantit l'unicité et le
 *      respect du regex Zod (W{1,2}-A[1-8]).
 *   2. Validation ancrage_assurance non-trivial (regex inclusive).
 *   3. Validation risques non-vide (≥ 1 entrée).
 *   4. Détection mention produit Synvex (Orion, Helios, etc.).
 *   5. Diversité ICP_visé (≥ 4 distincts) et longueur_cible (≥ 2 distincts).
 *
 * Le post-processor ne CORRIGE PAS les angles (sauf angle_id qui est
 * mécaniquement régénéré et risques vide rempli par placeholder). Il
 * valide et flag. Agent 7 pourra écarter en sélection les angles flaggés
 * critiques.
 *
 * Pattern aligné Agent 4 / Agent 5 : toute logique déterministe sort du LLM.
 */
import type { ProduitSynvex, WeeklyAngles } from '@nexus/shared';
import { PRODUITS_SYNVEX } from '@nexus/shared';

/** Regex inclusive — un match ≥ 1 fait passer la validation. */
const ANCRAGE_ASSURANCE_REGEX =
  /\b(S\/P|loss ratio|ratio combiné|ratio combine|IBNR|prime|primes|sinistre|sinistres|ACPR|RGPD|bordereau|bordereaux|MGA|courtage|mutuelle|mutuelles|claims|indemnisation|fronteur|fronting|assureur|assureurs|insurtech|réassureur|reassureur|réassurance|reassurance|conventions|rétrocession|retrocession|rétrocessions|retrocessions|audit trail|matrice de délégation|matrice de delegation|EIOPA|Solvency|solvabilité|solvabilite|CatNat|catnat|IARD|santé collective|sante collective|prévoyance|prevoyance)\b/i;

// v2 mai 2026 : 9 produits Synvex (ajout Vega et Nexus). Cf. §9 context_brief.
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
// Match strict mot-frontières + insensible casse.
const SYNVEX_PRODUCT_REGEX = new RegExp(`\\b(${SYNVEX_PRODUCT_NAMES.join('|')})\\b`, 'i');
const SYNVEX_NAME_REGEX = /\bSynvex\b/i;

const PLACEHOLDER_RISK = 'aucun risque majeur identifié (post-processor placeholder)';

export interface AngleValidationFlag {
  angle_id: string;
  archetype: string;
  flag: string;
  detail?: string;
}

export interface AnglesValidationReport {
  total_angles: number;
  ancrage_assurance_ok: number;
  ancrage_assurance_flagged: AngleValidationFlag[];
  synvex_mention_flagged: AngleValidationFlag[];
  empty_risks_filled: AngleValidationFlag[];
  longueur_cibles_distinct: number;
  icp_vises_distinct: number;
  // v2 mai 2026 — diversité produit Synvex
  produits_synvex_distinct: number;
  produits_synvex_used: ProduitSynvex[];
  produit_synvex_missing: AngleValidationFlag[];
  produit_synvex_diversity_ok: boolean; // ≥ 5 produits distincts sur 8 angles
  /** True si flags critiques (mention Synvex / produit) détectés. */
  has_critical_flags: boolean;
}

export interface PostProcessAnglesOutput {
  angles: WeeklyAngles;
  validation_report: AnglesValidationReport;
}

/**
 * Extrait le numéro de semaine d'un week_id ISO 8601 (ex: "2026-W20" → 20).
 * Throw si format invalide.
 */
function extractWeekNumber(weekId: string): number {
  const match = /^\d{4}-W(\d{2})$/.exec(weekId);
  if (!match) throw new Error(`invalid_week_id_format: ${weekId} (expected YYYY-Www)`);
  const n = Number.parseInt(match[1]!, 10);
  if (Number.isNaN(n) || n < 1 || n > 53) {
    throw new Error(`invalid_week_number: ${weekId}`);
  }
  return n;
}

export function postProcessAngles(angles: WeeklyAngles, weekId: string): PostProcessAnglesOutput {
  const weekNum = extractWeekNumber(weekId);

  // 1. Régénération angle_id mécanique.
  const reIdAngles: WeeklyAngles = angles.map((a, i) => ({
    ...a,
    angle_id: `W${weekNum}-A${i + 1}`,
  })) as WeeklyAngles;

  const ancrageFlags: AngleValidationFlag[] = [];
  const synvexFlags: AngleValidationFlag[] = [];
  const emptyRisksFlags: AngleValidationFlag[] = [];

  // 2-4. Validation par angle.
  const finalAngles: WeeklyAngles = reIdAngles.map((a) => {
    let mutable = { ...a };

    // 2. Ancrage assurance regex.
    if (!ANCRAGE_ASSURANCE_REGEX.test(mutable.ancrage_assurance)) {
      ancrageFlags.push({
        angle_id: mutable.angle_id,
        archetype: mutable.archetype,
        flag: 'ancrage_assurance_trivial',
        detail: mutable.ancrage_assurance.slice(0, 120),
      });
    }

    // 3. Risques vide → placeholder + flag.
    if (mutable.risques.length === 0) {
      emptyRisksFlags.push({
        angle_id: mutable.angle_id,
        archetype: mutable.archetype,
        flag: 'risques_empty_filled_with_placeholder',
      });
      mutable = { ...mutable, risques: [PLACEHOLDER_RISK] };
    }

    // 4. Détection mention Synvex / produits Synvex sur les champs free-text.
    const allText = [
      mutable.titre_interne,
      mutable.hook_brut,
      mutable.these_centrale,
      mutable.promesse_lecteur,
      mutable.structure_proposee,
      mutable.tonalite,
      mutable.ancrage_assurance,
      mutable.ancrage_linkedin,
      ...mutable.risques,
    ].join('\n');
    if (SYNVEX_PRODUCT_REGEX.test(allText)) {
      synvexFlags.push({
        angle_id: mutable.angle_id,
        archetype: mutable.archetype,
        flag: 'synvex_product_name_mentioned',
        detail: SYNVEX_PRODUCT_REGEX.exec(allText)?.[0] ?? '',
      });
    }
    if (SYNVEX_NAME_REGEX.test(allText)) {
      synvexFlags.push({
        angle_id: mutable.angle_id,
        archetype: mutable.archetype,
        flag: 'synvex_brand_name_mentioned',
      });
    }

    return mutable;
  }) as WeeklyAngles;

  // 5. Diversité ICP + longueur_cible.
  const distinctIcp = new Set(finalAngles.map((a) => a.icp_vise)).size;
  const distinctLongueur = new Set(finalAngles.map((a) => a.longueur_cible)).size;

  // 6. v2 — Diversité produit Synvex (champ optionnel pour backward compat).
  const validProduits = new Set<ProduitSynvex>(PRODUITS_SYNVEX);
  const produitFlags: AngleValidationFlag[] = [];
  const produitsUsed: ProduitSynvex[] = [];
  for (const a of finalAngles) {
    const p = a.produit_synvex_ancrage;
    if (!p) {
      produitFlags.push({
        angle_id: a.angle_id,
        archetype: a.archetype,
        flag: 'produit_synvex_ancrage_missing',
      });
    } else if (!validProduits.has(p as ProduitSynvex)) {
      produitFlags.push({
        angle_id: a.angle_id,
        archetype: a.archetype,
        flag: 'produit_synvex_ancrage_invalid',
        detail: String(p),
      });
    } else {
      produitsUsed.push(p as ProduitSynvex);
    }
  }
  const distinctProduits = new Set(produitsUsed).size;
  // Cible : ≥ 5 produits distincts sur 8 angles. Si < 5, flag (pas critique mais warning).
  const produitDiversityOk = distinctProduits >= 5;

  const report: AnglesValidationReport = {
    total_angles: finalAngles.length,
    ancrage_assurance_ok: finalAngles.length - ancrageFlags.length,
    ancrage_assurance_flagged: ancrageFlags,
    synvex_mention_flagged: synvexFlags,
    empty_risks_filled: emptyRisksFlags,
    longueur_cibles_distinct: distinctLongueur,
    icp_vises_distinct: distinctIcp,
    produits_synvex_distinct: distinctProduits,
    produits_synvex_used: produitsUsed,
    produit_synvex_missing: produitFlags,
    produit_synvex_diversity_ok: produitDiversityOk,
    has_critical_flags: synvexFlags.length > 0,
  };

  return { angles: finalAngles, validation_report: report };
}
