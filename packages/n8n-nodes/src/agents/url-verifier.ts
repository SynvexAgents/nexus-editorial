/**
 * url-verifier — vérification HTTP HEAD des source_url renvoyées par
 * Perplexity. Anti-hallucination : on rejette les URLs mortes pour ne pas
 * polluer la base avec des références inaccessibles.
 *
 * Concurrence limitée (10 simultanées) pour ne pas saturer la stack réseau
 * locale ni déclencher de rate limit côté serveurs source.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_USER_AGENT = 'NexusEditorial/0.4 (+https://synvex.fr)';

export interface UrlVerifyOptions {
  timeoutMs?: number;
  concurrency?: number;
  /** Override fetch pour les tests. */
  fetchImpl?: typeof fetch;
}

export interface UrlVerifyResult {
  /** URLs vérifiées OK (200, 301, 302, 999 anti-bot). */
  ok: string[];
  /** URLs rejetées avec raison. */
  rejected: Array<{ url: string; reason: string; status?: number }>;
}

const OK_STATUSES = new Set([200, 201, 203, 204, 301, 302, 303, 307, 308, 999]);
const REJECTED_STATUSES = new Set([400, 401, 403, 404, 410, 451, 500, 502, 503, 504]);

async function verifyOne(
  url: string,
  options: Required<Pick<UrlVerifyOptions, 'timeoutMs'>> & { fetchImpl: typeof fetch },
): Promise<{ url: string; status?: number; reason?: string }> {
  // Sanity check format avant fetch.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, reason: 'invalid_url_format' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { url, reason: 'unsupported_protocol' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    // HEAD plutôt que GET — économise la bande passante et la latence.
    // Si HEAD est rejeté (405 Method Not Allowed sur certains serveurs),
    // fallback sur GET avec un cap de taille.
    let res = await options.fetchImpl(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    });
    if (res.status === 405 || res.status === 501) {
      res = await options.fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': DEFAULT_USER_AGENT },
      });
    }
    if (OK_STATUSES.has(res.status)) return { url, status: res.status };
    if (REJECTED_STATUSES.has(res.status))
      return { url, status: res.status, reason: `http_${res.status}` };
    // Codes inconnus (1xx, 5xx exotiques, etc.) : rejetés par prudence.
    return { url, status: res.status, reason: `unexpected_status_${res.status}` };
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') return { url, reason: 'timeout' };
      return { url, reason: `network:${err.message}` };
    }
    return { url, reason: 'network:unknown' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Vérifie en parallèle (concurrence bornée) une liste d'URLs.
 * Retourne `ok` et `rejected` séparément.
 */
export async function verifyUrls(
  urls: string[],
  options: UrlVerifyOptions = {},
): Promise<UrlVerifyResult> {
  const opts = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    fetchImpl: options.fetchImpl ?? fetch,
  };

  const ok: string[] = [];
  const rejected: UrlVerifyResult['rejected'] = [];

  // Dedup d'entrée pour éviter des HEAD redondants sur le même URL.
  const unique = Array.from(new Set(urls));

  // Pool simple : on chunk en groupes de `concurrency` et on attend chaque chunk.
  for (let i = 0; i < unique.length; i += opts.concurrency) {
    const chunk = unique.slice(i, i + opts.concurrency);
    const results = await Promise.all(
      chunk.map((u) => verifyOne(u, { timeoutMs: opts.timeoutMs, fetchImpl: opts.fetchImpl })),
    );
    for (const r of results) {
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
