/**
 * audit-language — détermine la langue dominante de chaque profil LinkedIn
 * en analysant les posts collectés sur 30 jours via franc-min.
 *
 * Verdicts :
 *   - FR_PURE         : ≥ 80% FR ET ≥ 3 posts collectés
 *   - FR_MAJORITAIRE  : 50-80% FR
 *   - MIXED           : 20-50% FR
 *   - EN_DOMINANT     : < 20% FR
 *   - INACTIVE        : 0 post 30j
 *
 *   pnpm --filter @nexus/scripts audit-language -- --slugs slug1,slug2,...
 *   pnpm --filter @nexus/scripts audit-language -- --file slugs.txt
 *
 * Output : table console + audit-language-YYYYMMDD.json à la racine.
 * Ne touche PAS la base. Diagnostic only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { detectFrench } from '@nexus/n8n-nodes';
import { logger } from '@nexus/shared';

type Verdict = 'FR_PURE' | 'FR_MAJORITAIRE' | 'MIXED' | 'EN_DOMINANT' | 'INACTIVE';

interface ProfileLangResult {
  slug: string;
  posts_30d: number;
  fr_count: number;
  en_or_other_count: number;
  fr_ratio: number;
  verdict: Verdict;
  sample_text: string | null;
}

interface ApifyPost {
  type?: string;
  content?: string;
  text?: string;
  author?: { publicIdentifier?: string };
}

function parseArgs(argv: string[]): { slugs: string[] } {
  const slugsIdx = argv.indexOf('--slugs');
  if (slugsIdx >= 0) {
    const v = argv[slugsIdx + 1] ?? '';
    return {
      slugs: v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  const fileIdx = argv.indexOf('--file');
  if (fileIdx >= 0) {
    const path = argv[fileIdx + 1] ?? '';
    const content = readFileSync(path, 'utf8');
    return {
      slugs: content
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  throw new Error('Usage: audit-language --slugs slug1,slug2,... | --file path/to/slugs.txt');
}

function verdictFor(posts: number, frCount: number): Verdict {
  if (posts === 0) return 'INACTIVE';
  const ratio = frCount / posts;
  if (ratio >= 0.8 && posts >= 3) return 'FR_PURE';
  if (ratio >= 0.5) return 'FR_MAJORITAIRE';
  if (ratio >= 0.2) return 'MIXED';
  return 'EN_DOMINANT';
}

async function main(): Promise<void> {
  const { slugs } = parseArgs(process.argv.slice(2));
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');

  logger.info({ slug_count: slugs.length }, 'audit_language_start');

  // 1. Apify calls — batched par tranches de 20 slugs (harvestapi sature
  // au-delà sur des requêtes avec scrapeComments=false également).
  const BATCH_SIZE = 20;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const apifyUrl = `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-posts/run-sync-get-dataset-items?token=${token}`;

  const items: ApifyPost[] = [];
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batchSlugs = slugs.slice(i, i + BATCH_SIZE);
    const targetUrls = batchSlugs.map(
      (s) => `https://www.linkedin.com/in/${encodeURIComponent(s)}/`,
    );
    logger.info({ batch_index: i / BATCH_SIZE, size: batchSlugs.length }, 'apify_batch_start');
    let attempts = 0;
    let success = false;
    while (attempts < 3 && !success) {
      attempts += 1;
      try {
        const res = await fetch(apifyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrls,
            maxPosts: 10,
            scrapeComments: false,
            scrapeReactions: false,
            postedLimitDate: since,
            includeQuotePosts: false,
            includeReposts: false,
          }),
        });
        if (!res.ok) throw new Error(`apify_http_${res.status}`);
        const batchItems = (await res.json()) as ApifyPost[];
        if (!Array.isArray(batchItems)) throw new Error('apify_response_not_array');
        items.push(...batchItems);
        logger.info(
          { batch_index: i / BATCH_SIZE, items_returned: batchItems.length, attempt: attempts },
          'apify_batch_done',
        );
        success = true;
      } catch (err) {
        logger.warn(
          {
            batch_index: i / BATCH_SIZE,
            attempt: attempts,
            err: err instanceof Error ? err.message : String(err),
          },
          'apify_batch_retry',
        );
        if (attempts < 3) await new Promise((r) => setTimeout(r, 2_000 * attempts));
      }
    }
    if (!success) {
      logger.error({ batch_index: i / BATCH_SIZE }, 'apify_batch_failed_all_retries');
    }
  }
  logger.info({ items_total: items.length }, 'apify_done');

  // 2. Group posts by author.publicIdentifier
  type PostBucket = { fr: number; total: number; samples: string[] };
  const byAuthor = new Map<string, PostBucket>();
  for (const it of items) {
    if (it.type === 'comment') continue;
    const author = it.author?.publicIdentifier?.toLowerCase();
    if (!author) continue;
    const text = ((it.content ?? it.text ?? '') as string).trim();
    if (text.length === 0) continue;
    const bucket = byAuthor.get(author) ?? { fr: 0, total: 0, samples: [] };
    bucket.total += 1;
    if (detectFrench(text).isFr) bucket.fr += 1;
    if (bucket.samples.length < 1) bucket.samples.push(text.slice(0, 120));
    byAuthor.set(author, bucket);
  }

  // 3. Match slug → result (decoded slug comparison)
  const results: ProfileLangResult[] = slugs.map((slug) => {
    const decoded = decodeURIComponent(slug).toLowerCase();
    const bucket = byAuthor.get(decoded);
    const total = bucket?.total ?? 0;
    const fr = bucket?.fr ?? 0;
    const ratio = total > 0 ? fr / total : 0;
    return {
      slug,
      posts_30d: total,
      fr_count: fr,
      en_or_other_count: total - fr,
      fr_ratio: Number(ratio.toFixed(3)),
      verdict: verdictFor(total, fr),
      sample_text: bucket?.samples[0] ?? null,
    };
  });

  // 4. Output console
  process.stdout.write('\n========== Audit langue ==========\n');
  process.stdout.write('| # | Slug | posts | FR | nonFR | ratio | verdict |\n');
  process.stdout.write('|---|---|---|---|---|---|---|\n');
  results.forEach((r, i) => {
    process.stdout.write(
      `| ${i + 1} | ${r.slug} | ${r.posts_30d} | ${r.fr_count} | ${r.en_or_other_count} | ${r.fr_ratio} | ${r.verdict} |\n`,
    );
  });

  // Recap par verdict
  const buckets: Record<Verdict, number> = {
    FR_PURE: 0,
    FR_MAJORITAIRE: 0,
    MIXED: 0,
    EN_DOMINANT: 0,
    INACTIVE: 0,
  };
  for (const r of results) buckets[r.verdict] += 1;
  process.stdout.write(
    `\nFR_PURE: ${buckets.FR_PURE}   FR_MAJORITAIRE: ${buckets.FR_MAJORITAIRE}   MIXED: ${buckets.MIXED}   EN_DOMINANT: ${buckets.EN_DOMINANT}   INACTIVE: ${buckets.INACTIVE}   Total: ${results.length}\n`,
  );

  // 5. Dump JSON
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const jsonPath = `audit-language-${today}.json`;
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  process.stdout.write(`\nJSON file written: ${jsonPath}\n`);

  logger.info({ verdicts: buckets }, 'audit_language_done');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'audit_language_failed');
  process.exit(1);
});
