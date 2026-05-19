// agent-5-insurance-trends
// Endpoint POST. Interroge Perplexity Sonar Pro sur 7 clusters
// thématiques assurance FR, séquentiel (PERPLEXITY_CONCURRENCY=1 pour
// éviter le throttle observé). Validation Zod par item, vérification
// HTTP des source_url, post-processing déterministe (dedup, sort,
// slice, synthèse). UPSERT weekly_reports.insurance_trends_json.
//
// Body : { week_id: string, force?: boolean, only_cluster?: string }
//
// ATTENTION : peut dépasser le timeout 150s Edge Function (run W19
// réel a pris 66s, W20 85s). Si dépassement systématique, à découper
// en 2 functions (clusters 1-4 et 5-7).

import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { requireEnv } from '../_shared/env.ts';
import { extractJsonArray } from '../_shared/json_extract.ts';
import { logger } from '../_shared/logger.ts';
import { computePerplexityCost } from '../_shared/pricing.ts';
import { type InsuranceTrendItem, insuranceTrendItemSchema } from '../_shared/schemas.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { type WeekRange, currentIsoWeek, isoWeekToDateRange } from '../_shared/week.ts';

type ClusterId =
  | 'regulation_acpr'
  | 'sinistres_fraude'
  | 'courtage_distribution'
  | 'mutuelles_complementaires'
  | 'insurtech_ia_assurance'
  | 'back_office_productivite'
  | 'signaux_faibles';

interface ClusterDef {
  id: ClusterId;
  label: string;
  priority: number;
  query_builder: (r: WeekRange) => string;
}

const SOURCES = [
  'acpr.banque-france.fr',
  'argusdelassurance.com',
  'newsassurancespro.com',
  'tribuneassurance.fr',
  'lesechos.fr',
  'latribune.fr',
  'eba.europa.eu',
  'eiopa.europa.eu',
];
const ITEM_SCHEMA_DESCR = `Chaque entrée doit être un objet JSON avec EXACTEMENT ces 5 champs :
- "titre" : string non vide.
- "source_url" : URL ABSOLUE (https://).
- "resume_2_lignes" : 1-2 phrases FR.
- "date" : ISO 8601 (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ssZ).
- "impact_metier" : 1 phrase implication courtier / MGA / mutuelle / délégataire FR.

Retourne UN SEUL tableau JSON, commençant par [ et finissant par ]. Aucun texte hors JSON.`;
const srcList = (extra: string[] = []) => [...SOURCES, ...extra].map((s) => `- ${s}`).join('\n');

const CLUSTERS: ClusterDef[] = [
  {
    id: 'regulation_acpr',
    label: 'Réglementation ACPR / EIOPA',
    priority: 1,
    query_builder: ({ date_start, date_end }) =>
      `Liste les actualités, communiqués, décisions, sanctions ou tendances de l'ACPR, EIOPA, ou réglementation assurance française au cours de la période du ${date_start} au ${date_end} (7 jours).\n\nSources de référence (à privilégier mais médias FR sérieux acceptés) :\n${srcList()}\n\n${ITEM_SCHEMA_DESCR}\n\nCible : 3 à 8 entrées max. Si peu de matière, moins d'entrées plutôt que du bruit.`,
  },
  {
    id: 'sinistres_fraude',
    label: 'Sinistres, fraude, indemnisation',
    priority: 2,
    query_builder: ({ date_start, date_end }) =>
      `Liste les actualités sur sinistres FR, fraude documentaire, gestion d'indemnisation, ratio S/P, bordereaux, conventions sinistres, délais de règlement, sur ${date_start} au ${date_end}.\n\nSources :\n${srcList()}\n\n${ITEM_SCHEMA_DESCR}\n\nCible : 3-8. Exclus marketing. Privilégie : retours cabinet, données sectorielles, alertes fraude, décisions judiciaires.`,
  },
  {
    id: 'courtage_distribution',
    label: 'Courtage et distribution',
    priority: 3,
    query_builder: ({ date_start, date_end }) =>
      `Actualités courtage FR : consolidation, M&A, apporteurs, rétrocessions, commissions, embauches stratégiques, plateformes, partenariats compagnie/courtier. Période ${date_start} au ${date_end}.\n\nSources :\n${srcList()}\n\n${ITEM_SCHEMA_DESCR}\n\nCible : 3-8. Privilégie : Bessé, Verspieren, Diot-Siaci, Aon France, WTW, Adelaïde, +Simple. Exclus B2C.`,
  },
  {
    id: 'mutuelles_complementaires',
    label: 'Mutuelles santé et complémentaires',
    priority: 4,
    query_builder: ({ date_start, date_end }) =>
      `Actualités mutuelles santé FR, complémentaires, prévoyance collective, négociations tarifaires, fusions, évolutions réglementaires santé. Période ${date_start} au ${date_end}.\n\nSources :\n${srcList(['mutuelle-info.com', 'previssima.fr'])}\n\n${ITEM_SCHEMA_DESCR}\n\nCible : 3-8. Privilégie : VYV, MGEN, Harmonie, Mutuelle des Motards, mutuelles régionales. Exclus RP sans fact.`,
  },
  {
    id: 'insurtech_ia_assurance',
    label: 'Insurtech FR + IA appliquée assurance',
    priority: 5,
    query_builder: ({ date_start, date_end }) =>
      `Actualités insurtechs FR + IA assurance : levées, lancements, partenariats compagnies, déploiements IA souscription/sinistres/tarification. Période ${date_start} au ${date_end}.\n\nSources :\n${srcList(['maddyness.com', 'usine-digitale.fr', 'frenchweb.fr', 'techcrunch.com (insurtechs FR)'])}\n\n${ITEM_SCHEMA_DESCR}\n\nCible : 3-8. Privilégie : Seyna, Descartes Underwriting, Stoïk, +Simple, Tinubu, Akur8, Shift Technology, Zelros. Exclus growth marketing.`,
  },
  {
    id: 'back_office_productivite',
    label: 'Back-office et productivité opérationnelle',
    priority: 6,
    query_builder: ({ date_start, date_end }) =>
      `Productivité back-office assurance FR : automatisation, dématérialisation, IA documentaire, STP, outsourcing, embauches/licenciements transfo. Période ${date_start} au ${date_end}.\n\nSources :\n${srcList(['usine-digitale.fr', 'lemondeinformatique.fr'])}\n\n${ITEM_SCHEMA_DESCR}\n\nCible : 3-8. Privilégie : retours terrain chiffrés, déploiements, gains mesurés. Exclus livres blancs.`,
  },
  {
    id: 'signaux_faibles',
    label: 'Signaux faibles et tendances émergentes',
    priority: 7,
    query_builder: ({ date_start, date_end }) =>
      `Signaux faibles / tendances émergentes assurance FR : annonces discrètes, embauches inhabituelles, levées sous radar, partenariats inattendus, bascules dirigeants. Période ${date_start} au ${date_end}.\n\nSources :\n${srcList(['maddyness.com', 'frenchweb.fr', 'lemondeinformatique.fr'])}\n\n${ITEM_SCHEMA_DESCR}\n\nCible : 2-6. Privilégie signal authentique. Si rien, moins d'entrées.`,
  },
];

// ----------------------------------------------------------------------------
// Date normalization (port complet)
// ----------------------------------------------------------------------------
function normalizeDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00+00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    let out = trimmed.replace(/Z$/, '+00:00');
    out = out.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const d = new Date(out);
    if (Number.isNaN(d.getTime())) return null;
    return out;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/Z$/, '+00:00');
}

// ----------------------------------------------------------------------------
// URL verifier (HEAD/GET parallel pool, accepte 999 anti-bot LinkedIn-like)
// ----------------------------------------------------------------------------
const OK_STATUSES = new Set([200, 201, 203, 204, 301, 302, 303, 307, 308, 999]);
const REJECTED_STATUSES = new Set([400, 401, 403, 404, 410, 451, 500, 502, 503, 504]);

async function verifyUrlsParallel(
  urls: string[],
  concurrency = 10,
): Promise<{
  ok: string[];
  rejected: Array<{ url: string; reason: string; status?: number }>;
}> {
  const ok: string[] = [];
  const rejected: Array<{ url: string; reason: string; status?: number }> = [];
  const unique = [...new Set(urls)];
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const res = await Promise.all(
      chunk.map(async (u) => {
        let parsed: URL;
        try {
          parsed = new URL(u);
        } catch {
          return { url: u, reason: 'invalid_url' };
        }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return { url: u, reason: 'bad_protocol' };
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        try {
          let r = await fetch(u, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'NexusEditorial/0.4 (+https://synvex.fr)' },
          });
          if (r.status === 405 || r.status === 501) {
            r = await fetch(u, {
              method: 'GET',
              signal: controller.signal,
              redirect: 'follow',
              headers: { 'User-Agent': 'NexusEditorial/0.4 (+https://synvex.fr)' },
            });
          }
          if (OK_STATUSES.has(r.status)) return { url: u, status: r.status };
          if (REJECTED_STATUSES.has(r.status))
            return { url: u, status: r.status, reason: `http_${r.status}` };
          return { url: u, status: r.status, reason: `unexpected_${r.status}` };
        } catch (e) {
          return {
            url: u,
            reason:
              (e as Error).name === 'AbortError' ? 'timeout' : `network:${(e as Error).message}`,
          };
        } finally {
          clearTimeout(timeout);
        }
      }),
    );
    for (const r of res) {
      if (r.reason)
        rejected.push({
          url: r.url,
          reason: r.reason,
          ...(r.status !== undefined ? { status: r.status } : {}),
        });
      else ok.push(r.url);
    }
  }
  return { ok, rejected };
}

// ----------------------------------------------------------------------------
// Perplexity call + retry
// ----------------------------------------------------------------------------
const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const SYSTEM_PERPLEXITY =
  "Tu es un agent de veille assurance FR. Tu réponds par UN SEUL tableau JSON valide, commençant par [ et finissant par ]. Aucun texte hors JSON. Aucune balise markdown. Privilégie les sources françaises spécialisées assurance, mais tu peux citer d'autres médias FR sérieux (Les Echos, La Tribune, etc.) si l'actualité y est mieux documentée. L'important : items factuels, datés, avec URL réelle vérifiable.";

async function callPerplexity(
  prompt: string,
  apiKey: string,
  timeoutMs = 90_000,
): Promise<{
  text: string;
  input_tokens: number;
  output_tokens: number;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: SYSTEM_PERPLEXITY },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`perplexity_http_${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(t);
  }
}

async function callWithRetry(
  prompt: string,
  apiKey: string,
): Promise<{ text: string; input_tokens: number; output_tokens: number; attempts: number }> {
  let last: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const r = await callPerplexity(prompt, apiKey);
      return { ...r, attempts: attempt };
    } catch (e) {
      last = e as Error;
      const msg = last.message;
      const transient = /perplexity_http_(429|5\d{2})/.test(msg) || /timeout/i.test(msg);
      if (!transient || attempt > 2) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw last ?? new Error('perplexity_unknown_error');
}

// ----------------------------------------------------------------------------
// Cluster pipeline (séquentiel pour éviter throttle Perplexity)
// ----------------------------------------------------------------------------
interface ClusterStats {
  cluster_id: ClusterId;
  duration_ms: number;
  attempts: number;
  status: 'ok' | 'failed' | 'partial';
  raw_items_returned: number;
  zod_rejected: number;
  url_rejected: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error?: string;
}

function preprocessItem(c: unknown): unknown {
  if (typeof c !== 'object' || !c) return c;
  const obj = c as Record<string, unknown>;
  if (typeof obj.date === 'string') {
    const norm = normalizeDate(obj.date);
    if (norm) return { ...obj, date: norm };
  }
  return c;
}

async function runClusterPipeline(
  cluster: ClusterDef,
  range: WeekRange,
  apiKey: string,
): Promise<{ items: InsuranceTrendItem[]; stats: ClusterStats }> {
  const t0 = Date.now();
  const stats: ClusterStats = {
    cluster_id: cluster.id,
    duration_ms: 0,
    attempts: 0,
    status: 'failed',
    raw_items_returned: 0,
    zod_rejected: 0,
    url_rejected: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
  };

  let result: { text: string; input_tokens: number; output_tokens: number; attempts: number };
  try {
    result = await callWithRetry(cluster.query_builder(range), apiKey);
  } catch (e) {
    stats.duration_ms = Date.now() - t0;
    stats.error = (e as Error).message;
    return { items: [], stats };
  }
  stats.attempts = result.attempts;
  stats.input_tokens = result.input_tokens;
  stats.output_tokens = result.output_tokens;
  const cost = computePerplexityCost(result.input_tokens, result.output_tokens);
  stats.cost_usd = cost.cost_usd;

  let raw: unknown;
  try {
    raw = extractJsonArray(result.text);
  } catch (e) {
    stats.duration_ms = Date.now() - t0;
    stats.error = `json_extract_failed: ${(e as Error).message}`;
    return { items: [], stats };
  }
  if (!Array.isArray(raw)) {
    stats.duration_ms = Date.now() - t0;
    stats.error = 'response_not_array';
    return { items: [], stats };
  }
  stats.raw_items_returned = raw.length;

  const valid: InsuranceTrendItem[] = [];
  for (const cand of raw) {
    const z = insuranceTrendItemSchema.safeParse(preprocessItem(cand));
    if (z.success) valid.push(z.data);
    else stats.zod_rejected += 1;
  }

  const urls = valid.map((v) => v.source_url);
  const { ok, rejected } = await verifyUrlsParallel(urls);
  const okSet = new Set(ok);
  const filtered = valid.filter((v) => okSet.has(v.source_url));
  stats.url_rejected = rejected.length;

  stats.duration_ms = Date.now() - t0;
  if (filtered.length > 0) stats.status = 'ok';
  else if (stats.raw_items_returned > 0) stats.status = 'partial';
  else stats.status = 'ok'; // empty mais HTTP 200 ≠ failure

  return { items: filtered, stats };
}

// ----------------------------------------------------------------------------
// Post-processor déterministe (dedup + sort + slice + synthèse + actualites)
// ----------------------------------------------------------------------------
const MAX_PER_CLUSTER = 5;
const MAJOR_TOP_N = 5;

function sortDateDesc(items: InsuranceTrendItem[]): InsuranceTrendItem[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}

function composeSynthese(
  kept: Record<ClusterId, InsuranceTrendItem[]>,
  failed: ClusterId[],
  total: number,
): string {
  const tone =
    total < 10
      ? 'Semaine calme côté actualité assurance FR.'
      : total <= 20
        ? "Semaine de densité moyenne sur l'actualité assurance FR."
        : "Semaine dense sur l'actualité assurance FR.";
  const lines = [tone, `Total items vérifiés : ${total}.`];
  for (const c of CLUSTERS) {
    const items = kept[c.id] ?? [];
    if (items.length === 0) {
      lines.push(`${c.label} : aucune actualité retenue.`);
      continue;
    }
    const top = items[0];
    lines.push(
      `${c.label} : ${items.length} entrée${items.length > 1 ? 's' : ''} — actualité phare « ${top.titre} » (${top.date.slice(0, 10)}).`,
    );
  }
  if (failed.length > 0) {
    const labels = failed.map((id) => CLUSTERS.find((c) => c.id === id)?.label ?? id).join(', ');
    lines.push(
      `Note : ${failed.length} cluster${failed.length > 1 ? 's' : ''} en échec sur ce run (${labels}).`,
    );
  }
  return lines.join(' ');
}

function composeMajor(kept: Record<ClusterId, InsuranceTrendItem[]>): InsuranceTrendItem[] {
  const all: Array<{ item: InsuranceTrendItem; priority: number; ts: number }> = [];
  for (const c of CLUSTERS) {
    for (const item of kept[c.id] ?? []) {
      const ts = new Date(item.date).getTime();
      all.push({ item, priority: c.priority, ts: Number.isNaN(ts) ? 0 : ts });
    }
  }
  all.sort((a, b) => b.ts - a.ts || a.priority - b.priority);
  return all.slice(0, MAJOR_TOP_N).map((x) => x.item);
}

function postProcess(rawByCluster: Record<ClusterId, InsuranceTrendItem[]>, failed: ClusterId[]) {
  const normalized: Record<ClusterId, InsuranceTrendItem[]> = {
    regulation_acpr: [],
    sinistres_fraude: [],
    courtage_distribution: [],
    mutuelles_complementaires: [],
    insurtech_ia_assurance: [],
    back_office_productivite: [],
    signaux_faibles: [],
  };
  let dedupDrops = 0;
  const seen = new Set<string>();
  for (const c of CLUSTERS) {
    for (const item of rawByCluster[c.id] ?? []) {
      const key = item.source_url.toLowerCase().replace(/\/+$/, '');
      if (seen.has(key)) {
        dedupDrops += 1;
        continue;
      }
      seen.add(key);
      normalized[c.id].push(item);
    }
  }
  const kept: Record<ClusterId, InsuranceTrendItem[]> = { ...normalized };
  let totalKept = 0;
  for (const c of CLUSTERS) {
    const sorted = sortDateDesc(normalized[c.id]).slice(0, MAX_PER_CLUSTER);
    kept[c.id] = sorted;
    totalKept += sorted.length;
  }
  const actualites_majeures = composeMajor(kept);
  const synthese_textuelle = composeSynthese(kept, failed, totalKept);
  return {
    trends: { ...kept, actualites_majeures, synthese_textuelle },
    stats: { total_kept: totalKept, dedup_drops: dedupDrops, failed_clusters: failed },
  };
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'agent-5-insurance-trends' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      week_id?: string;
      force?: boolean;
      only_cluster?: ClusterId;
    };
    const weekId = body.week_id ?? currentIsoWeek();
    const range = isoWeekToDateRange(weekId);
    const sb = getSupabase();
    const apiKey = requireEnv('PERPLEXITY_API_KEY');

    if (!body.force) {
      const { data: existing } = await sb
        .from('weekly_reports')
        .select('insurance_trends_json')
        .eq('week_id', weekId)
        .maybeSingle();
      if (existing && (existing as { insurance_trends_json: unknown }).insurance_trends_json) {
        return jsonResponse({ skipped: true, reason: 'already_synthesized', week_id: weekId });
      }
    }

    const targets = body.only_cluster
      ? CLUSTERS.filter((c) => c.id === body.only_cluster)
      : CLUSTERS;

    // Séquentiel — Perplexity throttle silencieusement au-delà de 3 parallèles.
    const rawByCluster: Record<ClusterId, InsuranceTrendItem[]> = {
      regulation_acpr: [],
      sinistres_fraude: [],
      courtage_distribution: [],
      mutuelles_complementaires: [],
      insurtech_ia_assurance: [],
      back_office_productivite: [],
      signaux_faibles: [],
    };
    const perCluster: ClusterStats[] = [];
    const failedClusters: ClusterId[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    for (const c of targets) {
      const r = await runClusterPipeline(c, range, apiKey);
      rawByCluster[c.id] = r.items;
      perCluster.push(r.stats);
      totalInput += r.stats.input_tokens;
      totalOutput += r.stats.output_tokens;
      if (r.stats.error) failedClusters.push(c.id);
    }

    if (failedClusters.length === targets.length) {
      const details = perCluster.map((p) => `${p.cluster_id}=${p.error ?? 'unknown'}`).join(' | ');
      return errorResponse(`all_clusters_failed: ${details}`, 500);
    }

    const pp = postProcess(rawByCluster, failedClusters);
    const cost = computePerplexityCost(totalInput, totalOutput);

    const { error: upErr } = await sb.from('weekly_reports').upsert(
      {
        week_id: weekId,
        insurance_trends_json: pp.trends as unknown,
        produced_at: new Date().toISOString(),
      },
      { onConflict: 'week_id' },
    );
    if (upErr) return errorResponse(`upsert_failed: ${upErr.message}`, 500);

    const duration = Date.now() - t0;
    log.info(
      {
        week_id: weekId,
        duration_ms: duration,
        cost_eur: cost.cost_eur,
        total_kept: pp.stats.total_kept,
      },
      'agent_5_done',
    );

    return jsonResponse({
      week_id: weekId,
      duration_ms: duration,
      total_input_tokens: totalInput,
      total_output_tokens: totalOutput,
      cost_usd: cost.cost_usd,
      cost_eur: cost.cost_eur,
      per_cluster: perCluster,
      post_process_stats: pp.stats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_5_failed');
    return errorResponse(msg, 500);
  }
});
