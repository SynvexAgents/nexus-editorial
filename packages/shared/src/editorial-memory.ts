// editorial-memory — diversity engine v2.3 (mai 2026).
// Helpers PURS (testables) pour : pool de 10 archétypes, axe d'attaque
// hebdomadaire tournant, et bloc "HISTORIQUE ÉDITORIAL" injecté dans les
// prompts Agent 6 & Agent 7 pour éviter la redite semaine après semaine.
//
// Aucune dépendance runtime : pas de DB, pas de fetch. Le caller (Edge
// Function) fait la query Supabase puis passe les rows ici.

// ---------------------------------------------------------------------------
// POOL D'ARCHÉTYPES (10) — Agent 6 en sélectionne un sous-ensemble distinct
// chaque semaine (8 angles → 8 archétypes distincts tirés de ces 10).
// ---------------------------------------------------------------------------
export interface ArchetypeDef {
  key: string;
  label: string;
  description: string;
  /** Registre dominant : analytique | narratif | engageant. Sert à varier. */
  registre: 'analytique' | 'narratif' | 'engageant';
}

export const ARCHETYPE_POOL: readonly ArchetypeDef[] = [
  {
    key: 'constat_lucide',
    label: 'CONSTAT LUCIDE',
    description:
      "observation froide et juste sur l'état du marché assurance. Ton posé, analytique.",
    registre: 'analytique',
  },
  {
    key: 'anecdote_terrain',
    label: 'ANECDOTE TERRAIN',
    description:
      "scène concrète anonymisée du quotidien d'un cabinet/gestionnaire. Narratif, immersif.",
    registre: 'narratif',
  },
  {
    key: 'these_marche',
    label: 'THÈSE DE MARCHÉ',
    description:
      "projection argumentée sur l'évolution du métier dans 12-24 mois. Vision structurée.",
    registre: 'analytique',
  },
  {
    key: 'question_contre_intuitive',
    label: 'QUESTION CONTRE-INTUITIVE',
    description:
      'pose une question qui retourne une croyance répandue du secteur. Ouvre une réflexion.',
    registre: 'engageant',
  },
  {
    key: 'cas_chiffre',
    label: 'CAS CHIFFRÉ',
    description:
      'mini-étude anonymisée avec chiffres avant/après. Situation → action → résultat mesurable.',
    registre: 'analytique',
  },
  {
    key: 'take_controversee',
    label: 'TAKE CONTROVERSÉE',
    description:
      'position frontale et assumée contre un consensus mou du secteur. Clive intelligemment.',
    registre: 'engageant',
  },
  {
    key: 'decryptage_process',
    label: 'DÉCRYPTAGE PROCESS',
    description:
      "explique comment un mécanisme métier fonctionne vraiment (sinistre, souscription, conformité), là où l'IA s'insère.",
    registre: 'analytique',
  },
  {
    key: 'retour_experience',
    label: "RETOUR D'EXPÉRIENCE",
    description:
      "une leçon tirée d'un échec ou d'une difficulté, assumée avec lucidité. Humain, authentique.",
    registre: 'narratif',
  },
  {
    key: 'lettre_ouverte',
    label: 'LETTRE OUVERTE',
    description:
      's\'adresse directement à un type d\'acteur ("Aux dirigeants de courtage qui hésitent encore sur l\'IA…"). Direct, engageant.',
    registre: 'engageant',
  },
  {
    key: 'comparaison_cross_secteur',
    label: 'COMPARAISON CROSS-SECTEUR',
    description:
      'analogie avec un autre secteur (banque, santé, logistique, retail) qui éclaire un enjeu assurance. Élargit la perspective.',
    registre: 'narratif',
  },
] as const;

/** Set des clés du pool actif — pour validation de couverture (Agent 6). */
export const ARCHETYPE_POOL_KEYS: readonly string[] = ARCHETYPE_POOL.map((a) => a.key);

/** Rend le bloc texte listant les 10 archétypes + règles de sélection. */
export function buildArchetypePoolBlock(): string {
  const lines = ARCHETYPE_POOL.map(
    (a, i) => `${i + 1}. ${a.label} (${a.key}) — ${a.description}`,
  );
  return `=== POOL D'ARCHÉTYPES (sélectionne-en 8 DIFFÉRENTS parmi ces 10) ===

${lines.join('\n')}

RÈGLES DE SÉLECTION :
- Tes 8 angles utilisent 8 archétypes DISTINCTS tirés de ce pool de 10 (2 archétypes resteront non utilisés cette semaine — varie lesquels d'une semaine à l'autre).
- Priorise les archétypes NON utilisés dans les 3 dernières semaines (cf. HISTORIQUE ÉDITORIAL).
- Varie les registres : ne concentre pas les angles sur un seul registre. Mixe analytique / narratif / engageant.
- Le champ "archetype" du JSON doit être la clé snake_case exacte (constat_lucide, anecdote_terrain, these_marche, question_contre_intuitive, cas_chiffre, take_controversee, decryptage_process, retour_experience, lettre_ouverte, comparaison_cross_secteur).`;
}

// ---------------------------------------------------------------------------
// AXE D'ATTAQUE TOURNANT — 6 axes, rotation déterministe par numéro de semaine.
// ---------------------------------------------------------------------------
export interface AttackAxis {
  key: string;
  label: string;
  focus: string;
}

export const ATTACK_AXES: readonly AttackAxis[] = [
  { key: 'REGLEMENTAIRE', label: 'RÉGLEMENTAIRE', focus: 'conformité, ACPR, devoir de conseil, audit' },
  { key: 'OPERATIONNEL', label: 'OPÉRATIONNEL', focus: 'productivité, traitement, back-office, volume' },
  { key: 'HUMAIN', label: 'HUMAIN', focus: 'métier, expertise, valeur du gestionnaire, emploi' },
  { key: 'ECONOMIQUE', label: 'ÉCONOMIQUE', focus: 'coûts, marge, ROI, rentabilité cabinet' },
  { key: 'TECHNOLOGIQUE', label: 'TECHNOLOGIQUE', focus: "comment l'IA marche, agents, fiabilité, limites" },
  { key: 'PROSPECTIF', label: 'PROSPECTIF', focus: 'futur du métier, nouveaux modèles, disruption' },
] as const;

/**
 * Axe de la semaine : (numéro ISO) % 6. Rotation régulière sur 6 semaines.
 * Ex : W24 → 24 % 6 = 0 → REGLEMENTAIRE.
 */
export function computeAttackAxis(weekNumber: number): AttackAxis {
  const n = Number.isFinite(weekNumber) ? Math.abs(Math.trunc(weekNumber)) : 0;
  // ATTACK_AXES est un tuple non-vide ; le modulo garantit un index valide.
  return ATTACK_AXES[n % ATTACK_AXES.length] as AttackAxis;
}

/** Bloc texte de l'axe d'attaque pour le prompt Agent 6. */
export function buildAttackAxisBlock(weekNumber: number): string {
  const axis = computeAttackAxis(weekNumber);
  return `=== AXE D'ATTAQUE DE LA SEMAINE : ${axis.label} (${axis.focus}) ===
Au moins 2 des 3 posts retenus cette semaine doivent aborder l'enjeu assurance × IA sous l'angle ${axis.label}. Le 3e peut explorer un autre axe pour l'équilibre. Cet axe oriente le FOND, pas la forme — combine-le librement avec les archétypes.`;
}

// ---------------------------------------------------------------------------
// HISTORIQUE ÉDITORIAL — extrait les archétypes/hooks/angles des semaines
// précédentes pour pousser Agent 6 & 7 vers la nouveauté.
// ---------------------------------------------------------------------------
export interface WeekHistoryRow {
  week_id: string;
  angles_json?: unknown;
  winners_json?: unknown;
}

function firstLine(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  const line = text.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

interface ExtractedWeek {
  week_id: string;
  archetypes: string[];
  hooks: string[];
  angles: string[];
}

/** Extraction défensive d'une semaine (raw JSON, formes hétérogènes tolérées). */
export function extractWeekSignals(row: WeekHistoryRow): ExtractedWeek {
  const angles = Array.isArray(row.angles_json) ? (row.angles_json as Record<string, unknown>[]) : [];
  const winners = Array.isArray(row.winners_json)
    ? (row.winners_json as Record<string, unknown>[])
    : [];

  const archetypes = [
    ...new Set(
      angles
        .map((a) => (typeof a.archetype === 'string' ? a.archetype : ''))
        .filter((s) => s.length > 0),
    ),
  ];

  // Hooks : priorité aux posts GAGNANTS (premières lignes des post_final).
  // Fallback : hook_brut des premiers angles si aucun winner.
  let hooks = winners
    .map((w) => firstLine(w.post_final, 90))
    .filter((h) => h.length > 0)
    .slice(0, 3);
  if (hooks.length === 0) {
    hooks = angles
      .map((a) => firstLine(a.hook_brut, 90))
      .filter((h) => h.length > 0)
      .slice(0, 3);
  }

  const titles = angles
    .map((a) => (typeof a.titre_interne === 'string' ? a.titre_interne : ''))
    .filter((t) => t.length > 0)
    .slice(0, 4)
    .map((t) => (t.length > 60 ? `${t.slice(0, 60)}…` : t));

  return { week_id: row.week_id, archetypes, hooks, angles: titles };
}

/**
 * Construit le bloc HISTORIQUE ÉDITORIAL injecté dans le prompt système.
 * Retourne '' si aucune semaine (=> rien à injecter, fallback silencieux).
 */
export function buildEditorialHistoryBlock(rows: WeekHistoryRow[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const weeks = rows
    .map(extractWeekSignals)
    .filter((w) => w.archetypes.length > 0 || w.hooks.length > 0);
  if (weeks.length === 0) return '';

  const lines = weeks.map((w, i) => {
    const arche = w.archetypes.length ? w.archetypes.join(', ') : '(inconnus)';
    const hooks = w.hooks.length ? w.hooks.map((h) => `"${h}"`).join(' | ') : '(aucun)';
    const angles = w.angles.length ? w.angles.join(' ; ') : '(n/a)';
    return `[Semaine W-${i + 1} = ${w.week_id}] Archétypes : ${arche}. Hooks : ${hooks}. Angles : ${angles}.`;
  });

  return `=== HISTORIQUE ÉDITORIAL (${weeks.length} dernières semaines) ===
Voici ce qui a déjà été produit. Tu dois proposer des angles SUBSTANTIELLEMENT DIFFÉRENTS — pas une variation cosmétique des mêmes idées. Évite de réutiliser les mêmes hooks, les mêmes mécaniques d'accroche, les mêmes structures.

${lines.join('\n')}

RÈGLE ABSOLUE : si un de tes angles ressemble à un angle des 3 dernières semaines (même sujet + même traitement), remplace-le.`;
}
