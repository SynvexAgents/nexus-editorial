// produits-synvex-seed — corpus structuré des 7 fiches produit Synvex.
//
// Source : exports PDF "Solution Overview / Spec produit" (Argus, Atlas,
// Hermès, Cortex, Chiron, Helios, Orion), extraits via pdftotext puis
// structurés à la main pour garantir la VÉRACITÉ (aucun chiffre inventé) et
// l'ABSENCE de données sensibles (employeurs, emails, signature, mentions
// confidentielles). Un test de garde (produit-synvex.test.ts) scanne ce
// fichier et échoue si un token sensible réapparaît.
//
// Ce fichier est la source de vérité de l'import : import-produits.ts l'upsert
// dans public.produits_synvex (pas de parsing PDF runtime, pas d'appel LLM).

import type { ProduitSynvexRecord } from '@nexus/shared';

export const PRODUITS_SEED: ProduitSynvexRecord[] = [
  {
    slug: 'argus',
    nom: 'Argus',
    domaine: 'Sinistres professionnels (MRP, RC Pro, Décennale, Protection Juridique) + pilotage portefeuille',
    positionnement:
      'Le gardien des dossiers sinistres et du portefeuille : transforme la boîte mail sinistres en raisonnement métier sur chaque dossier, et le portefeuille en console de contrôle technique. Une plateforme, deux couches (gestion + pilotage).',
    problemes_terrain: [
      "Le raisonnement métier sur chaque email consomme plus de temps que le traitement : comprendre ce qu'une facture, une expertise ou un PV change pour un dossier prend plus de temps que de l'archiver.",
      "Sorties de délégation non détectées : un dossier traité hors binding authority devient un audit assureur défavorable et une menace sur le renouvellement.",
      "Leakage économique invisible : trop-payés, garantie erronée, franchise oubliée, recours non exercés, sur-provisionnement — des fuites tracées nulle part.",
      "Bordereaux erronés envoyés aux porteurs de risque : une donnée incohérente érode la confiance assureur et déclenche des contrôles techniques.",
    ],
    mecaniques: [
      "Dossier Vivant : une thèse en cours mise à jour à chaque pièce reçue, pas une fiche statique.",
      "Recommendation + Risk Review : l'agent argumente puis se conteste (double lecture : pourquoi ça tient, ce qui pourrait l'invalider).",
      "Mode Question : sur un email ambigu, l'agent demande au gestionnaire au lieu de mal classer, et apprend de la réponse.",
      "Brief quotidien à 7h : urgents avant midi, validations en 1 clic, dossiers complexes l'après-midi.",
      "Détection proactive : dossiers silencieux, pièces attendues, SLA assureur menacés, prescriptions qui approchent.",
      "Override Learning : chaque correction du gestionnaire est intégrée ; à J+30 l'agent ressemble à l'équipe.",
      "Ghost Mode : rejoue l'analyse sur des archives anonymisées et chiffre en euros le leakage passé.",
      "Control Layer portefeuille : Authority Engine (matrice de délégation en live), Portfolio Risk Radar, Bordereau Quality Gate, Fraud & Leakage Panel, Recovery Potential, Executive Claims Pack.",
    ],
    chiffres: [
      { valeur: '8 secondes', libelle: "compréhension d'un dossier au lieu de relire 15 emails" },
      { valeur: '30 secondes', libelle: 'décision argumentée au lieu de 10 minutes' },
      { valeur: '7h00', libelle: "journée déjà priorisée avant l'arrivée (brief par gestionnaire)" },
      { valeur: 'J+30', libelle: "l'agent ressemble à l'équipe après un mois de corrections" },
    ],
    cibles: [
      'MGA & courtiers délégataires',
      'Insurtechs en hyper-croissance',
      "Captives d'assurance",
      'Plateformes embedded insurance',
      'Mutuelles & institutions de prévoyance',
      'Réassureurs (programmes & traités délégués)',
    ],
    punchlines: [
      "Le sujet n'est ni l'automatisation ni l'IA. C'est le raisonnement métier sur chaque dossier — et le contrôle technique du portefeuille qui en découle.",
      "L'IA recommande. Le gestionnaire valide. Toujours, sans exception.",
      "Argus ne trie pas la corbeille. Il enquête sur chaque dossier — puis pilote le portefeuille qui en résulte.",
    ],
    differenciation:
      "Raisonnement, pas classification : Argus recalcule l'état complet du dossier à chaque pièce et argumente. Override Learning : l'outil devient personnel à l'équipe en 30 jours. Audit-ready by design : pack de preuve complet par dossier (timeline, pièces, décisions versionnées, règles appliquées). Human-in-the-loop systématique avec kill switch. Hébergement UE, chiffrement TLS 1.3 + AES-256.",
  },
  {
    slug: 'atlas',
    nom: 'Atlas',
    domaine: 'Pilotage opérationnel du cabinet de courtage (emails, WhatsApp, documents, CRM)',
    positionnement:
      "L'agent IA qui pilote le cabinet de courtage : traite emails et WhatsApp en moins de 5 secondes, récupère les documents manquants chez les clients, anticipe signatures, relances et renouvellements.",
    problemes_terrain: [
      "Un cabinet consacre environ 60% du temps de ses gestionnaires à des tâches répétitives sans valeur commerciale directe (tri d'emails compagnies, relances documents, mises à jour CRM).",
      'Relances clients chronophages pour récupérer permis, RIB, RI, cartes grises.',
      'Aucune vue consolidée du portefeuille, des priorités, du temps réellement investi.',
      "Le dirigeant arbitre seul les priorités sans données fiables ni anticipation ; la croissance plafonne même quand les opportunités sont là.",
    ],
    mecaniques: [
      'Traitement omnicanal : email + WhatsApp Business, classification IA contextuelle en moins de 5 secondes.',
      'Pipeline OCR documents : extraction des champs critiques (RIB, permis, RI), validation et transmission aux compagnies.',
      "Génération de messages : relances et emails compagnies dans le ton du cabinet, calibrés sur des exemples réels.",
      'Intelligence prédictive : score de probabilité de signature, détection des deals en souffrance, anticipation des renouvellements à 90 jours.',
      'Business intelligence : performance par compagnie partenaire, cohortes mensuelles, ROI consolidé, rapport mensuel.',
      'Dashboard temps réel : vue portefeuille, escalades, brouillons, stream live d\'activité (PWA iOS/Android).',
    ],
    chiffres: [
      { valeur: '< 5 secondes', libelle: 'latence de traitement par email' },
      { valeur: '11 heures+', libelle: 'temps libéré par semaine pour le dirigeant (cabinet type)' },
      { valeur: '+40%', libelle: 'taux de récupération des documents sous 7 jours' },
      { valeur: '−60%', libelle: 'délai de réponse client sur les demandes courantes' },
      { valeur: '60%', libelle: 'des tâches automatisées' },
      { valeur: '< 14 jours', libelle: 'déploiement complet' },
    ],
    cibles: [
      'Cabinet indépendant (100k–500k€ de commissions)',
      'Cabinet structuré (500k–2M€ de commissions)',
      'Groupe de courtage multi-sites',
      'Courtier grossiste / délégataire',
    ],
    punchlines: [
      "Le quotidien d'un cabinet absorbe l'énergie commerciale.",
      "L'agent propose, le dirigeant valide.",
      "Le bon agent IA n'est pas celui qui fait le plus de choses. C'est celui qui comprend votre métier.",
    ],
    differenciation:
      "Expertise métier réelle : six ans d'expérience opérationnelle en gestion de sinistres fondent les règles, pas un cabinet de conseil. Calibrage personnalisé : ton du dirigeant, conventions compagnies, vocabulaire du cabinet — l'agent sonne juste dès le premier message. Architecture premium, conformité RGPD, audit trail complet, hébergement UE. Le cabinet garde la maîtrise totale (seuils de confiance paramétrables).",
  },
  {
    slug: 'hermes',
    nom: 'Hermès',
    domaine: 'Pilotage de la rentabilité du cabinet de courtage (commissions, rétention, sinistres, croissance)',
    positionnement:
      "L'agent IA qui pilote la rentabilité du cabinet : colmate les quatre fuites silencieuses — commissions sous-payées, clients qui partent sans signal, dossiers sinistres qui dorment, recommandations jamais demandées.",
    problemes_terrain: [
      'Commissions sous-payées par les assureurs sur des erreurs de bordereaux non détectées.',
      'Clients qui partent sans signal : la zone de risque résiliation se détecte trop tard.',
      'Dossiers sinistres qui dorment : relances client chronophages, suivi non orchestré.',
      "Rentabilité pilotée à l'instinct, sans visibilité par apporteur, par compagnie, par branche.",
    ],
    mecaniques: [
      'Audit bordereaux commissions : lecture mensuelle, détection des 8 erreurs types, réclamation automatique.',
      'Radar de rétention client : détection des signaux de décrochage 45 à 60 jours avant résiliation.',
      "Bras droit sinistres : orchestration du suivi dossier (accusé, points d'avancement, relances assureur, clôture).",
      'Cockpit commissions : quels assureurs sous-paient, quels contrats sont les plus rentables, évolution mois sur mois.',
      'Heatmap risque portefeuille : quelle compagnie, quelle branche, quel apporteur concentre le risque.',
      'Rentabilité par apporteur : score par producteur (mix, sinistralité, churn) pour armer la décision RH.',
    ],
    chiffres: [
      { valeur: '+5%', libelle: 'de commissions récupérées par an (cabinet type)' },
      { valeur: '−30%', libelle: 'de churn client sur signaux faibles' },
      { valeur: '×2', libelle: 'dossiers sinistres suivis sereinement' },
      { valeur: '4 à 7%', libelle: 'commissions perdues chaque année sur erreurs de bordereaux non détectées' },
      { valeur: '60 jours', libelle: "délai de détection moyen d'un client en zone de risque résiliation" },
    ],
    cibles: [
      'Cabinet indépendant (100k–500k€ de commissions)',
      'Cabinet structuré (500k–2M€ de commissions)',
      'Groupe de courtage multi-sites',
      'Courtier grossiste délégataire',
    ],
    punchlines: [
      "Un cabinet de courtage ne perd pas par manque de production. Il perd parce qu'il ne voit pas les fuites qu'il a déjà.",
      'Du cabinet artisanal au cabinet piloté.',
      "Hermès ne remplace pas les gestionnaires. Il leur donne la visibilité quotidienne sur les fuites et les leviers.",
    ],
    differenciation:
      "Verticalité métier : conçu par des opérationnels qui connaissent les bordereaux, les conventions et les politiques de commission de l'intérieur. Données cabinet souveraines : hébergement UE, traçabilité complète, validation humaine sur les seuils critiques.",
  },
  {
    slug: 'cortex',
    nom: 'Cortex',
    domaine: 'Infrastructure IA de gestion des sinistres à l\'échelle (multi-marques, multi-pays, multi-carriers)',
    positionnement:
      "L'infrastructure IA qui pilote la gestion des sinistres à l'échelle : traiter plus de dossiers, plus vite, sans embaucher linéairement — sans perdre la main sur le loss ratio.",
    problemes_terrain: [
      "Les pics saisonniers saturent les équipes : l'embauche linéaire détruit l'EBITDA. Tenir un SLA de 48h sur des millions d'assurés impose soit de recruter à chaque vague, soit d'accepter la dégradation.",
      'Le loss ratio dérive sans alerte actionnable, programme par programme : les plateformes affichent la donnée mais n\'ajustent pas les seuils décisionnels (thermomètre vs thermostat).',
      "Chaque décision déléguée doit être défendable devant carriers, partenaires et régulateur : sans audit-trail signé et explicable, la délégation devient un risque (ACPR / RGPD article 22).",
    ],
    mecaniques: [
      'Sensorium : lecture multi-format (PDF, photos floues, scans, audio, vidéo, multi-langues), extraction structurée avec score de confiance par champ.',
      "Reasoning Engine : cinq agents IA collaboratifs (analyse documentaire, fraude, conformité, communication, supervision) ; auto-validation des dossiers simples, escalade ciblée des cas complexes.",
      'Fraud Graph : détection cross-marques et cross-programmes (IBAN partagé, IP, métadonnées altérées).',
      'Predictive SLA : anticipe les dérapages SLA 48h avant, re-routage automatique des dossiers à risque.',
      'Threshold Auto-Tuner : ajuste les seuils décisionnels par programme, carrier, marque (un thermostat, pas un thermomètre).',
      "Audit Vault : chaque décision tracée, hashée, signée ; conforme ACPR et droit à l'explication RGPD article 22, exportable.",
      'Programme Studio : un nouveau programme (pays, marque, carrier) se déploie en moins de 5 minutes, contre 4 à 6 semaines en interne.',
    ],
    chiffres: [
      { valeur: '70%+', libelle: "d'auto-validation sur dossiers standards" },
      { valeur: '48h', libelle: 'SLA tenu en pic, sans recrutement saisonnier' },
      { valeur: '−40%', libelle: 'temps moyen de traitement par dossier' },
      { valeur: '100%', libelle: 'décisions audit-trailées et défendables' },
      { valeur: '< 5 minutes', libelle: "déploiement d'un nouveau programme (vs 4 à 6 semaines en interne)" },
    ],
    cibles: [
      'Courtiers-grossistes & MGAs (délégation de souscription, multi-carriers, multi-pays)',
      'Distributeurs embedded (billetterie, voyage, événementiel, retail, mobilité)',
      'Insurtechs en scaling',
      'Holdings / groupes multi-marques',
    ],
    punchlines: [
      'La majorité des plateformes monitorent. Aucune ne pilote.',
      'Différence thermomètre vs thermostat : loss ratio piloté, pas subi.',
      "L'IA dans l'assurance ne manque pas d'algorithmes. Elle manque d'infrastructures qui tiennent en production.",
    ],
    differenciation:
      "Pas de R&D sans valeur business (pas de POC qui finissent en démos internes). Architecture multi-agents production-ready, pas un wrapper LLM jetable : agents spécialisés, versionnés, traçables, human-in-the-loop natif. Engagement sur les KPIs métier, pas sur la livraison technique.",
  },
  {
    slug: 'chiron',
    nom: 'Chiron',
    domaine: 'Remboursement santé (humaine et animale) + pilotage du ratio S/P par garantie',
    positionnement:
      "L'agent IA qui rembourse, contrôle et pilote, en santé humaine et animale : traiter plus de remboursements plus vite, sans embaucher linéairement, sans laisser passer de fraude, sans perdre de vue le ratio S/P par garantie.",
    problemes_terrain: [
      'Le remboursement santé reste un goulet d\'étranglement : volumes en hausse, réseaux de soins qui s\'élargissent, fraude qui se sophistique, équipes qui traitent encore manuellement à la pièce.',
      'Aucune visibilité technique sur la dérive : la détection du S/P par garantie reste trimestrielle.',
      "Renégociation des conventions prestataires faite « à la louche », sans donnée.",
    ],
    mecaniques: [
      'OCR & lecture des pièces : décomptes santé, factures vétérinaires, ordonnances, extraction structurée prête à contrôler.',
      'Vérification des garanties : plafonds, exclusions, franchises, conventions — lecture du contrat appliquée à chaque dossier.',
      'Détection fraude & anomalies : doublons, sur-facturation, prestataires inconnus, pattern réseau.',
      'Scoring & escalade : score de confiance 0 à 100 par dossier (auto-validation, validation humaine ou escalade).',
      'Pilotage S/P par garantie : ratio sinistres/primes en temps réel par acte, alerte dérive avant explosion budget.',
      'Heatmap réseau prestataires : quels cabinets, cliniques ou pharmacies concentrent le risque.',
    ],
    chiffres: [
      { valeur: '−85%', libelle: 'temps de traitement d\'un dossier' },
      { valeur: '×3', libelle: 'dossiers par gestionnaire' },
      { valeur: '+40%', libelle: 'fraudes détectées' },
      { valeur: '3 à 5 min', libelle: "temps moyen de traitement manuel actuel d'un dossier en gestion" },
      { valeur: '8 à 12%', libelle: "taux d'anomalies non détectées (doublons, garanties, plafonds)" },
    ],
    cibles: [
      'Mutuelle / complémentaire (santé humaine)',
      'Assureur / MGA pet (santé animale)',
      'Courtier / délégataire (gestion déléguée)',
      'Assurtech / embedded (à partir de 5k contrats)',
    ],
    punchlines: [
      "On rembourse vite ou on contrôle bien. Avec une IA verticale, on fait les deux — et on pilote la marge technique en plus.",
      'De la productivité à la marge.',
      'Il déplace la décision technique du comité trimestriel vers le temps réel.',
    ],
    differenciation:
      "Verticalité métier : règles issues du terrain de la gestion santé, pas d'un cabinet de conseil. HDS-ready, défendable ACPR : calculs déterministes, logs traçables, validation humaine sur les seuils critiques, données hébergées UE.",
  },
  {
    slug: 'helios',
    nom: 'Helios',
    domaine: 'Pilotage de la sinistralité prévoyance (indemnités journalières / arrêts de travail)',
    positionnement:
      "L'agent IA qui pilote la sinistralité prévoyance : traiter chaque arrêt de travail plus vite, anticiper la dérive avant le ratio S/P, piloter le renouvellement à la donnée — sans plateforme actuarielle.",
    problemes_terrain: [
      'Les directions prévoyance pilotent à l\'aveugle : le calcul des indemnités journalières reste manuel.',
      "La dégradation d'un contrat ne se voit qu'au renouvellement, quand il est trop tard pour repricer.",
      'Provisioning et pricing de renouvellement faits « au feeling ».',
    ],
    mecaniques: [
      'Calcul IJ automatisé : salaire de référence, IJSS, complément, franchise, plafond — tous contrats prévoyance.',
      'Détection d\'anomalies : salaires zéro, variances, chevauchements, cumul 90j, score de confiance par dossier.',
      'Score de dérive : fréquence, durée moyenne, récurrence vs cohorte, alerte si dégradation au-delà du seuil.',
      'Provisioning prédictif : estimation des IJ à venir sur 90 jours par contrat (arrêts en cours + saisonnalité).',
      "Prime d'équilibre : recalcul de la prime technique vs sinistralité réelle, reco chiffrée d'échéance.",
      'Heatmap portefeuille : quels contrats et entreprises clientes concentrent le risque.',
    ],
    chiffres: [
      { valeur: '−85%', libelle: 'temps de traitement d\'un dossier IJ' },
      { valeur: '×4', libelle: 'erreurs détectées' },
      { valeur: '3–6 mois', libelle: 'anticipation de la dérive (vs détection au renouvellement)' },
      { valeur: '15–30 min', libelle: "temps moyen de traitement manuel actuel d'un dossier IJ" },
      { valeur: '4 à 7%', libelle: 'erreurs de coordination IJSS, franchise ou plafond' },
    ],
    cibles: [
      'Courtier grossiste (portefeuille IJ délégué)',
      'MGA / délégataire (responsabilité technique)',
      'Mutuelle régionale (back-office IJ + actuariat)',
      'Cabinet spécialisé (à partir de 500 contrats IJ)',
    ],
    punchlines: [
      "Le calcul d'IJ est un coût opérationnel. La dérive de sinistralité est une perte de marge. Les deux se traitent au même endroit.",
      'Helios ne se contente pas de calculer. Il pilote.',
      'Du back-office au pilotage de marge.',
    ],
    differenciation:
      'Verticalité métier : conçu par et pour des opérationnels assurance. Défendabilité ACPR : calculs déterministes, logs traçables, validation humaine sur les seuils critiques, données hébergées UE.',
  },
  {
    slug: 'orion',
    nom: 'Orion',
    domaine: "Système IA d'acquisition B2B opéré (détection, qualification, activation d'opportunités)",
    positionnement:
      "Un système IA d'acquisition B2B intégralement opéré par Synvex : détecter, qualifier et activer en continu les meilleures opportunités commerciales — sans gérer aucun outil.",
    problemes_terrain: [
      'Pipeline imprévisible : dépendance au bouche-à-oreille et aux flux entrants aléatoires.',
      "Bande passante humaine plafonnée : l'équipe commerciale passe environ 30% de son temps en recherche de prospects.",
      'Signaux faibles invisibles : les meilleurs moments d\'approche passent inaperçus dans le bruit ambiant.',
      'Outils sans opérateur : les SaaS classiques transfèrent la complexité au client, sans personne pour la gérer.',
    ],
    mecaniques: [
      'Cartographie & détection : surveillance continue de l\'écosystème, signaux concrets sur sources publiques (recrutement, expansion, mouvements, lacunes).',
      'Qualification & scoring IA : scoring contextuel sur 4 axes (pertinence, intensité du signal, potentiel, accessibilité), tri Hot / Warm / Watchlist.',
      "Activation personnalisée : message d'approche construit à partir des signaux détectés, recommandation d'angle, prochaine action concrète.",
      'Réactivation intelligente : relance du pipeline existant au moment-clé (recrutement, expansion, changement de direction).',
      'Intelligence sectorielle : veille hebdomadaire automatisée transformée en contenu de positionnement.',
      'Visibilité inbound B2C : analyse des intentions de recherche, pages de capture, captation opt-in (RGPD natif).',
    ],
    chiffres: [
      { valeur: '~30%', libelle: 'de temps commercial libéré (arrêt de la recherche de prospects)' },
      { valeur: '1 pipeline / semaine', libelle: 'opportunités scorées livrées chaque semaine' },
      { valeur: 'quelques semaines', libelle: 'pour explorer un nouveau marché (vs plusieurs mois pour une équipe humaine)' },
    ],
    cibles: [
      'Courtage en assurance',
      'Cabinets de conseil B2B',
      'Services aux entreprises',
      'SaaS B2B consultatif',
      'Cabinets juridiques & fiscalistes',
      'Recrutement & RH conseil',
    ],
    punchlines: [
      'La prospection moderne est devenue ingérable manuellement.',
      'Vous recevez des opportunités activables, pas un outil à apprendre.',
      'Chaque opportunité est traçable : quel signal, quelle source, quel score. Aucune boîte noire.',
    ],
    differenciation:
      'Done-for-you : Synvex opère le système, le client reçoit des opportunités activables. Conformité RGPD by design : sources publiques B2B, captation B2C strictement opt-in. Transparence totale : chaque opportunité traçable (signal, source, score).',
  },
];
