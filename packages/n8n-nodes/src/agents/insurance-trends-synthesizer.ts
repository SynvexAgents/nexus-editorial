/**
 * insurance-trends-synthesizer — Agent 5 Nexus Editorial.
 *
 * Orchestre :
 *   1. 7 appels Perplexity Sonar Pro en parallèle (Promise.allSettled),
 *      un par cluster thématique assurance.
 *   2. Pour chaque retour : parse + validation Zod par item (drop des
 *      items malformés, pas des clusters entiers).
 *   3. Vérification HTTP des source_url via url-verifier.
 *   4. Post-processing déterministe (dedup, sort, slice, synthèse,
 *      composition actualites_majeures) via insurance-trends-post-processor.
 *
 * Toute logique déterministe est sortie du LLM (cf. pattern Agent 4).
 * Perplexity ne fait que la recherche et le formatage JSON initial.
 *
 * Retry : sur erreur transient (429, 5xx) par cluster, retry exponentiel
 * 2x max. Sur échec définitif, le cluster est marqué `failed` mais les
 * autres continuent.
 */
import {
  type InsuranceTrendItem,
  type InsuranceTrends,
  insuranceTrendItemSchema,
} from '@nexus/shared';
import { CLUSTERS, type ClusterDef, type ClusterId } from './insurance-clusters.js';
import {
  type PostProcessStats,
  normalizeDate,
  postProcessInsuranceTrends,
} from './insurance-trends-post-processor.js';
import { type UrlVerifyOptions, verifyUrls } from './url-verifier.js';

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_MODEL = 'sonar-pro';
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.2;
const CALL_TIMEOUT_MS = 90_000;
const MAX_RETRIES_PER_CLUSTER = 2;
/**
 * Concurrence max sur les appels Perplexity. À 7-parallèle, l'API throttle
 * silencieusement et renvoie des arrays vides (observé empiriquement :
 * out_tokens ≈ 1/call). À 3-parallèle on a encore ~6/7 vides. À 1 (séquentiel)
 * la couverture est maximale (~5/7 avec contenu). Coût du séquentiel : 7×5s
 * = ~35s wall time, acceptable pour un cron hebdo.
 */
const PERPLEXITY_CONCURRENCY = 1;

// Pricing Sonar Pro 2026 (USD / M tokens) — source : perplexity.ai/pricing.
// Tarification simplifiée (sans citations fees détaillés).
const PRICE_INPUT_USD_PER_M = 3.0;
const PRICE_OUTPUT_USD_PER_M = 15.0;
const USD_TO_EUR = 0.92;

export interface ClusterCallStats {
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

export interface RunUsage {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_eur: number;
}

export interface SynthesizeInsuranceTrendsResult {
  trends: InsuranceTrends;
  usage: RunUsage;
  per_cluster: ClusterCallStats[];
  post_process_stats: PostProcessStats;
}

// ---------------------------------------------------------------------------
// Perplexity client (fetch direct — pas de SDK officiel)
// ---------------------------------------------------------------------------

interface PerplexityResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface PerplexityClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

async function callPerplexity(
  prompt: string,
  options: PerplexityClientOptions,
): Promise<{ text: string; input_tokens: number; output_tokens: number }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await fetchImpl(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: 'system',
            content:
              "Tu es un agent de veille assurance FR. Tu réponds par UN SEUL tableau JSON valide, commençant par [ et finissant par ]. Aucun texte hors JSON. Aucune balise markdown. Privilégie les sources françaises spécialisées assurance, mais tu peux citer d'autres médias FR sérieux (Les Echos, La Tribune, etc.) si l'actualité y est mieux documentée. L'important : items factuels, datés, avec URL réelle vérifiable.",
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`perplexity_http_${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as PerplexityResponse;
    const text = data.choices?.[0]?.message?.content ?? '';
    return {
      text,
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callPerplexityWithRetry(
  prompt: string,
  options: PerplexityClientOptions,
): Promise<{ text: string; input_tokens: number; output_tokens: number; attempts: number }> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES_PER_CLUSTER + 1; attempt += 1) {
    try {
      const result = await callPerplexity(prompt, options);
      return { ...result, attempts: attempt };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Retry sur 429, 5xx et erreurs réseau transient
      const msg = lastErr.message;
      const transient = /perplexity_http_(429|5\d{2})/.test(msg) || /timeout/i.test(msg);
      if (!transient || attempt > MAX_RETRIES_PER_CLUSTER) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastErr ?? new Error('perplexity_unknown_error');
}

// ---------------------------------------------------------------------------
// JSON extraction from Perplexity output
// ---------------------------------------------------------------------------

/**
 * Extrait un array JSON de la réponse Perplexity. Robuste aux fences
 * markdown, texte leading/trailing.
 */
export function extractJsonArray(text: string): unknown {
  let cleaned = text.trim();
  // Strip markdown fences
  cleaned = cleaned.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no_json_array_found');
  }
  return JSON.parse(cleaned.substring(start, end + 1));
}

// ---------------------------------------------------------------------------
// Cluster pipeline
// ---------------------------------------------------------------------------

interface ClusterPipelineResult {
  cluster_id: ClusterId;
  items: InsuranceTrendItem[];
  stats: ClusterCallStats;
}

async function runClusterPipeline(
  cluster: ClusterDef,
  range: { date_start: string; date_end: string },
  perplexity: PerplexityClientOptions,
  urlVerifyOptions: UrlVerifyOptions,
): Promise<ClusterPipelineResult> {
  const t0 = Date.now();
  const prompt = cluster.query_builder(range);

  const stats: ClusterCallStats = {
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

  let perplexityResult: {
    text: string;
    input_tokens: number;
    output_tokens: number;
    attempts: number;
  };
  try {
    perplexityResult = await callPerplexityWithRetry(prompt, perplexity);
  } catch (err) {
    stats.duration_ms = Date.now() - t0;
    stats.error = err instanceof Error ? err.message : String(err);
    return { cluster_id: cluster.id, items: [], stats };
  }

  stats.attempts = perplexityResult.attempts;
  stats.input_tokens = perplexityResult.input_tokens;
  stats.output_tokens = perplexityResult.output_tokens;
  stats.cost_usd =
    (perplexityResult.input_tokens / 1_000_000) * PRICE_INPUT_USD_PER_M +
    (perplexityResult.output_tokens / 1_000_000) * PRICE_OUTPUT_USD_PER_M;

  // Parse JSON
  let raw: unknown;
  try {
    raw = extractJsonArray(perplexityResult.text);
  } catch (err) {
    stats.duration_ms = Date.now() - t0;
    stats.error = `json_extract_failed: ${err instanceof Error ? err.message : String(err)}`;
    return { cluster_id: cluster.id, items: [], stats };
  }
  if (!Array.isArray(raw)) {
    stats.duration_ms = Date.now() - t0;
    stats.error = 'response_not_array';
    return { cluster_id: cluster.id, items: [], stats };
  }
  stats.raw_items_returned = raw.length;

  // Validation Zod par item (drop sélectif, on ne perd pas le cluster entier).
  // Préprocess : Perplexity renvoie souvent date au format YYYY-MM-DD ; le
  // schéma Zod exige ISO 8601 avec offset. On normalise avant safeParse pour
  // éviter de perdre des items à cause d'un format date plus court.
  function preprocessRawItem(candidate: unknown): unknown {
    if (typeof candidate !== 'object' || candidate === null) return candidate;
    const obj = candidate as Record<string, unknown>;
    if (typeof obj.date === 'string') {
      const normalized = normalizeDate(obj.date);
      if (normalized) return { ...obj, date: normalized };
    }
    return candidate;
  }
  const validItems: InsuranceTrendItem[] = [];
  for (const candidate of raw) {
    const parsed = insuranceTrendItemSchema.safeParse(preprocessRawItem(candidate));
    if (parsed.success) {
      validItems.push(parsed.data);
    } else {
      stats.zod_rejected += 1;
    }
  }

  // Vérification HTTP des URLs — anti-hallucination Perplexity.
  const urls = validItems.map((it) => it.source_url);
  const { ok: okUrls, rejected: rejectedUrls } = await verifyUrls(urls, urlVerifyOptions);
  const okSet = new Set(okUrls);
  const filtered = validItems.filter((it) => okSet.has(it.source_url));
  stats.url_rejected = rejectedUrls.length;

  stats.duration_ms = Date.now() - t0;
  // status logic :
  //   - error tracé en amont → status déjà 'failed' (return early), n'arrive pas ici
  //   - filtered > 0 → 'ok' (items réels retenus)
  //   - raw > 0 mais filtered = 0 → 'partial' (Perplexity a fourni des items, tous filtrés)
  //   - raw = 0 ET pas d'erreur → 'ok' (Perplexity a légitimement répondu "rien cette semaine")
  if (filtered.length > 0) {
    stats.status = 'ok';
  } else if (stats.raw_items_returned > 0) {
    stats.status = 'partial';
  } else {
    stats.status = 'ok';
  }

  return { cluster_id: cluster.id, items: filtered, stats };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SynthesizeInsuranceTrendsOptions {
  /** API key Perplexity. Si absent, lu depuis PERPLEXITY_API_KEY. */
  apiKey?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Override url-verifier (tests). */
  urlVerifyOptions?: UrlVerifyOptions;
  /** Lance uniquement un cluster (debug). */
  onlyCluster?: ClusterId;
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

export interface WeekRange {
  /** Date début, ISO 8601 YYYY-MM-DD. */
  date_start: string;
  /** Date fin, ISO 8601 YYYY-MM-DD. */
  date_end: string;
}

export async function synthesizeInsuranceTrends(
  weekId: string,
  range: WeekRange,
  options: SynthesizeInsuranceTrendsOptions = {},
): Promise<SynthesizeInsuranceTrendsResult> {
  const apiKey = options.apiKey ?? process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY missing in env');

  const perplexity: PerplexityClientOptions = {
    apiKey,
    fetchImpl: options.fetchImpl,
  };
  // Propage le fetchImpl vers url-verifier si aucun override spécifique n'est
  // fourni — permet aux tests de mocker un seul `fetch` pour Perplexity ET
  // les vérifications URL.
  const urlVerifyOptions: UrlVerifyOptions = {
    ...(options.urlVerifyOptions ?? {}),
    fetchImpl: options.urlVerifyOptions?.fetchImpl ?? options.fetchImpl,
  };

  // Filtre clusters selon --only-cluster si fourni.
  const targetClusters = options.onlyCluster
    ? CLUSTERS.filter((c) => c.id === options.onlyCluster)
    : CLUSTERS;

  // 7 (ou 1) calls en parallèle, chunkés par PERPLEXITY_CONCURRENCY pour
  // éviter le throttle silencieux de Sonar Pro (qui dégrade en arrays vides
  // au-delà de ~3 calls concurrents).
  const settled: Array<PromiseSettledResult<Awaited<ReturnType<typeof runClusterPipeline>>>> = [];
  for (let i = 0; i < targetClusters.length; i += PERPLEXITY_CONCURRENCY) {
    const chunk = targetClusters.slice(i, i + PERPLEXITY_CONCURRENCY);
    const chunkResults = await Promise.allSettled(
      chunk.map((c) => runClusterPipeline(c, range, perplexity, urlVerifyOptions)),
    );
    settled.push(...chunkResults);
  }

  const per_cluster: ClusterCallStats[] = [];
  const rawByCluster: Record<ClusterId, InsuranceTrendItem[]> = {
    regulation_acpr: [],
    sinistres_fraude: [],
    courtage_distribution: [],
    mutuelles_complementaires: [],
    insurtech_ia_assurance: [],
    back_office_productivite: [],
    signaux_faibles: [],
  };
  const failedClusters: ClusterId[] = [];

  settled.forEach((result, idx) => {
    const cluster = targetClusters[idx]!;
    if (result.status === 'fulfilled') {
      rawByCluster[cluster.id] = result.value.items;
      per_cluster.push(result.value.stats);
      if (result.value.stats.status === 'failed') failedClusters.push(cluster.id);
    } else {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      per_cluster.push({
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
        error,
      });
      failedClusters.push(cluster.id);
      options.logger?.warn(
        { cluster_id: cluster.id, error },
        'insurance_trends_cluster_unhandled_rejection',
      );
    }
  });

  // Si TOUS les clusters ciblés échouent → throw avec détails par cluster.
  if (failedClusters.length === targetClusters.length) {
    const details = per_cluster
      .map((p) => `${p.cluster_id}=${p.error ?? '(no error captured)'}`)
      .join(' | ');
    throw new Error(`all_clusters_failed: ${details}`);
  }

  // Post-processing déterministe.
  const { trends, stats: post_process_stats } = postProcessInsuranceTrends(
    rawByCluster,
    failedClusters,
  );

  // Total usage agrégé.
  const totalInputTokens = per_cluster.reduce((sum, c) => sum + c.input_tokens, 0);
  const totalOutputTokens = per_cluster.reduce((sum, c) => sum + c.output_tokens, 0);
  const totalCostUsd = per_cluster.reduce((sum, c) => sum + c.cost_usd, 0);

  return {
    trends,
    usage: {
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost_usd: totalCostUsd,
      total_cost_eur: totalCostUsd * USD_TO_EUR,
    },
    per_cluster,
    post_process_stats,
  };
}
