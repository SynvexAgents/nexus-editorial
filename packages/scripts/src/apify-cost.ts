/**
 * apify-cost — récupère le dernier run de l'acteur primaire et affiche
 * la consommation en compute units, la durée et le coût USD/EUR.
 *
 *   pnpm --filter @nexus/scripts apify-cost
 */
import { logger } from '@nexus/shared';

const ACTOR_ID = process.env.APIFY_ACTOR_ID ?? 'harvestapi~linkedin-profile-posts';
const USD_TO_EUR = 0.92; // estimation mai 2026

interface ApifyRunSummary {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  usageTotalUsd?: number;
}

interface ApifyRunDetail extends ApifyRunSummary {
  stats?: {
    runTimeSecs?: number;
    computeUnits?: number;
    inputBodyLen?: number;
    rebootCount?: number;
  };
}

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');

  // 1. liste : récupère l'id et usageTotalUsd
  const listRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?limit=1&desc=true&token=${token}`,
  );
  if (!listRes.ok) throw new Error(`apify_list_${listRes.status}`);
  const listData = (await listRes.json()) as { data: { items: ApifyRunSummary[] } };
  const summary = listData.data.items[0];
  if (!summary) {
    process.stdout.write('No recent run found for actor.\n');
    return;
  }

  // 2. détail : récupère les compute units
  const detailRes = await fetch(`https://api.apify.com/v2/actor-runs/${summary.id}?token=${token}`);
  if (!detailRes.ok) throw new Error(`apify_detail_${detailRes.status}`);
  const detailData = (await detailRes.json()) as { data: ApifyRunDetail };
  const run = detailData.data;

  const usd = run.usageTotalUsd ?? 0;
  const eur = usd * USD_TO_EUR;
  const cu = run.stats?.computeUnits ?? 0;
  const durationSec =
    run.stats?.runTimeSecs ??
    Math.round(
      (new Date(run.finishedAt ?? Date.now()).getTime() - new Date(run.startedAt).getTime()) / 1000,
    );

  process.stdout.write('\n========== Apify run cost ==========\n');
  process.stdout.write(`Actor          : ${ACTOR_ID}\n`);
  process.stdout.write(`Run id         : ${run.id}\n`);
  process.stdout.write(`Status         : ${run.status}\n`);
  process.stdout.write(`Started        : ${run.startedAt}\n`);
  process.stdout.write(`Finished       : ${run.finishedAt ?? '(running)'}\n`);
  process.stdout.write(`Duration       : ${durationSec}s\n`);
  process.stdout.write(`Compute units  : ${cu.toFixed(4)} CU\n`);
  process.stdout.write(`Cost           : $${usd.toFixed(4)} USD (~€${eur.toFixed(4)})\n`);

  process.stdout.write('\n--- Projection 50 profils, 4 runs/mois ---\n');
  process.stdout.write(
    `Per run, 50 profils  : ~$${(usd * 50).toFixed(2)} (~€${(eur * 50).toFixed(2)})\n`,
  );
  process.stdout.write(
    `Per mois, 4 runs     : ~$${(usd * 50 * 4).toFixed(2)} (~€${(eur * 50 * 4).toFixed(2)})\n`,
  );
  process.stdout.write('====================================\n\n');

  logger.info({ run_id: run.id, cu, usd, eur, duration_sec: durationSec }, 'apify_cost_report');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'apify_cost_failed');
  process.exit(1);
});
