/**
 * audit-watchlist — audit en batch de l'activité LinkedIn 30j pour une liste
 * de slugs. UN seul appel Apify pour tous les profils. Ne modifie pas la base.
 *
 *   pnpm --filter @nexus/scripts audit-watchlist
 */
import { logger } from '@nexus/shared';

interface AuditCandidate {
  category: 'v0.1' | 'insurance';
  v01_section?: 'saas_ops' | 'ia' | 'finance' | 'legal' | 'rh' | 'sales';
  insurance_cat?: 'A' | 'B' | 'C' | 'D' | 'E';
  nom: string;
  slug: string;
  entreprise: string;
}

const CANDIDATES: AuditCandidate[] = [
  // === v0.1 — 9 déjà seedés ===
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Arthur Waller',
    slug: 'arthur-waller-a793a611',
    entreprise: 'Pennylane',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Hugo Andrianjatovo',
    slug: 'hugo-andrianjatovo',
    entreprise: 'Pennylane',
  },
  {
    category: 'v0.1',
    v01_section: 'sales',
    nom: 'Guillaume Moubeche',
    slug: 'profit-led-growth',
    entreprise: 'Lemlist',
  },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: 'Florian Douetteau',
    slug: 'fdouetteau',
    entreprise: 'Dataiku',
  },
  {
    category: 'v0.1',
    v01_section: 'finance',
    nom: 'Olivier Babeau',
    slug: 'olivier-babeau',
    entreprise: 'Sapiens',
  },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: 'Asma Mhalla',
    slug: 'amhalla',
    entreprise: 'Chercheuse géopolitique',
  },
  {
    category: 'v0.1',
    v01_section: 'finance',
    nom: 'Marie Ekeland',
    slug: 'marieekeland',
    entreprise: '2050',
  },
  {
    category: 'v0.1',
    v01_section: 'sales',
    nom: 'Domitille de Saint-Exupéry',
    slug: 'domitille-de-saint-exupery',
    entreprise: 'Lemlist',
  },
  {
    category: 'v0.1',
    v01_section: 'rh',
    nom: 'Firmin Zocchetto',
    slug: 'firmin-zocchetto',
    entreprise: 'PayFit',
  },

  // === v0.1 — 37 résolus à auditer ===
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Alexandre Prot',
    slug: 'aprot',
    entreprise: 'Qonto',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Steve Anavi',
    slug: 'steveanavi',
    entreprise: 'Qonto',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Rodolphe Ardant',
    slug: 'rodolpheardant',
    entreprise: 'Spendesk',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Julien Chriqui',
    slug: 'julien-chriqui-0baa0522',
    entreprise: 'Spendesk',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Éléonore Crespo',
    slug: 'eleonorecrespo',
    entreprise: 'Pigment',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Romain Niccoli',
    slug: 'romainniccoli',
    entreprise: 'Pigment',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Charles Thomas',
    slug: 'charlesjpthomas',
    entreprise: 'Comet',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Nicolas Reboud',
    slug: 'nicolasreboud',
    entreprise: 'Shine',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Frédéric Plais',
    slug: 'fplais',
    entreprise: 'Platform.sh',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Anaïs Monlong',
    slug: 'its-me-anais-monlong',
    entreprise: 'Aircall',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Jonathan Anguelov',
    slug: 'jonathan-anguelov-14346611',
    entreprise: 'Aircall',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Pierre Gaubil',
    slug: 'pierre-gaubil-6477a68',
    entreprise: 'Aircall',
  },
  {
    category: 'v0.1',
    v01_section: 'saas_ops',
    nom: 'Alexandre Yazdi',
    slug: 'alexandre-yazdi-21a9813a',
    entreprise: 'Voodoo',
  },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: 'Thomas Clozel',
    slug: 'thomas-clozel-408a9321',
    entreprise: 'Owkin',
  },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: 'Alexandre Lebrun',
    slug: 'alexandrelebrun',
    entreprise: 'Nabla',
  },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: 'Igor Carron',
    slug: 'igorcarron',
    entreprise: 'LightOn',
  },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: 'Laurent Daudet',
    slug: 'laurent-daudet-a845b02',
    entreprise: 'LightOn',
  },
  { category: 'v0.1', v01_section: 'ia', nom: 'Stanislas Polu', slug: 'spolu', entreprise: 'Dust' },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: "Édouard d'Archimbaud",
    slug: 'edouard-d-archimbaud',
    entreprise: 'Kili Technology',
  },
  {
    category: 'v0.1',
    v01_section: 'ia',
    nom: 'Sébastien Robaszkiewicz',
    slug: 'sebastien-robaszkiewicz',
    entreprise: 'Owkin',
  },
  {
    category: 'v0.1',
    v01_section: 'finance',
    nom: 'Jean-David Chamboredon',
    slug: 'jeandavidchamboredon',
    entreprise: 'ISAI',
  },
  {
    category: 'v0.1',
    v01_section: 'finance',
    nom: 'Romain Lavault',
    slug: 'lavault',
    entreprise: 'Partech',
  },
  {
    category: 'v0.1',
    v01_section: 'finance',
    nom: 'Nicolas Bouzou',
    slug: 'nbouzou',
    entreprise: 'Asterès',
  },
  {
    category: 'v0.1',
    v01_section: 'finance',
    nom: 'Frédéric Bardeau',
    slug: 'fredericbardeau',
    entreprise: 'Simplon',
  },
  {
    category: 'v0.1',
    v01_section: 'finance',
    nom: 'Yann Coatanlem',
    slug: 'yann-coatanlem',
    entreprise: 'DataValidation',
  },
  {
    category: 'v0.1',
    v01_section: 'legal',
    nom: 'Louis Larret-Chahine',
    slug: 'louis-larret-chahine-9889a281',
    entreprise: 'Predictice',
  },
  {
    category: 'v0.1',
    v01_section: 'legal',
    nom: 'Olivier Chaduteau',
    slug: 'ochaduteau',
    entreprise: 'Day One',
  },
  {
    category: 'v0.1',
    v01_section: 'legal',
    nom: 'Étienne Drouard',
    slug: 'drouard',
    entreprise: 'Hogan Lovells',
  },
  {
    category: 'v0.1',
    v01_section: 'legal',
    nom: 'Hubert de Vauplane',
    slug: 'hubert-de-vauplane-18297621',
    entreprise: 'Kramer Levin',
  },
  {
    category: 'v0.1',
    v01_section: 'legal',
    nom: 'Bertrand Cassar',
    slug: 'bertrandcassar',
    entreprise: 'LegalPlace',
  },
  {
    category: 'v0.1',
    v01_section: 'legal',
    nom: 'Aurélien Bamdé',
    slug: 'aur%C3%A9lien-bamd%C3%A9-613368b5',
    entreprise: 'Univ.',
  },
  {
    category: 'v0.1',
    v01_section: 'rh',
    nom: 'Charles de Lassence',
    slug: 'charles-de-lassence-55310b2b',
    entreprise: 'Klaxoon',
  },
  {
    category: 'v0.1',
    v01_section: 'rh',
    nom: 'Caroline Ramade',
    slug: 'carolineramade',
    entreprise: '50inTech',
  },
  {
    category: 'v0.1',
    v01_section: 'rh',
    nom: 'Quentin Guilluy',
    slug: 'quentin-guilluy-82a73a30',
    entreprise: 'Andjaro',
  },
  {
    category: 'v0.1',
    v01_section: 'sales',
    nom: 'Théo Lion',
    slug: 'th%C3%A9o-lion-25108812a',
    entreprise: 'LiveMentor',
  },
  {
    category: 'v0.1',
    v01_section: 'sales',
    nom: 'Quentin Le Gall',
    slug: 'quentin-le-gall-hexa',
    entreprise: 'Hexa',
  },
  {
    category: 'v0.1',
    v01_section: 'sales',
    nom: 'Stan Massueras',
    slug: 'stan-massueras-45bb564a',
    entreprise: 'Intercom',
  },

  // === Assurance FR — 23 candidats ===
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Pierre Bessé',
    slug: 'pierre-bess%C3%A9-conseil-assurance',
    entreprise: 'Bessé',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Paul Jousse',
    slug: 'paul-jousse',
    entreprise: 'Bessé',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Bertrand Mulot',
    slug: 'bertrandmulotbess%C3%A9',
    entreprise: 'Bessé Immo',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Benjamin Verlingue',
    slug: 'benjamin-verlingue-913b3037',
    entreprise: 'Adelaïde Group',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Jacques Verlingue',
    slug: 'jacques-verlingue',
    entreprise: 'Adelaïde Group',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Pierre Donnersberg',
    slug: 'pierre-donnersberg',
    entreprise: 'Diot-Siaci',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Olivier Binachon',
    slug: 'olivier-binachon-68543912',
    entreprise: 'Aon France',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Liliane Spiridon',
    slug: 'liliane-spiridon-27304b9',
    entreprise: 'Aon France',
  },
  {
    category: 'insurance',
    insurance_cat: 'A',
    nom: 'Patrick Jacquot',
    slug: 'patrick-jacquot-86341158',
    entreprise: 'Mutuelle des Motards',
  },
  {
    category: 'insurance',
    insurance_cat: 'B',
    nom: 'Emmanuel Maillet',
    slug: 'emmanuel-maillet-00906338',
    entreprise: 'APRIL',
  },
  {
    category: 'insurance',
    insurance_cat: 'B',
    nom: 'Pierre-Alexis Brabis',
    slug: 'pierre-alexis-brabis-93256652',
    entreprise: 'APRIL',
  },
  {
    category: 'insurance',
    insurance_cat: 'B',
    nom: 'Stephen Leguillon',
    slug: 'stephen-leguillon-67001937',
    entreprise: 'Seyna',
  },
  {
    category: 'insurance',
    insurance_cat: 'B',
    nom: 'Sébastien Piguet',
    slug: 's%C3%A9bastien-piguet-31293627',
    entreprise: 'Descartes Underwriting',
  },
  {
    category: 'insurance',
    insurance_cat: 'B',
    nom: 'Tanguy Touffut',
    slug: 'tanguy-touffut-584b202',
    entreprise: 'Descartes Underwriting',
  },
  {
    category: 'insurance',
    insurance_cat: 'C',
    nom: 'Christophe Eberlé',
    slug: 'christophe-eberle',
    entreprise: 'Mindstone (ex-Optimind)',
  },
  {
    category: 'insurance',
    insurance_cat: 'C',
    nom: 'Marc Siblini',
    slug: 'marc-siblini-3b31832',
    entreprise: 'Eurogroup Consulting',
  },
  {
    category: 'insurance',
    insurance_cat: 'C',
    nom: 'Florian Graillot',
    slug: 'florian-graillot',
    entreprise: 'astoryaVC',
  },
  {
    category: 'insurance',
    insurance_cat: 'D',
    nom: 'Florian Delambily',
    slug: 'florian-delambily-72aa7945',
    entreprise: 'News Assurances Pro',
  },
  {
    category: 'insurance',
    insurance_cat: 'D',
    nom: 'François Limoge',
    slug: 'fran%C3%A7ois-limoge-90bb7967',
    entreprise: "L'Argus de l'assurance",
  },
  {
    category: 'insurance',
    insurance_cat: 'D',
    nom: 'Aurélie Abadie',
    slug: 'aurelie-abadie',
    entreprise: "L'Agefi",
  },
  {
    category: 'insurance',
    insurance_cat: 'E',
    nom: 'Jules Veyrat',
    slug: 'jules-veyrat',
    entreprise: 'Stoïk',
  },
  {
    category: 'insurance',
    insurance_cat: 'E',
    nom: 'Eric Mignot',
    slug: 'mignoteric',
    entreprise: '+Simple',
  },
  {
    category: 'insurance',
    insurance_cat: 'E',
    nom: 'Yvan Saule',
    slug: 'yvansaule',
    entreprise: 'Tinubu',
  },
];

type Verdict = 'KEEP' | 'MAYBE' | 'DROP';

function verdictFor(posts: number): Verdict {
  if (posts >= 4) return 'KEEP';
  if (posts >= 1) return 'MAYBE';
  return 'DROP';
}

interface AuditResult extends AuditCandidate {
  posts_30j: number;
  verdict: Verdict;
}

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not set');

  const targetUrls = CANDIDATES.map((c) => `https://www.linkedin.com/in/${c.slug}/`);
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  logger.info({ profiles: CANDIDATES.length, window_days: 30 }, 'audit_start');

  const url = `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-posts/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
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
    // Pas de timeout — l'audit batch peut prendre quelques minutes.
  });
  if (!res.ok) throw new Error(`apify_http_${res.status}: ${await res.text()}`);

  const items = (await res.json()) as Array<{
    type?: string;
    author?: { publicIdentifier?: string };
  }>;
  if (!Array.isArray(items)) throw new Error('apify_response_not_array');

  logger.info({ items_returned: items.length }, 'audit_apify_done');

  // Compte les posts (type !== 'comment') groupés par author.publicIdentifier
  const postsBySlug = new Map<string, number>();
  for (const it of items) {
    if (it.type === 'comment') continue;
    const slug = it.author?.publicIdentifier;
    if (!slug) continue;
    postsBySlug.set(slug, (postsBySlug.get(slug) ?? 0) + 1);
  }

  // Match candidat → résultat. Le slug stocké est en URL (potentiellement
  // encodé %C3%A9). Apify renvoie publicIdentifier en clair. On compare
  // versions décodées des deux côtés.
  const results: AuditResult[] = CANDIDATES.map((c) => {
    const decodedSlug = decodeURIComponent(c.slug).toLowerCase();
    let count = postsBySlug.get(decodedSlug) ?? 0;
    if (count === 0) {
      for (const [k, v] of postsBySlug.entries()) {
        if (k.toLowerCase() === decodedSlug) {
          count = v;
          break;
        }
      }
    }
    return { ...c, posts_30j: count, verdict: verdictFor(count) };
  });

  // Affichage table + JSON pour réutilisation
  process.stdout.write('\n========== Audit watchlist ==========\n');
  process.stdout.write('| # | Cat | Nom | Slug | posts/30j | Verdict |\n');
  process.stdout.write('|---|---|---|---|---|---|\n');
  results.forEach((r, i) => {
    const cat = r.category === 'insurance' ? `INS-${r.insurance_cat}` : `v01-${r.v01_section}`;
    process.stdout.write(
      `| ${i + 1} | ${cat} | ${r.nom} | ${r.slug} | ${r.posts_30j} | ${r.verdict} |\n`,
    );
  });

  // Récap par bucket
  const buckets: Record<Verdict, number> = { KEEP: 0, MAYBE: 0, DROP: 0 };
  for (const r of results) buckets[r.verdict] += 1;
  process.stdout.write(
    `\nKEEP: ${buckets.KEEP}   MAYBE: ${buckets.MAYBE}   DROP: ${buckets.DROP}   Total: ${results.length}\n`,
  );

  // Dump JSON sur stderr pour piping
  process.stderr.write(`\n${JSON.stringify(results, null, 2)}\n`);

  logger.info({ kept: buckets.KEEP, maybe: buckets.MAYBE, dropped: buckets.DROP }, 'audit_done');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'audit_failed');
  process.exit(1);
});
