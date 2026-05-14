/**
 * voice-pack-matcher — sélection des entrées synvex_voice_pack les plus
 * pertinentes pour un contexte (LinkedinTrends + InsuranceTrends d'une
 * semaine), via embeddings OpenAI + cosine similarity.
 *
 * Usage : Agent 6 (Angles Generator) injecte les 3-5 top entrées dans son
 * user prompt pour calibrer la voix Synvex sur les angles de la semaine.
 *
 * Pattern :
 *   1. Charge toutes les entrées synvex_voice_pack.is_active=true.
 *      Si table vide → retourne [] (fallback graceful, l'agent fonctionne
 *      sans voice pack avec un log de degradation).
 *   2. Embed le contextSummary + chaque entrée content via
 *      text-embedding-3-small (1536 dims).
 *   3. Cosine similarity entre context et chaque entrée. Pondère par
 *      `weight` (multiplicateur) pour booster les règles importantes.
 *   4. Tri DESC, slice top N.
 *
 * Coût : ~$0.02/M tokens (text-embedding-3-small). Pour un voice pack
 * de 20 entrées × 200 chars + contexte 2000 chars = ~6k tokens total
 * → $0.0001 par call. Négligeable.
 */

const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const OPENAI_MODEL = 'text-embedding-3-small';
const EMBEDDING_TIMEOUT_MS = 30_000;

export interface VoicePackEntry {
  entry_id: number;
  type: string | null;
  content: string;
  weight: number;
  /** Score de similarité (cosine × weight), uniquement présent dans la sortie. */
  score?: number;
}

export interface SupabaseLike {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => {
        returns: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface MatchVoicePackOptions {
  /** Nombre d'entrées à retourner (default 5). */
  limit?: number;
  /** API key OpenAI. Si absent, lu depuis OPENAI_API_KEY. */
  apiKey?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Logger optionnel pour fallback degradation. */
  logger?: { warn: (obj: Record<string, unknown>, msg: string) => void };
}

interface EmbeddingResponse {
  data?: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
  error?: { message: string };
}

/**
 * Cosine similarity entre deux vecteurs de même dimension.
 * Retourne 0 si norme nulle ou dimensions différentes.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Embed une liste de textes en un seul call OpenAI (batch supporté par
 * l'API embeddings).
 */
async function embedBatch(
  texts: string[],
  options: { apiKey: string; fetchImpl: typeof fetch },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
  try {
    const res = await options.fetchImpl(OPENAI_EMBEDDINGS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({ model: OPENAI_MODEL, input: texts }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`openai_embeddings_http_${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as EmbeddingResponse;
    if (data.error) throw new Error(`openai_embeddings_error: ${data.error.message}`);
    if (!data.data || data.data.length !== texts.length) {
      throw new Error(
        `openai_embeddings_mismatch: expected ${texts.length}, got ${data.data?.length ?? 0}`,
      );
    }
    return data.data.map((d) => d.embedding);
  } finally {
    clearTimeout(timeout);
  }
}

export async function matchVoicePack(
  contextSummary: string,
  supabase: SupabaseLike,
  options: MatchVoicePackOptions = {},
): Promise<VoicePackEntry[]> {
  const limit = options.limit ?? 5;
  // 1. Récupère les entrées actives.
  const { data, error } = await supabase
    .from('synvex_voice_pack')
    .select('entry_id, type, content, weight, is_active')
    .eq('is_active', true)
    .returns<
      Array<{
        entry_id: number;
        type: string | null;
        content: string | null;
        weight: number | null;
        is_active: boolean;
      }>
    >();
  if (error) throw new Error(`voice_pack_select_failed: ${error.message}`);

  // 2. Filtre les entrées sans content (sécurité — la table ne contraint pas NOT NULL).
  const entries: VoicePackEntry[] = (data ?? [])
    .filter(
      (r): r is typeof r & { content: string } =>
        typeof r.content === 'string' && r.content.length > 0,
    )
    .map((r) => ({
      entry_id: r.entry_id,
      type: r.type,
      content: r.content,
      weight: r.weight ?? 1,
    }));

  if (entries.length === 0) {
    options.logger?.warn({ voice_pack_rows: 0 }, 'voice_pack_empty_falling_back_to_no_excerpts');
    return [];
  }

  // 3. Embed contexte + entries.
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    options.logger?.warn(
      { entries: entries.length },
      'voice_pack_no_openai_key_falling_back_to_no_excerpts',
    );
    return [];
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  // Premier élément = contexte, le reste = entries.content
  const allTexts = [contextSummary, ...entries.map((e) => e.content)];
  const embeddings = await embedBatch(allTexts, { apiKey, fetchImpl });
  const contextVec = embeddings[0]!;
  const entryVecs = embeddings.slice(1);

  // 4. Score = cosine × weight (boost les règles à fort poids).
  const scored: VoicePackEntry[] = entries.map((e, i) => ({
    ...e,
    score: cosineSimilarity(contextVec, entryVecs[i]!) * e.weight,
  }));

  // 5. Tri DESC + slice top N.
  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, limit);
}
