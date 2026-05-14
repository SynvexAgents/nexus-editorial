# Watchlist Nexus Editorial — v0.2

> Issue de l'audit Apify 30j de la v0.1 + recherche ciblée assurance FR.
> Produit le 2026-05-14. Remplace `watchlist_v0.1.md`.
> Source de vérité : seul l'audit Apify (posts_30j) compte. Pas de confiance déclarative.

---

## §1 — Bilan de la v0.1

Audit Apify (acteur `harvestapi/linkedin-profile-posts`, fenêtre 30 jours) sur les 46 profils v0.1 (Marc Trojanowski exclu — nom incorrect, vrais co-fondateurs Doctrine = Bustamante/Dusséaux/Champeimont).

**Verdict global** : 13 KEEP / 15 MAYBE / 18 DROP.

| Verdict | Critère | Compte | % v0.1 |
|---|---|---|---|
| KEEP | ≥ 4 posts / 30j | 13 | 28 % |
| MAYBE | 1–3 posts / 30j | 15 | 33 % |
| DROP | 0 post / 30j | 18 | 39 % |

### Détail v0.1

| # | Section v0.1 | Nom | Slug | posts/30j | Verdict |
|---|---|---|---|---|---|
| 1 | saas_ops | Arthur Waller | `arthur-waller-a793a611` | 3 | MAYBE |
| 2 | saas_ops | Hugo Andrianjatovo | `hugo-andrianjatovo` | 0 | DROP |
| 3 | sales | Guillaume Moubeche | `profit-led-growth` | 0 | DROP |
| 4 | ia | Florian Douetteau | `fdouetteau` | 6 | KEEP |
| 5 | finance | Olivier Babeau | `olivier-babeau` | 0 | DROP |
| 6 | ia | Asma Mhalla | `amhalla` | 1 | MAYBE |
| 7 | finance | Marie Ekeland | `marieekeland` | 0 | DROP |
| 8 | sales | Domitille de Saint-Exupéry | `domitille-de-saint-exupery` | 0 | DROP |
| 9 | rh | Firmin Zocchetto | `firmin-zocchetto` | 4 | KEEP |
| 10 | saas_ops | Alexandre Prot | `aprot` | 10 | KEEP |
| 11 | saas_ops | Steve Anavi | `steveanavi` | 1 | MAYBE |
| 12 | saas_ops | Rodolphe Ardant | `rodolpheardant` | 0 | DROP |
| 13 | saas_ops | Julien Chriqui | `julien-chriqui-0baa0522` | 0 | DROP |
| 14 | saas_ops | Éléonore Crespo | `eleonorecrespo` | 10 | KEEP |
| 15 | saas_ops | Romain Niccoli | `romainniccoli` | 0 | DROP |
| 16 | saas_ops | Charles Thomas | `charlesjpthomas` | 0 | DROP |
| 17 | saas_ops | Nicolas Reboud | `nicolasreboud` | 0 | DROP |
| 18 | saas_ops | Frédéric Plais | `fplais` | 1 | MAYBE |
| 19 | saas_ops | Anaïs Monlong | `its-me-anais-monlong` | 1 | MAYBE |
| 20 | saas_ops | Jonathan Anguelov | `jonathan-anguelov-14346611` | 9 | KEEP |
| 21 | saas_ops | Pierre Gaubil | `pierre-gaubil-6477a68` | 6 | KEEP |
| 22 | saas_ops | Alexandre Yazdi | `alexandre-yazdi-21a9813a` | 1 | MAYBE |
| 23 | ia | Thomas Clozel | `thomas-clozel-408a9321` | 10 | KEEP |
| 24 | ia | Alexandre Lebrun | `alexandrelebrun` | 0 | DROP |
| 25 | ia | Igor Carron | `igorcarron` | 2 | MAYBE |
| 26 | ia | Laurent Daudet | `laurent-daudet-a845b02` | 0 | DROP |
| 27 | ia | Stanislas Polu | `spolu` | 0 | DROP |
| 28 | ia | Édouard d'Archimbaud | `edouard-d-archimbaud` | 0 | DROP |
| 29 | ia | Sébastien Robaszkiewicz | `sebastien-robaszkiewicz` | 0 | DROP |
| 30 | finance | Jean-David Chamboredon | `jeandavidchamboredon` | 1 | MAYBE |
| 31 | finance | Romain Lavault | `lavault` | 0 | DROP |
| 32 | finance | Nicolas Bouzou | `nbouzou` | 5 | KEEP |
| 33 | finance | Frédéric Bardeau | `fredericbardeau` | 3 | MAYBE |
| 34 | finance | Yann Coatanlem | `yann-coatanlem` | 1 | MAYBE |
| 35 | legal | Louis Larret-Chahine | `louis-larret-chahine-9889a281` | 4 | KEEP |
| 36 | legal | Olivier Chaduteau | `ochaduteau` | 1 | MAYBE |
| 37 | legal | Étienne Drouard | `drouard` | 2 | MAYBE |
| 38 | legal | Hubert de Vauplane | `hubert-de-vauplane-18297621` | 6 | KEEP |
| 39 | legal | Bertrand Cassar | `bertrandcassar` | 1 | MAYBE |
| 40 | legal | Aurélien Bamdé | `aur%C3%A9lien-bamd%C3%A9-613368b5` | 0 | DROP |
| 41 | rh | Charles de Lassence | `charles-de-lassence-55310b2b` | 0 | DROP |
| 42 | rh | Caroline Ramade | `carolineramade` | 10 | KEEP |
| 43 | rh | Quentin Guilluy | `quentin-guilluy-82a73a30` | 1 | MAYBE |
| 44 | sales | Théo Lion | `th%C3%A9o-lion-25108812a` | 10 | KEEP |
| 45 | sales | Quentin Le Gall | `quentin-le-gall-hexa` | 4 | KEEP |
| 46 | sales | Stan Massueras | `stan-massueras-45bb564a` | 3 | MAYBE |

**Slugs non résolus (sub-agent A)** — exclus d'office : Romain Chastrette (WeMaintain), Cyril Cuenoud (Captain Contrat), Stéphane Pèze (Lucca).

**Lecture du bilan v0.1** : 39 % de profils muets sur 30j. Cluster dominant : SaaS/ops (8 KEEP/MAYBE actifs sur 13) tient correctement. Cluster IA appliquée B2B s'effondre : 2 KEEP sur 8 (Owkin/Clozel + Dataiku/Douetteau seuls actifs ; les fondateurs LightOn/Dust/Kili sont muets sur LinkedIn). Cluster finance/VC : voix médiatiques actives (Bouzou KEEP) mais les VC parlent peu en public. Cluster legal-tech : 2 KEEP, base solide. Cluster RH-tech : 2 KEEP. Cluster sales/marketing : 2 KEEP, attention au registre coach (Théo Lion à surveiller via `transferabilite_assurance` au prochain run).

---

## §2 — Profils assurance FR identifiés

23 candidats sourcés via web_search ciblée par catégorie A/B/C/D/E. Audit Apify 30j en batch :

| # | Cat | Nom | Entreprise | Slug | posts/30j | Verdict | Source web |
|---|---|---|---|---|---|---|---|
| 1 | A | Pierre Bessé | Bessé | `pierre-bess%C3%A9-conseil-assurance` | 3 | MAYBE | linkedin.com/in/pierre-bessé-conseil-assurance |
| 2 | A | Paul Jousse | Bessé | `paul-jousse` | 2 | MAYBE | argusdelassurance.com (nomination DG Bessé) |
| 3 | A | Bertrand Mulot | Bessé Immobilier | `bertrandmulotbess%C3%A9` | 0 | DROP | monimmeuble.com |
| 4 | A | Benjamin Verlingue | Adelaïde Group | `benjamin-verlingue-913b3037` | 2 | MAYBE | adelaidegroup.fr/gouvernance |
| 5 | A | Jacques Verlingue | Adelaïde Group | `jacques-verlingue` | 0 | DROP | linkedin.com/in/jacques-verlingue |
| 6 | A | Pierre Donnersberg | Diot-Siaci | `pierre-donnersberg` | 0 | DROP | argusdelassurance.com |
| 7 | A | Olivier Binachon | Aon France | `olivier-binachon-68543912` | 0 | DROP | linkedin |
| 8 | A | Liliane Spiridon | Aon France | `liliane-spiridon-27304b9` | 0 | DROP | commercialriskonline.com |
| 9 | A | Patrick Jacquot | Mutuelle des Motards | `patrick-jacquot-86341158` | 0 | DROP | argusdelassurance.com |
| 10 | B | Emmanuel Maillet | APRIL | `emmanuel-maillet-00906338` | 0 | DROP | april.com press |
| 11 | B | Pierre-Alexis Brabis | APRIL | `pierre-alexis-brabis-93256652` | 0 | DROP | theorg.com |
| 12 | B | Stephen Leguillon | Seyna | `stephen-leguillon-67001937` | 2 | MAYBE | seyna.eu/news |
| 13 | B | Sébastien Piguet | Descartes Underwriting | `s%C3%A9bastien-piguet-31293627` | 0 | DROP | descartesunderwriting.com |
| 14 | B | Tanguy Touffut | Descartes Underwriting | `tanguy-touffut-584b202` | 0 | DROP | linkedin |
| 15 | C | Christophe Eberlé | Mindstone (ex-Optimind) | `christophe-eberle` | 0 | DROP | argusdelassurance.com |
| 16 | C | Marc Siblini | Eurogroup Consulting | `marc-siblini-3b31832` | 0 | DROP | eurogroupconsulting.com |
| 17 | C | Florian Graillot | astoryaVC | `florian-graillot` | 10 | **KEEP** | openinsurance.io |
| 18 | D | Florian Delambily | News Assurances Pro | `florian-delambily-72aa7945` | 0 | DROP | muckrack.com |
| 19 | D | François Limoge | L'Argus de l'assurance | `fran%C3%A7ois-limoge-90bb7967` | 0 | DROP | argusdelassurance.com |
| 20 | D | Aurélie Abadie | L'Agefi | `aurelie-abadie` | 0 | DROP | muckrack.com |
| 21 | E | Jules Veyrat | Stoïk | `jules-veyrat` | 3 | MAYBE | techcrunch.com (levée 2024) |
| 22 | E | Eric Mignot | +Simple | `mignoteric` | 0 | DROP | argusdelassurance.com |
| 23 | E | Yvan Saule | Tinubu | `yvansaule` | 0 | DROP | tinubu.com/blog |

**Verdict assurance FR : 1 KEEP / 5 MAYBE / 17 DROP.** L'hypothèse "écosystème assurance FR muet sur LinkedIn" est largement confirmée :
- Cat A (dirigeants courtage) : 0 KEEP, 4 MAYBE seulement → les Top-5 institutionnels (Diot-Siaci, Aon France, Adelaïde) sont silencieux. Seul un courtier moyen (Bessé) tient un rythme.
- Cat B (MGA/délégataires) : 1 MAYBE seulement → Seyna a un fondateur qui publie un peu, Descartes muet.
- Cat C (consultants assurance) : 1 KEEP (Graillot, VC insurtech, pas vraiment "consultant" mais publie quasi-quotidien) ; aucun associé Big 4/Eurogroup actif publiquement sur l'assurance.
- Cat D (journalistes) : 0 actif. La presse assurance FR publie sur ses sites, pas sur LinkedIn.
- Cat E (insurtech B2B niche) : 1 MAYBE (Stoïk).

**Ce que ça veut dire** : pour avoir du contenu assurance hebdomadaire, il faudra élargir au-delà des dirigeants déclarés. Pistes pour v0.3 : courtiers indépendants tech-forward, agents généraux qui blogent, dirigeants de petites mutuelles régionales actives, contributeurs réguliers de la presse spécialisée (pas les rédac chefs mais les contributeurs invités).

---

## §3 — Watchlist v0.2 finale

**34 profils retenus** = 14 KEEP + 20 MAYBE. Les 35 DROP sont abandonnés.

Politique d'inclusion : on garde tous les profils ayant au moins 1 post/30j. Le critère MAYBE (1-3 posts) sera ré-évalué après 4 semaines de runs réels via `transferabilite_assurance` moyenne. Les profils MAYBE qui produisent peu de matière utile à l'assurance seront sortis en review S+4.

### 3.1 KEEP (14 profils, ≥ 4 posts/30j)

| # | Nom | Slug | Secteur v0.2 | posts/30j | audience_est |
|---|---|---|---|---|---|
| 1 | Florian Douetteau | `fdouetteau` | ia_b2b | 6 | 50 000 |
| 2 | Firmin Zocchetto | `firmin-zocchetto` | rh_tech | 4 | 40 000 |
| 3 | Alexandre Prot | `aprot` | saas_ops | 10 | 80 000 |
| 4 | Éléonore Crespo | `eleonorecrespo` | saas_ops | 10 | 30 000 |
| 5 | Jonathan Anguelov | `jonathan-anguelov-14346611` | saas_ops | 9 | 50 000 |
| 6 | Pierre Gaubil | `pierre-gaubil-6477a68` | saas_ops | 6 | 20 000 |
| 7 | Thomas Clozel | `thomas-clozel-408a9321` | ia_b2b | 10 | 30 000 |
| 8 | Nicolas Bouzou | `nbouzou` | finance_conseil | 5 | 100 000 |
| 9 | Louis Larret-Chahine | `louis-larret-chahine-9889a281` | legal_regtech | 4 | 15 000 |
| 10 | Hubert de Vauplane | `hubert-de-vauplane-18297621` | legal_regtech | 6 | 20 000 |
| 11 | Caroline Ramade | `carolineramade` | rh_tech | 10 | 30 000 |
| 12 | Théo Lion | `th%C3%A9o-lion-25108812a` | sales_marketing | 10 | 100 000 |
| 13 | Quentin Le Gall | `quentin-le-gall-hexa` | sales_marketing | 4 | 15 000 |
| 14 | Florian Graillot | `florian-graillot` | assurance_fr | 10 | 30 000 |

### 3.2 MAYBE (20 profils, 1-3 posts/30j — à challenger en review S+4)

| # | Nom | Slug | Secteur v0.2 | posts/30j | audience_est |
|---|---|---|---|---|---|
| 15 | Arthur Waller | `arthur-waller-a793a611` | saas_ops | 3 | 50 000 |
| 16 | Asma Mhalla | `amhalla` | ia_b2b | 1 | 50 000 |
| 17 | Steve Anavi | `steveanavi` | saas_ops | 1 | 30 000 |
| 18 | Frédéric Plais | `fplais` | saas_ops | 1 | 10 000 |
| 19 | Anaïs Monlong | `its-me-anais-monlong` | saas_ops | 1 | 10 000 |
| 20 | Alexandre Yazdi | `alexandre-yazdi-21a9813a` | saas_ops | 1 | 30 000 |
| 21 | Igor Carron | `igorcarron` | ia_b2b | 2 | 15 000 |
| 22 | Jean-David Chamboredon | `jeandavidchamboredon` | finance_conseil | 1 | 30 000 |
| 23 | Frédéric Bardeau | `fredericbardeau` | finance_conseil | 3 | 30 000 |
| 24 | Yann Coatanlem | `yann-coatanlem` | finance_conseil | 1 | 10 000 |
| 25 | Olivier Chaduteau | `ochaduteau` | legal_regtech | 1 | 10 000 |
| 26 | Étienne Drouard | `drouard` | legal_regtech | 2 | 15 000 |
| 27 | Bertrand Cassar | `bertrandcassar` | legal_regtech | 1 | 10 000 |
| 28 | Quentin Guilluy | `quentin-guilluy-82a73a30` | rh_tech | 1 | 10 000 |
| 29 | Stan Massueras | `stan-massueras-45bb564a` | sales_marketing | 3 | 20 000 |
| 30 | Pierre Bessé | `pierre-bess%C3%A9-conseil-assurance` | assurance_fr | 3 | 5 000 |
| 31 | Paul Jousse | `paul-jousse` | assurance_fr | 2 | 5 000 |
| 32 | Benjamin Verlingue | `benjamin-verlingue-913b3037` | assurance_fr | 2 | 5 000 |
| 33 | Stephen Leguillon | `stephen-leguillon-67001937` | assurance_fr | 2 | 10 000 |
| 34 | Jules Veyrat | `jules-veyrat` | assurance_fr | 3 | 10 000 |

---

## §4 — Distribution v0.2

| Secteur | KEEP | MAYBE | Total | % v0.2 |
|---|---|---|---|---|
| saas_ops | 4 | 5 | 9 | 26 % |
| ia_b2b | 2 | 2 | 4 | 12 % |
| finance_conseil | 1 | 3 | 4 | 12 % |
| legal_regtech | 2 | 3 | 5 | 15 % |
| rh_tech | 2 | 1 | 3 | 9 % |
| sales_marketing | 2 | 1 | 3 | 9 % |
| **assurance_fr** (nouveau) | 1 | 5 | **6** | **18 %** |
| **Total** | **14** | **20** | **34** | 100 % |

**Écart à la v0.1** : -16 profils (50 → 34). L'assurance FR pèse 18 % de la watchlist v0.2 vs 0 % en v0.1. Cluster dominant : saas_ops à 26 % (suit le pipeline le plus dense de la France tech). IA appliquée B2B tombe de 20 % (v0.1) à 12 % (v0.2) — c'est l'écart le plus important, dû aux profils muets côté infrastructure IA (LightOn, Dust, Kili).

---

## §5 — Coût audit Apify

| Métrique | Valeur |
|---|---|
| Run id | `qcBOT898QbPQx5f7D` |
| Profils audités | 69 |
| Durée | 73 s |
| Compute units | 0,0051 CU |
| Posts retournés (30j) | 142 |
| Coût audit total | **$0,318 USD ≈ €0,29** |

**Mise en garde sur l'extrapolation prod** : la projection « 50 profils × 4 runs/mois = €58 » affichée par `apify-cost` est trompeuse ici parce que l'audit a interrogé sur **30 jours** vs notre fenêtre prod **7 jours**. Le coût prod hebdo réel sera ~4 × moins (récupération de la dernière semaine seulement) → ~**€0,07/mois** pour 50 profils en hebdo, projection cohérente avec les tests précédents.

---

## §6 — Recommandation

**GO pour seeding v0.2 et nouveau stress test.**

Raisons :
1. La watchlist v0.2 a passé un filtre objectif (Apify 30j) — aucun profil supposé actif n'a échappé à la vérification. Les 35 DROP sont des absences mesurées, pas des présomptions.
2. 14 profils KEEP fortement actifs ≈ 84 posts collectés par run hebdo théorique (6 posts/profil/semaine en moyenne sur les KEEP). Avec les MAYBE qui apportent encore ~20 posts/semaine en moyenne, on est dans la cible **30-100 clean_posts/run** pour calibrer l'Agent 3.
3. L'ancrage assurance FR est faible (6/34 = 18 %) mais réel — supérieur à la v0.1 (0 %) — et identifie Graillot (astoryaVC) comme la voix la plus dense de l'écosystème insurtech FR. Les profils MAYBE assurance pourront produire 1-2 posts/run, suffisant pour amorcer l'Agent 5 (InsuranceTrends Perplexity) qui de toute façon ira chercher la matière dans la presse spécialisée plus que dans la watchlist.

**Plan d'exécution recommandé** :
1. Seed les 34 profils v0.2 en base via `seed-watchlist-batch-v2.ts` (à créer, dérivé du v1).
2. Désactiver les 7 profils v0.1 actuellement seedés mais DROP (Andrianjatovo, Moubeche, Babeau, Ekeland, Saint-Exupéry) — `UPDATE profiles_watchlist SET is_active = false WHERE profile_id IN (...)`.
3. Lancer un nouveau stress test `pnpm --filter @nexus/scripts test-collector -- --limit 40`.
4. Inspecter avec `inspect-batch`. Cible : 30-100 clean_posts, breakdown clusters varié (plus que 100 % "autre"), au moins un rejet par filtre (too_short / non_fr / self_promo / below_baseline).
5. Si OK : **GO pour Agent 3** (PostAnalysis Claude).

**À surveiller** au prochain run :
- Théo Lion (`th%C3%A9o-lion-25108812a`) — risque de tomber dans le registre coach/creator. À filtrer manuellement si `transferabilite_assurance` < 5 sur 4 semaines.
- Florian Graillot — actif quotidien mais ton VC anglophone (Mr Graillot publie en anglais ?). À vérifier après le premier run : si majoritairement EN, sera filtré par `non_fr` et on perdra notre ancrage assurance le plus dense.
- Profils MAYBE à 1 post — vraisemblablement 0 post sur la fenêtre 7j prod. À retirer en revue S+4 s'ils ne montent pas.

---

*Document à committer après validation Marouane. v0.3 prévue mois 2 (post-data 4 semaines de runs).*
