// rag-light — helper pur pour le RAG light d'Agent 6 (V2 Measurement Loop).
//
// 3 paliers selon le nombre de posts publiés ET mesurés :
//   n < 5  → disabled_insufficient_data (RAG off en silence)
//   5..9   → light_mode_limited_data (3 top performers injectés)
//   ≥ 10   → full_mode (5 top performers injectés)
//
// Score composite : likes + 3×comments + 5×reposts. Les comments valent plus
// que les likes (engagement plus coûteux), les reposts encore plus (amplification).
//
// Le helper est volontairement pur (input rows = output prompt fragment). Les
// queries SQL sont faites côté Edge Function (Deno) qui appelle ce module via
// jsr ou import direct du fichier compilé. Pour les tests Vitest, on importe
// la fonction telle quelle.

export interface MeasuredPostRow {
  post_id: string;
  archetype: string;
  icp: string | null;
  length_target: string | null;
  /** Hook = premier paragraphe du post_final (jusqu'au premier \n\n). */
  hook_excerpt: string;
  /** Premier paragraphe complet (jusqu'à 300 chars). */
  first_paragraph: string;
  /** Likes de la mesure la plus récente (J+14 si dispo, sinon J+7). */
  likes: number;
  comments: number;
  reposts: number;
  /** ISO. Mesure utilisée pour le score. */
  measured_at: string;
}

export type RagStatus =
  | 'disabled_insufficient_data'
  | 'light_mode_limited_data'
  | 'full_mode';

export interface RagResult {
  status: RagStatus;
  measured_posts_count: number;
  top_performers: MeasuredPostRow[];
  /** Bloc texte à injecter dans le system prompt. '' si status=disabled. */
  prompt_fragment: string;
}

/**
 * Score composite pondéré. Réutilisable côté SQL (ORDER BY) et TS (sort).
 *   composite = likes + 3*comments + 5*reposts
 */
export function scoreComposite(row: {
  likes: number;
  comments: number;
  reposts: number;
}): number {
  return row.likes + 3 * row.comments + 5 * row.reposts;
}

/**
 * Trie un set de posts mesurés par score composite décroissant.
 */
export function sortByComposite<T extends MeasuredPostRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => scoreComposite(b) - scoreComposite(a));
}

/**
 * Compose le bloc texte à injecter dans le system prompt d'Agent 6.
 * Si status=disabled, retourne ''. Sinon retourne un bloc préfixé par
 * `=== DONNÉES TERRAIN ... ===` et listant 3 ou 5 posts.
 */
export function buildRagPromptFragment(
  status: RagStatus,
  topPerformers: MeasuredPostRow[],
): string {
  if (status === 'disabled_insufficient_data') return '';

  const isLight = status === 'light_mode_limited_data';
  const header = isLight
    ? '=== DONNÉES TERRAIN (limitées, 5-9 posts publiés) ==='
    : '=== DONNÉES TERRAIN (5 top performers) ===';
  const intro = isLight
    ? "Voici les 3 posts Synvex récents qui ont le mieux performé. Inspire-toi des mécaniques, NE COPIE PAS le contenu :"
    : "Voici les 5 posts Synvex qui ont le mieux performé sur les dernières publications. Identifie les mécaniques récurrentes (hook, structure, longueur, bridge produit) qui semblent marcher pour cette audience spécifique. Inspire-toi sans plagier.";
  const footer = isLight
    ? "\nCes données sont limitées (moins de 10 posts), garde suffisamment de diversité éditoriale pour explorer d'autres formats."
    : '';

  const lines = topPerformers.map((p, i) => {
    const sc = scoreComposite(p);
    return `[POST ${i + 1}] score_composite=${sc} | archetype=${p.archetype} | icp=${p.icp ?? '?'} | longueur=${p.length_target ?? '?'}
hook="${p.hook_excerpt}"
premier_paragraphe="${p.first_paragraph}"`;
  });

  return `${header}\n${intro}\n\n${lines.join('\n\n')}${footer}`;
}

/**
 * Entrée principale. Décide du palier, trie, tronque, compose le fragment.
 *
 * @param allMeasuredRows tous les posts ayant ≥1 mesure (déjà jointe DB-side).
 *   Le caller (Edge Function) fait la requête SQL puis passe le résultat ici.
 *   Logique pure : pas de DB ici.
 * @returns { status, measured_posts_count, top_performers, prompt_fragment }
 */
export function decideRag(allMeasuredRows: MeasuredPostRow[]): RagResult {
  const n = allMeasuredRows.length;
  if (n < 5) {
    return {
      status: 'disabled_insufficient_data',
      measured_posts_count: n,
      top_performers: [],
      prompt_fragment: '',
    };
  }

  const sorted = sortByComposite(allMeasuredRows);
  const status: RagStatus = n < 10 ? 'light_mode_limited_data' : 'full_mode';
  const k = status === 'light_mode_limited_data' ? 3 : 5;
  const topPerformers = sorted.slice(0, k);
  const fragment = buildRagPromptFragment(status, topPerformers);

  return {
    status,
    measured_posts_count: n,
    top_performers: topPerformers,
    prompt_fragment: fragment,
  };
}
