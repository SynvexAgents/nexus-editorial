// rag-light (Deno copy) — miroir 1:1 de packages/shared/src/rag-light.ts.
// Deno ne peut pas importer depuis packages/ donc on duplique. Toute
// modification doit être propagée des 2 côtés (les Vitest tests testent
// la copie packages/shared, qui fait foi). Voir l'original pour les
// commentaires détaillés.

export interface MeasuredPostRow {
  post_id: string;
  archetype: string;
  icp: string | null;
  length_target: string | null;
  hook_excerpt: string;
  first_paragraph: string;
  likes: number;
  comments: number;
  reposts: number;
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
  prompt_fragment: string;
}

export function scoreComposite(row: {
  likes: number;
  comments: number;
  reposts: number;
}): number {
  return row.likes + 3 * row.comments + 5 * row.reposts;
}

export function sortByComposite<T extends MeasuredPostRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => scoreComposite(b) - scoreComposite(a));
}

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

/**
 * Query Supabase pour récupérer tous les posts mesurés avec leur meilleure
 * mesure (J+14 prioritaire, sinon J+7). Edge Function uniquement.
 *
 * Stratégie : 2 queries simples (publishedposts non archivés, perfs jointes)
 * + assemblage côté TS. Plus simple qu'un view SQL et reste sous le radar
 * en termes de coût.
 */
export async function fetchMeasuredPostsForRag(sb: {
  from: (t: string) => unknown;
}): Promise<MeasuredPostRow[]> {
  // 1. Pull all non-archived published_posts.
  // biome-ignore lint/suspicious/noExplicitAny: Supabase typed loosely here.
  const { data: pp, error: ppErr } = await (sb.from('published_posts') as any)
    .select('post_id, archetype, icp, length_target, week_id, position')
    .eq('archived', false);
  if (ppErr) throw new Error(`published_posts_query_failed: ${ppErr.message}`);
  const rows = (pp ?? []) as Array<{
    post_id: string;
    archetype: string;
    icp: string | null;
    length_target: string | null;
    week_id: string;
    position: number;
  }>;
  if (rows.length === 0) return [];

  // 2. Pull all perf rows for those post_ids in one shot.
  const ids = rows.map((r) => r.post_id);
  // biome-ignore lint/suspicious/noExplicitAny: Supabase typed loosely here.
  const { data: perfs, error: perfErr } = await (sb.from('post_performance') as any)
    .select('post_id, days_since_publish, likes, comments, reposts, measured_at')
    .in('post_id', ids);
  if (perfErr) throw new Error(`post_performance_query_failed: ${perfErr.message}`);
  const allPerfs = (perfs ?? []) as Array<{
    post_id: string;
    days_since_publish: number;
    likes: number | null;
    comments: number | null;
    reposts: number | null;
    measured_at: string;
  }>;

  // 3. Index perfs par post_id, garder la mesure préférée (J+14 sinon J+7).
  const bestPerfByPost = new Map<
    string,
    { likes: number; comments: number; reposts: number; measured_at: string }
  >();
  for (const p of allPerfs) {
    const current = bestPerfByPost.get(p.post_id);
    if (!current || (p.days_since_publish === 14 && current.measured_at !== p.measured_at)) {
      bestPerfByPost.set(p.post_id, {
        likes: p.likes ?? 0,
        comments: p.comments ?? 0,
        reposts: p.reposts ?? 0,
        measured_at: p.measured_at,
      });
    }
  }

  // 4. Pull winners_json pour les week_ids concernés (pour extraire post_final
  //    excerpt = hook + premier paragraphe).
  const weekIds = [...new Set(rows.map((r) => r.week_id))];
  // biome-ignore lint/suspicious/noExplicitAny: Supabase typed loosely here.
  const { data: reports, error: repErr } = await (sb.from('weekly_reports') as any)
    .select('week_id, winners_json')
    .in('week_id', weekIds);
  if (repErr) throw new Error(`weekly_reports_query_failed: ${repErr.message}`);
  const reportByWeek = new Map<string, unknown>();
  for (const r of (reports ?? []) as Array<{ week_id: string; winners_json: unknown }>) {
    reportByWeek.set(r.week_id, r.winners_json);
  }

  // 5. Compose les MeasuredPostRow finaux.
  const out: MeasuredPostRow[] = [];
  for (const row of rows) {
    const perf = bestPerfByPost.get(row.post_id);
    if (!perf) continue; // Pas encore mesuré → on l'ignore (n exclut ce post).
    const winnersJson = reportByWeek.get(row.week_id);
    let hook = '';
    let firstPara = '';
    if (Array.isArray(winnersJson)) {
      const w = (winnersJson as Array<{ post_position: number; post_final?: string }>).find(
        (x) => x.post_position === row.position,
      );
      if (w?.post_final) {
        const lines = w.post_final.split(/\n+/);
        hook = (lines[0] ?? '').slice(0, 200);
        firstPara = (lines.slice(0, 2).join(' ') ?? '').slice(0, 300);
      }
    }
    out.push({
      post_id: row.post_id,
      archetype: row.archetype,
      icp: row.icp,
      length_target: row.length_target,
      hook_excerpt: hook,
      first_paragraph: firstPara,
      likes: perf.likes,
      comments: perf.comments,
      reposts: perf.reposts,
      measured_at: perf.measured_at,
    });
  }
  return out;
}
