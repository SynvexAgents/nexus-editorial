/**
 * seed-watchlist-batch-v2 — applique la watchlist v0.2 (34 profils audités
 * Apify 30j). UPSERT idempotent. Met `is_active=true` pour les 34 retenus.
 *
 * Note slugs : on stocke les slugs DÉCODÉS (Unicode) parce que c'est ce que
 * harvestapi/linkedin-profile-posts renvoie comme `author.publicIdentifier`.
 * Le test-collector encode au moment de construire l'URL d'appel.
 *
 *   pnpm --filter @nexus/scripts seed:watchlist-batch-v2
 */
import { createNexusSupabaseClient, logger } from '@nexus/shared';

type SecteurV02 =
  | 'saas_ops'
  | 'ia_b2b'
  | 'finance_conseil'
  | 'legal_regtech'
  | 'rh_tech'
  | 'sales_marketing'
  | 'assurance_fr';

interface ProfileSeed {
  profile_id: string;
  nom: string;
  headline: string;
  secteur: SecteurV02;
  langue: 'FR';
  audience_size_estimee: number;
  notes: string;
  is_active: boolean;
}

const KEEP: ProfileSeed[] = [
  {
    profile_id: 'fdouetteau',
    nom: 'Florian Douetteau',
    headline: 'Co-Founder & CEO Dataiku',
    secteur: 'ia_b2b',
    langue: 'FR',
    audience_size_estimee: 50_000,
    notes: 'KEEP v0.2 — 6 posts/30j. IA enterprise, gouvernance. Posts mixtes FR/EN, déjà testé.',
    is_active: true,
  },
  {
    profile_id: 'firmin-zocchetto',
    nom: 'Firmin Zocchetto',
    headline: 'CEO & Co-founder PayFit',
    secteur: 'rh_tech',
    langue: 'FR',
    audience_size_estimee: 40_000,
    notes: 'KEEP v0.2 — 4 posts/30j. CEO unicorne RH/paie FR.',
    is_active: true,
  },
  {
    profile_id: 'aprot',
    nom: 'Alexandre Prot',
    headline: 'Co-Founder & CEO Qonto',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 80_000,
    notes: 'KEEP v0.2 — 10 posts/30j. Fintech B2B leader européen.',
    is_active: true,
  },
  {
    profile_id: 'eleonorecrespo',
    nom: 'Éléonore Crespo',
    headline: 'Co-CEO Pigment',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'KEEP v0.2 — 10 posts/30j. Planning enterprise, finance ops.',
    is_active: true,
  },
  {
    profile_id: 'jonathan-anguelov-14346611',
    nom: 'Jonathan Anguelov',
    headline: 'Co-Founder Aircall',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 50_000,
    notes: 'KEEP v0.2 — 9 posts/30j. Entrepreneur très actif LinkedIn.',
    is_active: true,
  },
  {
    profile_id: 'pierre-gaubil-6477a68',
    nom: 'Pierre Gaubil',
    headline: 'President / GTM Aircall',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 20_000,
    notes: 'KEEP v0.2 — 6 posts/30j. GTM senior.',
    is_active: true,
  },
  {
    profile_id: 'thomas-clozel-408a9321',
    nom: 'Thomas Clozel',
    headline: 'Co-Founder & CEO Owkin',
    secteur: 'ia_b2b',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'KEEP v0.2 — 10 posts/30j. IA verticale santé biomédicale.',
    is_active: true,
  },
  {
    profile_id: 'nbouzou',
    nom: 'Nicolas Bouzou',
    headline: 'Économiste Asterès',
    secteur: 'finance_conseil',
    langue: 'FR',
    audience_size_estimee: 100_000,
    notes: 'KEEP v0.2 — 5 posts/30j. Économiste B2B, productivité.',
    is_active: true,
  },
  {
    profile_id: 'louis-larret-chahine-9889a281',
    nom: 'Louis Larret-Chahine',
    headline: 'Co-Founder & CEO Predictice',
    secteur: 'legal_regtech',
    langue: 'FR',
    audience_size_estimee: 15_000,
    notes: 'KEEP v0.2 — 4 posts/30j. Legal-tech prédictif.',
    is_active: true,
  },
  {
    profile_id: 'hubert-de-vauplane-18297621',
    nom: 'Hubert de Vauplane',
    headline: 'Avocat Kramer Levin (fintech/crypto)',
    secteur: 'legal_regtech',
    langue: 'FR',
    audience_size_estimee: 20_000,
    notes: 'KEEP v0.2 — 6 posts/30j. Regtech fintech, conformité.',
    is_active: true,
  },
  {
    profile_id: 'carolineramade',
    nom: 'Caroline Ramade',
    headline: 'Founder 50inTech',
    secteur: 'rh_tech',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'KEEP v0.2 — 10 posts/30j. RH-tech / diversité tech.',
    is_active: true,
  },
  {
    profile_id: 'théo-lion-25108812a',
    nom: 'Théo Lion',
    headline: 'Speaker / Serial Entrepreneur LiveMentor',
    secteur: 'sales_marketing',
    langue: 'FR',
    audience_size_estimee: 100_000,
    notes:
      'KEEP v0.2 — 10 posts/30j. À surveiller registre coach (transferabilite_assurance < 5 = drop).',
    is_active: true,
  },
  {
    profile_id: 'quentin-le-gall-hexa',
    nom: 'Quentin Le Gall',
    headline: 'GTM Hexa',
    secteur: 'sales_marketing',
    langue: 'FR',
    audience_size_estimee: 15_000,
    notes: 'KEEP v0.2 — 4 posts/30j. GTM, startup studio.',
    is_active: true,
  },
  {
    profile_id: 'florian-graillot',
    nom: 'Florian Graillot',
    headline: 'Founding Partner astoryaVC (insurtech)',
    secteur: 'assurance_fr',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes:
      'KEEP v0.2 — 10 posts/30j. SEULE voix insurtech FR dense. À monitorer langue (suspecté EN).',
    is_active: true,
  },
];

const MAYBE: ProfileSeed[] = [
  {
    profile_id: 'arthur-waller-a793a611',
    nom: 'Arthur Waller',
    headline: 'Co-Founder & CEO Pennylane',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 50_000,
    notes: 'MAYBE v0.2 — 3 posts/30j. Fondateur unicorne fintech FR.',
    is_active: true,
  },
  {
    profile_id: 'amhalla',
    nom: 'Asma Mhalla',
    headline: 'Chercheuse tech & géopolitique',
    secteur: 'ia_b2b',
    langue: 'FR',
    audience_size_estimee: 50_000,
    notes:
      'MAYBE v0.2 — 1 post/30j. Ton aligné Synvex (lucide, analytique). Stratégique malgré faible volume.',
    is_active: true,
  },
  {
    profile_id: 'steveanavi',
    nom: 'Steve Anavi',
    headline: 'Co-Founder Qonto',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'MAYBE v0.2 — 1 post/30j. Co-fondateur Qonto.',
    is_active: true,
  },
  {
    profile_id: 'fplais',
    nom: 'Frédéric Plais',
    headline: 'CEO Platform.sh',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 1 post/30j. DevOps B2B FR.',
    is_active: true,
  },
  {
    profile_id: 'its-me-anais-monlong',
    nom: 'Anaïs Monlong',
    headline: 'VP Customer Aircall',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 1 post/30j. Customer ops à scale.',
    is_active: true,
  },
  {
    profile_id: 'alexandre-yazdi-21a9813a',
    nom: 'Alexandre Yazdi',
    headline: 'CEO Voodoo',
    secteur: 'saas_ops',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'MAYBE v0.2 — 1 post/30j. Gaming + scaling extrême.',
    is_active: true,
  },
  {
    profile_id: 'igorcarron',
    nom: 'Igor Carron',
    headline: 'Co-Founder LightOn',
    secteur: 'ia_b2b',
    langue: 'FR',
    audience_size_estimee: 15_000,
    notes: 'MAYBE v0.2 — 2 posts/30j. LLM B2B français, infra IA.',
    is_active: true,
  },
  {
    profile_id: 'jeandavidchamboredon',
    nom: 'Jean-David Chamboredon',
    headline: 'Co-Founder ISAI',
    secteur: 'finance_conseil',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'MAYBE v0.2 — 1 post/30j. VC FR historique.',
    is_active: true,
  },
  {
    profile_id: 'fredericbardeau',
    nom: 'Frédéric Bardeau',
    headline: 'Co-Founder Simplon',
    secteur: 'finance_conseil',
    langue: 'FR',
    audience_size_estimee: 30_000,
    notes: 'MAYBE v0.2 — 3 posts/30j. Ed-tech B2B, inclusion.',
    is_active: true,
  },
  {
    profile_id: 'yann-coatanlem',
    nom: 'Yann Coatanlem',
    headline: 'CEO DataValidation',
    secteur: 'finance_conseil',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 1 post/30j. Économiste data B2B financier.',
    is_active: true,
  },
  {
    profile_id: 'ochaduteau',
    nom: 'Olivier Chaduteau',
    headline: 'Founder Day One',
    secteur: 'legal_regtech',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 1 post/30j. Conseil cabinets juridiques.',
    is_active: true,
  },
  {
    profile_id: 'drouard',
    nom: 'Étienne Drouard',
    headline: 'Avocat data protection (Hogan Lovells)',
    secteur: 'legal_regtech',
    langue: 'FR',
    audience_size_estimee: 15_000,
    notes: 'MAYBE v0.2 — 2 posts/30j. RGPD / data protection. Utile défendabilité Synvex.',
    is_active: true,
  },
  {
    profile_id: 'bertrandcassar',
    nom: 'Bertrand Cassar',
    headline: 'Founder LegalPlace',
    secteur: 'legal_regtech',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 1 post/30j. Legal-tech B2B SMB.',
    is_active: true,
  },
  {
    profile_id: 'quentin-guilluy-82a73a30',
    nom: 'Quentin Guilluy',
    headline: 'Co-Founder Andjaro',
    secteur: 'rh_tech',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 1 post/30j. RH-tech terrain.',
    is_active: true,
  },
  {
    profile_id: 'stan-massueras-45bb564a',
    nom: 'Stan Massueras',
    headline: 'Sales Leader EMEA (ex-Intercom)',
    secteur: 'sales_marketing',
    langue: 'FR',
    audience_size_estimee: 20_000,
    notes: 'MAYBE v0.2 — 3 posts/30j. Sales B2B SaaS.',
    is_active: true,
  },
  {
    profile_id: 'pierre-bessé-conseil-assurance',
    nom: 'Pierre Bessé',
    headline: 'Président Bessé Conseil Assurance',
    secteur: 'assurance_fr',
    langue: 'FR',
    audience_size_estimee: 5_000,
    notes: 'MAYBE v0.2 — 3 posts/30j. ASSURANCE FR — courtier indépendant moyen.',
    is_active: true,
  },
  {
    profile_id: 'paul-jousse',
    nom: 'Paul Jousse',
    headline: 'Directeur général Bessé',
    secteur: 'assurance_fr',
    langue: 'FR',
    audience_size_estimee: 5_000,
    notes: 'MAYBE v0.2 — 2 posts/30j. ASSURANCE FR — DG cabinet courtage.',
    is_active: true,
  },
  {
    profile_id: 'benjamin-verlingue-913b3037',
    nom: 'Benjamin Verlingue',
    headline: 'Président Adelaïde Group',
    secteur: 'assurance_fr',
    langue: 'FR',
    audience_size_estimee: 5_000,
    notes: 'MAYBE v0.2 — 2 posts/30j. ASSURANCE FR — président groupe courtage.',
    is_active: true,
  },
  {
    profile_id: 'stephen-leguillon-67001937',
    nom: 'Stephen Leguillon',
    headline: 'CEO Seyna (MGA / insurance-as-a-service FR)',
    secteur: 'assurance_fr',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 2 posts/30j. ASSURANCE FR — CEO MGA tech-forward.',
    is_active: true,
  },
  {
    profile_id: 'jules-veyrat',
    nom: 'Jules Veyrat',
    headline: 'CEO Stoïk (cyber insurance B2B FR)',
    secteur: 'assurance_fr',
    langue: 'FR',
    audience_size_estimee: 10_000,
    notes: 'MAYBE v0.2 — 3 posts/30j. ASSURANCE FR — fondateur insurtech cyber.',
    is_active: true,
  },
];

const ALL_V02 = [...KEEP, ...MAYBE];

// Profils v0.1 DROP à désactiver (encore is_active=true en base).
const DROP_TO_DEACTIVATE = [
  'hugo-andrianjatovo',
  'profit-led-growth',
  'olivier-babeau',
  'marieekeland',
  'domitille-de-saint-exupery',
];

async function main(): Promise<void> {
  const supabase = createNexusSupabaseClient();

  // 1. UPSERT des 34 v0.2
  let inserted = 0;
  let updated = 0;
  for (const profile of ALL_V02) {
    const { data: existing } = await supabase
      .from('profiles_watchlist')
      .select('profile_id')
      .eq('profile_id', profile.profile_id)
      .maybeSingle();

    const { error } = await supabase
      .from('profiles_watchlist')
      .upsert(profile as never, { onConflict: 'profile_id' });
    if (error) {
      logger.error({ profile_id: profile.profile_id, msg: error.message }, 'upsert_failed');
      continue;
    }
    if (existing) updated += 1;
    else inserted += 1;
  }
  logger.info({ inserted, updated }, 'v02_upsert_done');

  // 2. Désactiver les v0.1 DROP encore actifs
  const { error: deactErr, count: deactCount } = await supabase
    .from('profiles_watchlist')
    .update({ is_active: false } as never, { count: 'exact' })
    .in('profile_id', DROP_TO_DEACTIVATE);
  if (deactErr) {
    logger.error({ msg: deactErr.message }, 'deactivate_failed');
  } else {
    logger.info({ deactivated: deactCount }, 'v01_drop_deactivated');
  }

  // 3. Récap final
  const { count: activeTotal } = await supabase
    .from('profiles_watchlist')
    .select('profile_id', { count: 'exact', head: true })
    .eq('is_active', true);
  const { count: inactiveTotal } = await supabase
    .from('profiles_watchlist')
    .select('profile_id', { count: 'exact', head: true })
    .eq('is_active', false);

  process.stdout.write('\n========== Watchlist v0.2 seed ==========\n');
  process.stdout.write(`Inserted              : ${inserted}\n`);
  process.stdout.write(`Updated               : ${updated}\n`);
  process.stdout.write(`v0.1 DROP deactivated : ${deactCount ?? 0}\n`);
  process.stdout.write(`Active total          : ${activeTotal ?? '?'}\n`);
  process.stdout.write(`Inactive total        : ${inactiveTotal ?? '?'}\n`);
  process.stdout.write('==========================================\n\n');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'seed_v02_failed');
  process.exit(1);
});
