/**
 * probe-apify — vérifie qu'un slug donné est actif sur LinkedIn en
 * interrogeant l'acteur Apify avec un horizon temporel large (30 jours).
 * N'écrit PAS en base. Diagnostique uniquement.
 *
 *   pnpm --filter @nexus/scripts probe-apify
 */
import { logger } from '@nexus/shared';

const SLUGS_TO_PROBE = [
  'hugo-andrianjatovo',
  'profit-led-growth',
  'olivier-babeau',
  'amhalla',
  'marieekeland',
  'domitille-de-saint-exupery',
];

interface ProbeResult {
  slug: string;
  posts_30d: number;
  comments_returned: number;
  status: 'active' | 'silent' | 'error';
  error?: string;
}

async function probeOne(slug: string, token: string): Promise<ProbeResult> {
  const url = `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-posts/run-sync-get-dataset-items?token=${token}`;
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrls: [`https://www.linkedin.com/in/${slug}/`],
        maxPosts: 20,
        scrapeComments: false,
        scrapeReactions: false,
        postedLimitDate: since,
        includeQuotePosts: false,
        includeReposts: false,
      }),
    });
    if (!res.ok)
      return {
        slug,
        posts_30d: 0,
        comments_returned: 0,
        status: 'error',
        error: `http_${res.status}`,
      };
    const items = (await res.json()) as Array<{ type?: string }>;
    if (!Array.isArray(items))
      return { slug, posts_30d: 0, comments_returned: 0, status: 'error', error: 'not_array' };
    const posts = items.filter((it) => it.type !== 'comment').length;
    const comments = items.filter((it) => it.type === 'comment').length;
    return {
      slug,
      posts_30d: posts,
      comments_returned: comments,
      status: posts > 0 ? 'active' : 'silent',
    };
  } catch (err) {
    return {
      slug,
      posts_30d: 0,
      comments_returned: 0,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');

  const results: ProbeResult[] = [];
  // Séquentiel pour ne pas saturer l'acteur et garder le coût lisible.
  for (const slug of SLUGS_TO_PROBE) {
    logger.info({ slug }, 'probe_start');
    const r = await probeOne(slug, token);
    results.push(r);
    logger.info(r, 'probe_done');
  }

  process.stdout.write('\nProbe results (window = 30 days):\n');
  for (const r of results) {
    const tag = r.status === 'active' ? 'OK' : r.status === 'silent' ? 'SILENT' : 'ERR';
    process.stdout.write(
      `  [${tag}] ${r.slug.padEnd(32)} posts=${r.posts_30d}  ${r.error ?? ''}\n`,
    );
  }
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'probe_failed');
  process.exit(1);
});
