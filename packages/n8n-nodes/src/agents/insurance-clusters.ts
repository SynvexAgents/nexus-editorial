/**
 * insurance-clusters — définition des 7 clusters thématiques interrogés
 * via Perplexity Sonar Pro pour l'Agent 5 InsuranceTrendsSynthesizer.
 *
 * Le 8e cluster du schéma InsuranceTrends (`actualites_majeures`) est composé
 * en post-processing déterministe (top items récents cross-cluster), pas
 * via un appel API distinct — il agrège les autres résultats.
 *
 * Chaque cluster définit :
 *   - `id` : clé exacte du schéma InsuranceTrends
 *   - `label` : titre lisible pour logs / synthèse
 *   - `priority` : ordre de priorité pour le dedup cross-cluster (1 = top)
 *   - `query_builder(weekRange)` : compose le prompt Perplexity avec dates
 */

export type ClusterId =
  | 'regulation_acpr'
  | 'sinistres_fraude'
  | 'courtage_distribution'
  | 'mutuelles_complementaires'
  | 'insurtech_ia_assurance'
  | 'back_office_productivite'
  | 'signaux_faibles';

export interface ClusterWeekRange {
  /** Date début, ISO 8601 (YYYY-MM-DD). */
  date_start: string;
  /** Date fin, ISO 8601 (YYYY-MM-DD), inclus. */
  date_end: string;
}

export interface ClusterDef {
  id: ClusterId;
  label: string;
  /** Plus le nombre est bas, plus le cluster est prioritaire pour le dedup. */
  priority: number;
  query_builder: (range: ClusterWeekRange) => string;
}

/**
 * Sources autorisées partagées par la plupart des clusters. Listées dans le
 * prompt pour orienter Perplexity vers du contenu français / européen
 * institutionnel ou journalistique spécialisé.
 */
const SOURCES_FR_INSTITUTIONNELLES = [
  'acpr.banque-france.fr',
  'argusdelassurance.com',
  'newsassurancespro.com',
  'tribuneassurance.fr',
  'lesechos.fr',
  'latribune.fr',
  'eba.europa.eu',
  'eiopa.europa.eu',
];

/**
 * Schéma JSON attendu en sortie de chaque appel Perplexity. Inclus dans
 * chaque prompt pour cadrer le formatage.
 */
const ITEM_SCHEMA_DESCR = `Chaque entrée doit être un objet JSON avec EXACTEMENT ces 5 champs :
- "titre" : string non vide, titre de l'actualité tel quel.
- "source_url" : string, URL ABSOLUE et vérifiable (commence par https://).
- "resume_2_lignes" : string non vide, 1 à 2 phrases factuelles en français.
- "date" : string ISO 8601 (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ssZ).
- "impact_metier" : string non vide, 1 phrase qui explique l'implication concrète pour un cabinet de courtage / MGA / mutuelle / délégataire FR.

Retourne UN SEUL tableau JSON, commençant par [ et finissant par ]. Aucun texte hors JSON. Aucune balise markdown.`;

function defaultSourceList(): string {
  return SOURCES_FR_INSTITUTIONNELLES.map((s) => `- ${s}`).join('\n');
}

export const CLUSTERS: ClusterDef[] = [
  {
    id: 'regulation_acpr',
    label: 'Réglementation ACPR / EIOPA',
    priority: 1,
    query_builder: ({
      date_start,
      date_end,
    }) => `Liste les actualités, communiqués, décisions, sanctions ou tendances de l'ACPR (Autorité de Contrôle Prudentiel et de Résolution française), de l'EIOPA, ou de la réglementation assurance française au cours de la période du ${date_start} au ${date_end} (7 jours).

Sources de référence (à privilégier en priorité, mais tu peux aussi citer d'autres médias FR sérieux sur l'assurance si pertinent) :
${defaultSourceList()}

${ITEM_SCHEMA_DESCR}

Cible : 3 à 8 entrées maximum. Si peu de matière sur la semaine, retourne moins d'entrées plutôt que de combler avec du bruit ancien.`,
  },
  {
    id: 'sinistres_fraude',
    label: 'Sinistres, fraude, indemnisation',
    priority: 2,
    query_builder: ({
      date_start,
      date_end,
    }) => `Liste les actualités sur les sinistres assurance français, la fraude documentaire, la gestion d'indemnisation, l'évolution du ratio S/P, les bordereaux, les conventions sinistres, ou les délais de règlement, sur la période du ${date_start} au ${date_end} (7 jours).

Sources de référence (à privilégier en priorité, mais tu peux aussi citer d'autres médias FR sérieux sur l'assurance si pertinent) :
${defaultSourceList()}

${ITEM_SCHEMA_DESCR}

Cible : 3 à 8 entrées. Exclus les communiqués marketing d'assureurs. Privilégie : retours d'expérience cabinet, données sectorielles, alertes fraude, décisions judiciaires.`,
  },
  {
    id: 'courtage_distribution',
    label: 'Courtage et distribution',
    priority: 3,
    query_builder: ({
      date_start,
      date_end,
    }) => `Liste les actualités sur le marché du courtage d'assurance français : consolidation, M&A, nouveaux apporteurs, rétrocessions, commissions, embauches stratégiques chez les courtiers, déploiements de plateformes, partenariats compagnie/courtier, sur la période du ${date_start} au ${date_end} (7 jours).

Sources de référence (à privilégier en priorité, mais tu peux aussi citer d'autres médias FR sérieux sur l'assurance si pertinent) :
${defaultSourceList()}

${ITEM_SCHEMA_DESCR}

Cible : 3 à 8 entrées. Privilégie : Bessé, Verspieren, Diot-Siaci, Aon France, WTW, Adelaïde Group, +Simple, courtiers indépendants. Exclus annonces produits B2C.`,
  },
  {
    id: 'mutuelles_complementaires',
    label: 'Mutuelles santé et complémentaires',
    priority: 4,
    query_builder: ({
      date_start,
      date_end,
    }) => `Liste les actualités sur les mutuelles santé françaises, complémentaires santé, prévoyance collective, négociations tarifaires, fusions/rapprochements de mutuelles, évolutions réglementaires santé, sur la période du ${date_start} au ${date_end} (7 jours).

Sources de référence (à privilégier en priorité, mais tu peux aussi citer d'autres médias FR sérieux sur l'assurance si pertinent) :
${defaultSourceList()}
- mutuelle-info.com
- previssima.fr

${ITEM_SCHEMA_DESCR}

Cible : 3 à 8 entrées. Privilégie : VYV, MGEN, Harmonie Mutuelle, Mutuelle des Motards, mutuelles régionales. Exclus communiqués de relations publiques sans contenu factuel.`,
  },
  {
    id: 'insurtech_ia_assurance',
    label: 'Insurtech FR + IA appliquée assurance',
    priority: 5,
    query_builder: ({
      date_start,
      date_end,
    }) => `Liste les actualités sur les insurtechs françaises et l'IA appliquée à l'assurance : levées de fonds, lancements produits, partenariats avec compagnies, déploiements IA en souscription/sinistres/tarification, sur la période du ${date_start} au ${date_end} (7 jours).

Sources de référence (à privilégier en priorité, mais tu peux aussi citer d'autres médias FR sérieux sur l'assurance si pertinent) :
${defaultSourceList()}
- maddyness.com
- usine-digitale.fr
- frenchweb.fr
- techcrunch.com (uniquement articles sur insurtechs FR)

${ITEM_SCHEMA_DESCR}

Cible : 3 à 8 entrées. Privilégie : Seyna, Descartes Underwriting, Stoïk, +Simple, Tinubu, Akur8, Shift Technology, Zelros. Exclus annonces de growth marketing ou levées récurrentes non transformatives.`,
  },
  {
    id: 'back_office_productivite',
    label: 'Back-office et productivité opérationnelle',
    priority: 6,
    query_builder: ({
      date_start,
      date_end,
    }) => `Liste les actualités sur la productivité back-office assurance française : automatisation, dématérialisation, IA documentaire, STP (straight-through processing), outsourcing, embauches massives ou licenciements liés à la transformation opérationnelle, sur la période du ${date_start} au ${date_end} (7 jours).

Sources de référence (à privilégier en priorité, mais tu peux aussi citer d'autres médias FR sérieux sur l'assurance si pertinent) :
${defaultSourceList()}
- usine-digitale.fr
- lemondeinformatique.fr

${ITEM_SCHEMA_DESCR}

Cible : 3 à 8 entrées. Privilégie : retours terrain chiffrés, déploiements outils, gains de productivité mesurés. Exclus livres blancs marketing.`,
  },
  {
    id: 'signaux_faibles',
    label: 'Signaux faibles et tendances émergentes',
    priority: 7,
    query_builder: ({
      date_start,
      date_end,
    }) => `Quels signaux faibles ou tendances émergentes du marché de l'assurance française observe-t-on sur la période du ${date_start} au ${date_end} (7 jours) ? Cherche des annonces discrètes, embauches stratégiques inhabituelles, levées de fonds d'insurtechs FR sous le radar, partenariats inattendus, commentaires de dirigeants qui signalent une bascule, ou décisions de fournisseurs technologiques qui annoncent une réorganisation de chaîne.

Sources de référence (à privilégier en priorité, mais tu peux aussi citer d'autres médias FR sérieux sur l'assurance si pertinent) :
${defaultSourceList()}
- maddyness.com
- frenchweb.fr
- lemondeinformatique.fr

${ITEM_SCHEMA_DESCR}

Cible : 2 à 6 entrées. Privilégie le signal faible authentique, pas le titre racoleur. Si rien d'inhabituel cette semaine, retourne moins d'entrées plutôt que de combler.`,
  },
];

export const CLUSTERS_BY_ID = new Map<ClusterId, ClusterDef>(CLUSTERS.map((c) => [c.id, c]));
