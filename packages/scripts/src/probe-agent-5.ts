/**
 * probe-agent-5 — sonde un seul cluster Agent 5 et affiche la stack
 * d'erreur réelle (le synthesizer throw all_clusters_failed sans détail).
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '..', '..', '.env'), override: true });

import { CLUSTERS, extractJsonArray, normalizeDate, verifyUrls } from '@nexus/n8n-nodes';
import { insuranceTrendItemSchema } from '@nexus/shared';

function preprocessRawItem(candidate: unknown): unknown {
  if (typeof candidate !== 'object' || candidate === null) return candidate;
  const obj = candidate as Record<string, unknown>;
  if (typeof obj.date === 'string') {
    const normalized = normalizeDate(obj.date);
    if (normalized) return { ...obj, date: normalized };
  }
  return candidate;
}

async function probeCluster(clusterId: string, key: string): Promise<void> {
  const cluster = CLUSTERS.find((c) => c.id === clusterId);
  if (!cluster) throw new Error(`cluster not found: ${clusterId}`);

  const range = { date_start: '2026-05-04', date_end: '2026-05-10' };
  const prompt = cluster.query_builder(range);

  process.stdout.write(`\n========== Cluster ${cluster.id} ==========\n`);

  process.stdout.write(`prompt length: ${prompt.length}\n`);

  const body = {
    model: 'sonar-pro',
    messages: [
      {
        role: 'system',
        content:
          'Tu es un agent de veille assurance FR. Tu réponds par UN SEUL tableau JSON valide, commençant par [ et finissant par ]. Aucun texte hors JSON. Aucune balise markdown. Sources : uniquement celles autorisées dans le prompt utilisateur. Si une actualité ne respecte pas le schéma demandé, omets-la plutôt que de la déformer.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2048,
    temperature: 0.2,
  };
  process.stdout.write(`body bytes: ${Buffer.byteLength(JSON.stringify(body))}\n\n`);

  const t0 = Date.now();
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  process.stdout.write(`HTTP ${res.status} — duration ${Date.now() - t0}ms\n`);
  const rawText = await res.text();
  if (!res.ok) {
    process.stdout.write(`ERROR BODY:\n${rawText.slice(0, 2000)}\n`);
    return;
  }

  const data = JSON.parse(rawText) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? '';
  process.stdout.write(
    `\ntokens: in=${data.usage?.prompt_tokens ?? 0} out=${data.usage?.completion_tokens ?? 0}\n\n`,
  );
  process.stdout.write('--- raw content (first 3000 chars) ---\n');
  process.stdout.write(`${text.slice(0, 3000)}\n`);
  process.stdout.write('---\n\n');

  let arr: unknown;
  try {
    arr = extractJsonArray(text);
    process.stdout.write(`extractJsonArray OK, ${Array.isArray(arr) ? arr.length : 'n/a'} items\n`);
  } catch (e) {
    process.stdout.write(`extractJsonArray FAILED: ${(e as Error).message}\n`);
    return;
  }
  if (!Array.isArray(arr)) {
    process.stdout.write('response_not_array\n');
    return;
  }

  process.stdout.write('\n--- Zod validation per item ---\n');
  const valid: Array<{ titre: string; source_url: string }> = [];
  arr.forEach((candidate, i) => {
    const parsed = insuranceTrendItemSchema.safeParse(preprocessRawItem(candidate));
    if (parsed.success) {
      valid.push(parsed.data);
      process.stdout.write(`  [${i}] OK  — ${parsed.data.titre.slice(0, 60)}\n`);
    } else {
      const issues = parsed.error.issues
        .map((iss) => `${iss.path.join('.')}:${iss.message}`)
        .join('; ');
      process.stdout.write(`  [${i}] FAIL  — ${issues}\n`);
    }
  });

  process.stdout.write(`\nvalid items: ${valid.length}/${arr.length}\n`);
  if (valid.length > 0) {
    process.stdout.write('\n--- HTTP verify URLs ---\n');
    const result = await verifyUrls(valid.map((v) => v.source_url));
    process.stdout.write(`ok: ${result.ok.length}\n`);
    for (const r of result.rejected) {
      process.stdout.write(`  REJ ${r.url} — ${r.reason}${r.status ? ` (${r.status})` : ''}\n`);
    }
  }
}

async function main(): Promise<void> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error('PERPLEXITY_API_KEY missing');

  // 3 clusters séquentiels pour isoler les pbms (rate limit, prompt, etc.)
  const targets = ['regulation_acpr', 'sinistres_fraude', 'insurtech_ia_assurance'];
  for (const id of targets) {
    try {
      await probeCluster(id, key);
    } catch (e) {
      process.stdout.write(`cluster ${id} threw: ${(e as Error).message}\n`);
    }
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`probe failed: ${e instanceof Error ? e.message : String(e)}\n`);
  if (e instanceof Error && e.stack) process.stderr.write(`${e.stack}\n`);
  process.exit(1);
});
