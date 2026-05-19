# Synvex — Context Brief opérationnel Nexus Editorial

> Notes contextuelles à destination des agents IA en aval (Agents 6 Angles et 7 Winners en particulier). Document append-only : nouvelles sections ajoutées au fil de l'apprentissage opérationnel.

---

## 8. Insight stratégique LinkedIn FR

Audit réalisé en S1 sur la watchlist Nexus Editorial : **l'écosystème assurance français est largement absent de LinkedIn en tant que producteur de contenu**.

Sur 23 profils assurance FR auditités (Top-5 courtage, MGA, consultants, presse spécialisée, insurtechs B2B) :

- 17 sont muets (0 post sur 30j).
- 5 publient 1-3 posts/mois.
- 1 seul publie densément (Florian Graillot, astoryaVC) — mais 100 % en anglais.

### Implications éditoriales pour les Agents 6 et 7

**1. Synvex n'écrit pas dans un espace saturé.**
La concurrence éditoriale pour l'attention des décideurs assurance FR sur LinkedIn est marginale. Pas de bataille de voix à mener.

**2. Les angles ne se positionnent pas "vs les autres voix du secteur".**
Il n'y en a pas, ou si peu. Les Agents Angles (6) et Winners (7) doivent **éclairer le secteur depuis l'extérieur** — lucidité, signal, observation — pas s'inscrire dans un débat existant. Le ton naturel est l'apport d'information ou de cadrage, pas la réfutation.

**3. L'audience cible consomme son contenu professionnel ailleurs.**
Les dirigeants courtage, MGA, mutuelles s'informent via :
- L'Argus de l'assurance (papier et site).
- News Assurances Pro.
- Newsletters internes.
- Événements (Rencontres de l'AMRAE, Journée de l'ACPR, Forum Insurtech, etc.).

LinkedIn est pour eux **un canal de découverte et d'opportunité commerciale**, pas leur source primaire d'information. Les posts Synvex doivent donc **intriguer et qualifier** — pas éduquer en profondeur.

**4. Format implicite des posts produits.**
- Le constat lucide (chiffre + lecture courte) performe mieux que la pédagogie pure.
- L'anecdote terrain (1 phrase + analyse 3 lignes) performe mieux que le retour d'expérience long.
- Le contrarian assurance qui prend le contrepied d'un point établi a une force démesurée parce que peu de voix le font.
- Éviter les "ce qu'on m'a souvent demandé", "voici 5 leçons", "X années plus tard" — tout ce registre creator personnel doit être absent.

**5. Voix dense identifiée (à monitorer mais hors collecte directe).**
Florian Graillot (astoryaVC) est la voix insurtech FR la plus dense. Il publie en anglais donc filtré par notre pipeline FR-only, mais ses signaux sont à surveiller en input "manuel" pour l'Agent 5 (InsuranceTrends Perplexity) qui pourrait croiser ses takes.

### Source de cet insight

Audit Apify 30j (acteur `harvestapi/linkedin-profile-posts`) du 2026-05-14 sur 23 profils assurance FR sourcés via web_search et `argusdelassurance.com` + audit langue franc-min. Coût total audit : ~€0,30. Documenté dans `watchlist_v0.2.md` et `watchlist_v0.3.md` du repo.

---

## 9. Périmètre produit Synvex et lignes assurance couvertes

Cette section est UNE LIMITE DURE pour les angles éditoriaux. Les 
Agents 6 et 7 doivent strictement respecter ce périmètre.

### Catalogue Synvex 2026 — 9 produits

#### Orion — Système IA d'acquisition B2B done-for-you
- POUR QUI : courtage assurance + cabinets conseil B2B + 
  services aux entreprises + SaaS B2B consultatif + agences + 
  cabinets juridiques + recrutement RH
- PROBLÈME RÉSOLU : pipeline B2B imprévisible, 30% temps 
  commercial en recherche prospect, signaux faibles invisibles
- MÉCANISME : 6 capacités intégrées — cartographie écosystème, 
  qualification scoring 4 axes, activation personnalisée, 
  réactivation intelligente, intelligence sectorielle, 
  visibilité inbound RGPD
- ANGLES ÉDITORIAUX TYPIQUES : "30% temps commercial perdu en 
  recherche prospect", "outils sans opérateur", "signaux faibles 
  invisibles dans le bruit", "tester nouveau segment sans 
  recruter"

#### Vega — Veille & réponse appels d'offres assurance
- POUR QUI : courtiers spécialisés RC/dommages aux biens/flotte/
  statutaire, MGA délégataires, compagnies (départements marchés 
  publics), mutuelles santé-prévoyance contrats collectifs
- PROBLÈME RÉSOLU : 8000 AO publics assurance/an dispersés entre 
  BOAMP/JOUE/AWS Achat + AO privés non centralisés, 60-70% AO 
  détectés trop tard, qualification à l'instinct
- MÉCANISME : 8 capacités — détection multi-sources, qualification 
  spécialisée taxonomie CPV 66xxx, scoring par cabinet, extraction 
  documents CCAP/CCTP/BPU/RC, alertes contextualisées, pipeline 
  AO unifié, tracking deadlines, mémoire commerciale
- ANGLES ÉDITORIAUX TYPIQUES : "60-70% AO identifiés trop tard 
  pour produire un dossier sérieux", "6-10h/semaine perdues en 
  veille manuelle", "veille AO encore artisanale en 2026"

#### Chiron — Remboursement santé humaine+animale + pilotage S/P
- POUR QUI : mutuelles santé humaine, assureurs/MGA pet, 
  courtiers/délégataires en gestion déléguée, assurtech/embedded 
  à partir de 5k contrats (API-first)
- PROBLÈME RÉSOLU : 3-5 min temps moyen traitement dossier 
  manuel, 8-12% anomalies non détectées (doublons, garanties, 
  plafonds), dérive S/P par garantie détectée trimestriellement
- MÉCANISME : 6 capacités sur 2 couches — Couche 1 Remboursement 
  (OCR pièces, vérification garanties, détection fraude+anomalies, 
  scoring+escalade) et Couche 2 Pilotage (S/P temps réel par 
  garantie, heatmap réseau prestataires, dérive avant explosion 
  budget)
- ANGLES ÉDITORIAUX TYPIQUES : "8-12% d'anomalies non détectées 
  sur les remboursements", "ratio S/P découvert trimestre par 
  trimestre — c'est trop tard", "heatmap réseau prestataires : 
  qui concentre le risque"

#### Argus — Agent sinistres IARD pro + Control Layer portefeuille
- POUR QUI : MGA & courtiers délégataires, insurtechs 
  hyper-croissance, captives d'assurance, plateformes embedded, 
  mutuelles & institutions de prévoyance, réassureurs
- BRANCHES : MRP, RC Pro, Décennale, PJ Pro, Cyber, MRI, Flotte 
  professionnelle — STRICTEMENT IARD pro, 0% B2C particulier
- PROBLÈME RÉSOLU : raisonnement métier sur chaque dossier 
  (multi-pièces, multi-parties prenantes), sorties de délégation 
  non détectées, leakage économique invisible, bordereaux faux 
  envoyés aux porteurs de risque
- MÉCANISME : 13 capacités sur 2 couches — Couche 1 Gestion 
  (Dossier Vivant, Recommendation+Risk Review, Mode Question, 
  Brief Quotidien, Détection Proactive, Override Learning, 
  Ghost Mode analyse rétroactive) + Couche 2 Pilotage (Authority 
  Engine matrice délégation live, Portfolio Risk Radar, 
  Bordereau Quality Gate, Fraud & Leakage Panel, Recovery 
  Potential, Executive Claims Pack)
- POSITIONNEMENT CENTRAL : "raisonnement métier, pas 
  classification" — l'agent argumente et se conteste, ligne 
  rouge non négociable "L'IA recommande, le gestionnaire valide"
- ANGLES ÉDITORIAUX TYPIQUES : "le raisonnement consomme plus 
  de temps que le traitement", "sorties de délégation invisibles 
  = audit assureur défavorable", "leakage économique tracé nulle 
  part", "Override Learning : l'outil devient personnel à 
  l'équipe en 30 jours"

#### Helios — Pilotage sinistralité prévoyance / IJ
- POUR QUI : courtier grossiste portefeuille IJ délégué, MGA/
  délégataire responsabilité technique, mutuelle régionale 
  back-office+actuariat, cabinet spécialisé à partir de 500 
  contrats IJ
- PROBLÈME RÉSOLU : 15-30 min traitement manuel dossier IJ, 
  4-7% erreurs coordination IJSS/franchise/plafond, 6-12 mois 
  délai détection dérive contrat, provisioning et pricing au 
  feeling
- MÉCANISME : 6 capacités sur 2 couches — Couche 1 Opérationnel 
  (calcul IJ automatisé, détection anomalies, scoring+escalade, 
  défendable ACPR) + Couche 2 Pilotage (cockpit sinistralité, 
  score dérive, provisioning prédictif 90j, prime d'équilibre 
  recalculée, heatmap portefeuille)
- ANGLES ÉDITORIAUX TYPIQUES : "calcul IJ = coût opérationnel / 
  dérive sinistralité = perte de marge — les deux se traitent 
  au même endroit", "6-12 mois pour détecter une dérive contrat 
  — quand il est trop tard pour repricer", "provisioning et 
  pricing au feeling en 2026"

#### Hermès — Pilotage cabinet courtage (4 fuites)
- POUR QUI : cabinet indépendant 100k-500k€ commissions / 
  cabinet structuré 500k-2M€ commissions équipe 5-15 personnes / 
  groupe de courtage multi-sites/multi-apporteurs / courtier 
  grossiste délégataire
- PROBLÈME RÉSOLU : 4-7% commissions perdues/an sur erreurs 
  bordereaux non détectées, 60j détection moyenne client en 
  risque résiliation, 3-5h/sem gestionnaires sur relances 
  sinistres, pilotage rentabilité à l'instinct
- MÉCANISME : 6 capacités sur 2 couches — Couche 1 Opérationnel 
  (audit bordereaux commissions+réclamation auto, radar 
  rétention 45-60j avant résiliation, bras droit sinistres, 
  cockpit commissions) + Couche 2 Pilotage (heatmap risque 
  portefeuille, rentabilité par apporteur)
- ANGLES ÉDITORIAUX TYPIQUES : "un cabinet de courtage ne perd 
  pas par manque de production — il perd parce qu'il ne voit 
  pas les fuites qu'il a déjà", "4-7% commissions perdues/an 
  sur erreurs bordereaux", "60 jours pour détecter qu'un 
  client part — il est déjà parti", "pilotage rentabilité par 
  apporteur/compagnie/branche"

#### Nexus — Performance Intelligence Platform
- POUR QUI : COO, Ops Directors, Chiefs of Staff TRANSVERSAL 
  sectoriellement — BPO, centres relation client, back-office, 
  services partagés, ASSURANCE, BANQUE, MUTUELLES, opérations 
  support
- PROBLÈME RÉSOLU : pilotage performance fragmenté/lent/réactif, 
  200h/an de reporting manuel par dirigeant, alertes turnover/
  surcharge/qualité qui arrivent trop tard, "pilotage en mode 
  pompier au lieu de stratégique"
- MÉCANISME : 3 piliers (Consolide source de vérité unique 
  temps réel + Analyse IA stratégique conversationnelle + 
  Anticipe brief quotidien/alertes/simulateur What-If) × 4 
  niveaux hiérarchiques (Gestionnaire → Team Leader → Manager 
  → Grand Manager multi-sites mode Boardroom)
- POSITIONNEMENT SPÉCIAL : seul produit Synvex TRANSVERSAL 
  sectoriellement — il débloque les angles éditoriaux 
  non-assurance (BPO/banque/services partagés) tout en restant 
  cohérent
- ANGLES ÉDITORIAUX TYPIQUES : "pilotage mode pompier vs 
  stratégique", "200h/an de reporting manuel", "pas un dashboard 
  de plus, un copilote pour décider", "−25% turnover détecté 
  par signaux faibles", "bâti par des opérationnels pour des 
  opérationnels"

#### Atlas — Agent IA quotidien cabinet courtage
- POUR QUI : cabinets de courtage 5-15 personnes (sweet spot)
- LIGNES ASSURANCE COUVERTES : auto, santé, prévoyance, 
  habitation, professionnelle, flotte — TOUTES LIGNES EN VENTE 
  CABINET (donc inclut auto/habitation en angle CABINET, jamais 
  en angle particulier direct)
- PROBLÈME RÉSOLU : 60% temps gestionnaires sur tâches 
  répétitives sans valeur commerciale, documents manquants 
  chronophages, visibilité limitée portefeuille, dirigeant arbitre 
  seul sans données
- MÉCANISME : 4 étapes (Capter email+WhatsApp 24/7 → Classifier 
  Claude Opus 4.7 <5sec → Agir documents+relances+transmissions 
  → Piloter dashboard premium temps réel) × 6 capacités 
  (traitement omnicanal, OCR documents RIB/permis/RI, génération 
  messages dans le ton du cabinet, intelligence prédictive score 
  signature, business intelligence ROI, dashboard PWA iOS/Android)
- DIFFÉRENCIATION VS HERMÈS : Atlas = automatisation flux 
  quotidiens. Hermès = pilotage rentabilité stratégique. Les 2 
  peuvent coexister chez le même cabinet.
- ANGLES ÉDITORIAUX TYPIQUES : "60% temps gestionnaires sur 
  tâches répétitives", "le dirigeant arbitre seul sans données 
  fiables", "le bon agent IA n'est pas celui qui fait le plus 
  de choses — c'est celui qui comprend votre métier", "score 
  probabilité signature par dossier"

#### Cortex — Plateforme IA sinistres bout-en-bout
- POUR QUI : brokers multi-marques / multi-distributeurs / 
  multi-pays (cas type opérateur 5M+ insurés type Phenomen — 
  NE PAS NOMMER)
- PROBLÈME RÉSOLU : gestion sinistres FNOL→virement→audit 
  encore manuelle, fraude cross-marques invisible aux outils 
  mono-marque, loss ratio piloté trimestriellement, audits 
  ACPR/RGPD lourds à préparer
- MÉCANISME : 10 modules sur 2 dimensions (gestion automatisée 
  + pilotage temps réel) + 5 agents IA spécialisés en cascade 
  (analyste documentaire, détective fraude, officier conformité, 
  communicant, superviseur) + modèle commercial 2 étapes (pilote 
  4-6 sem clause d'échec → production 12 mois min)
- IMPACT : auto-validation 70-90% dossiers <30s, temps moyen 
  23s, auto-reroutage 600ms, audit ACPR hash SHA-256
- ANGLES ÉDITORIAUX TYPIQUES : "5 agents IA en cascade pour 
  gérer un sinistre bout en bout", "fraude cross-marques 
  invisible aux outils mono-marque", "auto-validation 70-90% 
  dossiers en moins de 30 secondes", "Audit Vault ACPR-compatible 
  : 100% décisions hashées", "pré-cadrage nouveau programme en 
  moins de 10 minutes"

### Lignes HORS PÉRIMÈTRE Synvex (interdites comme sujet principal)

- MRH particulier (CatNat habitation, sécheresse, dégâts des 
  eaux, vol résidence côté assuré)
- Auto particulier (RC, tous risques, bris glace, vol)
- Auto deux-roues particulier
- Voyage et annulation grand public
- Vie épargne particulier (assurance vie, PER individuel, 
  capitalisation)
- Obsèques particulier
- Animaux compagnie B2C direct (Chiron est B2B uniquement)
- Crédit/emprunteur particulier
- Garantie loyers impayés grand public

### Cas limites acceptables

Un sujet hors-périmètre PEUT servir d'angle SI ET SEULEMENT SI 
le post le re-cadre côté cabinet/MGA/mutuelle/délégataire dès 
le hook (3 premières phrases). Le hook doit parler de l'OPÉRATEUR 
de l'assurance, pas de l'assuré final.

EXEMPLE ACCEPTABLE : "Les cabinets de courtage qui gèrent du MRH 
particulier voient leur charge opérationnelle augmenter avec la 
hausse des sinistres CatNat. Plus de bordereaux à expliquer, 
plus de pédagogie par gestionnaire." → hook côté cabinet, pas 
côté assuré.

EXEMPLE INACCEPTABLE : "La franchise sécheresse en habitation 
est passée à 1 520 €. Pour les assurés, la facture monte." → 
hook côté particulier, à rejeter.

### Règle d'équité de rotation produits

Sur une fenêtre glissante de 4 à 8 semaines (12 à 24 posts), 
chaque produit doit être adressé environ ÉQUITABLEMENT :
- Cible : chaque produit apparaît comme produit d'ancrage 
  principal au moins 1 fois sur 4-8 semaines
- Aucun produit ne doit être adressé plus de 2 fois consécutives 
  dans le même run
- L'Agent 7 doit gérer cette rotation via la matrice de 
  complémentarité étendue (voir agent-7-system-prompt.ts)

### Règles "bridge produit" — comment mentionner indirectement

Tous les posts générés DOIVENT :
1. Avoir UN produit Synvex d'ancrage principal (assigné par 
   l'Agent 6)
2. Pratiquer un BRIDGE PRODUIT en fin de post selon 3 modes :
   - SUBTIL (80% des cas) : observation qui fait écho au produit 
     sans le nommer ni décrire la solution. Le lecteur curieux 
     clique sur le profil pour comprendre.
     Exemple Hermès : "Un cabinet de courtage ne perd pas par 
     manque de production. Il perd parce qu'il ne voit pas les 
     fuites qu'il a déjà."
   - MOYEN (20% des cas) : description d'une CATÉGORIE de 
     solution sans nommer le produit Synvex spécifiquement.
     Exemple Argus : "Quand un cabinet passe à un agent qui 
     argumente puis se conteste sur chaque dossier — au lieu 
     d'un outil qui trie — la perception du marché change."
   - EXPLICITE (0% — INTERDIT) : nommer le produit ou faire un 
     pitch direct. CE SERAIT DÉCRÉDIBILISANT.

### Règle de mention IA

Tous les posts générés DOIVENT mentionner l'IA opérationnelle 
selon un de ces 3 modes :
- MODE A SUBTIL : "voici un problème, les acteurs avancés y 
  répondent par X type d'automatisation"
- MODE B DIRECT : "ce problème est typiquement ce qu'un agent 
  IA correctement calibré résout en quelques minutes"  
- MODE C DÉMONSTRATIF : "voici comment on a vu ce problème 
  résolu chez un opérateur récent : un agent qui ingère X, 
  sort Y" (anonymisé strictement)

### Règle de mention clients

JAMAIS d'entité nommée. JAMAIS de Phenomen, Henner, MSH, 
[autre client]. Formulations autorisées : "un de mes clients", 
"un opérateur récent", "sur un déploiement courtage", "dans 
une mutuelle régionale", "chez un broker multi-marques". 

L'expérience personnelle 6 ans MSH/Henner peut être évoquée en 
GÉNÉRALITÉ uniquement ("Quand on gère des sinistres santé 
internationale pendant plusieurs années...") jamais en citant 
les enseignes.

### Règle CTA

CTA implicite via question terrain ouverte. JAMAIS "DM moi", 
"réservez votre démo", "contactez-moi". 
Formulations acceptées : "Comment vous gérez ça dans votre 
cabinet ?", "Vous le voyez aussi de votre côté ?", "Qu'est-ce 
qui change selon vous dans les 18 mois ?" — questions terrain 
qui invitent commentaire et DM organique.

### Ancrage triple obligatoire

Chaque post doit s'appuyer sur AU MOINS UN parmi 3 ancrages :
1. Un chiffre/actualité issu de l'Agent 5 InsuranceTrends 
   (veille Perplexity)
2. Une mécanique éditoriale identifiée par Agent 4 
   LinkedinTrends
3. Une expérience opérationnelle anonymisée (ton terrain 6 ans 
   claims MSH/Henner non-nommés)

### Note pour le futur

Cette liste reflète le catalogue Synvex de mai 2026. Si Synvex 
lance un produit grand public (ex : un produit MRH particulier), 
mettre à jour cette section avant le prochain run hebdomadaire 
ET ajouter le nouveau produit dans le schéma Zod 
`produitSynvexEnum` (packages/shared/src/schemas/weekly-angles.schema.ts) 
+ le mirror dans supabase/functions/_shared/schemas.ts.
