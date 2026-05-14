# Watchlist Nexus Editorial — v0.3

> Produite le 2026-05-14 après audit langue strict (franc-min sur posts collectés 30j).
> Remplace `watchlist_v0.2.md`. Cible : 30-40 profils FR-actifs.
> Verdict langue par profil :
>   - **FR_PURE** : ≥ 80 % FR sur ≥ 3 posts
>   - **FR_MAJORITAIRE** : 50-80 % FR
>   - **EN_DOMINANT** : < 20 % FR (à exclure)
>   - **INACTIVE** : 0 post 30j (à exclure)

---

## §1 — Drops de la v0.2 (6 profils anglophones soft-deleted)

Suite au stress test v0.2 du 2026-05-14, 6 profils ont confirmé publier majoritairement en anglais. Soft-delete via `UPDATE is_active = false`. Notes annotées `[DEACTIVATED 2026-05-14: anglophone confirmé via stress test v0.2.]` pour traçabilité.

| # | Nom | Slug | Stress test v0.2 | Décision |
|---|---|---|---|---|
| 1 | Florian Graillot | `florian-graillot` | 4/4 EN (InsurTech US/UK audience) | **DROP** |
| 2 | Alexandre Prot | `aprot` | 3/3 EN | **DROP** |
| 3 | Éléonore Crespo | `eleonorecrespo` | 3/3 EN | **DROP** |
| 4 | Thomas Clozel | `thomas-clozel-408a9321` | 8/8 EN | **DROP** |
| 5 | Pierre Gaubil | `pierre-gaubil-6477a68` | 5/5 EN | **DROP** |
| 6 | Florian Douetteau | `fdouetteau` | 2/2 EN | **DROP** |

**Perte qualitative** : on perd Graillot, seule voix insurtech FR dense. Ses signaux pourront être réintégrés en input manuel pour Agent 5 (Insurance Trends).

---

## §2 — V0.2 MAYBE rechecks (audit langue 9 profils)

| # | Nom | Slug | posts/30j | FR/EN | Verdict | Action |
|---|---|---|---|---|---|---|
| 1 | Asma Mhalla | `amhalla` | 1 | 1/0 | FR_MAJORITAIRE | KEEP |
| 2 | Nicolas Bouzou | `nbouzou` | 5 | 5/0 | **FR_PURE** | KEEP |
| 3 | Olivier Babeau | `olivier-babeau` | 0 | 0/0 | INACTIVE | (déjà désactivé v0.1) |
| 4 | Théo Lion | `théo-lion-25108812a` | 10 | 10/0 | **FR_PURE** | KEEP |
| 5 | Quentin Guilluy | `quentin-guilluy-82a73a30` | 1 | 1/0 | FR_MAJORITAIRE | KEEP |
| 6 | Caroline Ramade | `carolineramade` | 10 | 10/0 | **FR_PURE** | KEEP |
| 7 | Benjamin Verlingue (assurance) | `benjamin-verlingue-913b3037` | 2 | 1/1 | FR_MAJORITAIRE | KEEP |
| 8 | Jonathan Anguelov | `jonathan-anguelov-14346611` | 9 | 9/0 | **FR_PURE** | KEEP |
| 9 | Marie Ekeland | `marieekeland` | 0 | 0/0 | INACTIVE | (déjà désactivée v0.1) |

**7/9 confirmés FR actifs** (4 FR_PURE + 3 FR_MAJORITAIRE). Aucune promotion KEEP→MAYBE ni dégradement nécessaires.

---

## §3 — Nouveaux profils v0.3 (par catégorie)

31 candidats audités (12 cat A + 6 cat B + 8 cat C + 5 cat D). **6 retenus** (FR_PURE ou FR_MAJORITAIRE).

### Cat A — Operators FR de SaaS B2B (2/12 retenus)

| # | Nom | Rôle | Slug | posts/30j | FR/EN | Verdict |
|---|---|---|---|---|---|---|
| 1 | Jérémy Goillot | Head of Growth Swan (ex-Spendesk) | `jeremygoillot` | 10 | 10/0 | **FR_PURE** ✓ |
| 2 | Julie Touyarot | VP Growth & Marketing Doctolib | `julietouyarot` | 2 | 1/1 | FR_MAJORITAIRE ✓ |

**10/12 perdus** dont 9 INACTIVE et 1 EN_DOMINANT (Alexis Merelle, Lengow).

### Cat B — Consultants PME FR (0/6 retenus)

| # | Nom | Cabinet | Slug | posts/30j | Verdict |
|---|---|---|---|---|---|
| — | Jean-François Bertrand | Cylad | `jfrancoisbertrand` | 0 | INACTIVE |
| — | Thierry Auzias | Julhiet Sterwen | `thierry-auzias-34906820` | 0 | INACTIVE |
| — | David Layani | Onepoint | `dlayani` | 0 | INACTIVE |
| — | Rupert Schiessl | Verteego | `schiessl` | 0 | INACTIVE |
| — | Pierre Arnaud | Mews Partners | `pierrearnaudlinkedin` | 0 | INACTIVE |
| — | Stéphane Gorce | Eurogroup Consulting | `stephane-gorce` | 0 | INACTIVE |

**6/6 INACTIVE.** Constat fort : aucun consultant senior FR de cabinet PME-ETI n'a publié de post LinkedIn sur 30j parmi les candidats sourcés. À considérer comme un gisement vide pour la stratégie watchlist.

### Cat C — Top Voices France 2026 (2/8 retenus)

| # | Nom | Rôle | Slug | posts/30j | FR/EN | Verdict |
|---|---|---|---|---|---|---|
| 3 | Olivier Gavalda | CEO Crédit Agricole SA | `olivier-gavalda` | 3 | 3/0 | **FR_PURE** ✓ |
| 4 | Caroline Mignaux | Marketing B2B (150k followers) | `caroline-mignaux` | 10 | 10/0 | **FR_PURE** ✓ |
| — | Aiman Ezzat | CEO Capgemini | `aiman-ezzat` | 9 | 0/9 | EN_DOMINANT |
| — | Thierry Delaporte | CEO Sodexo | `thierry-delaporte` | 2 | 0/2 | EN_DOMINANT |
| — | François Provost | CEO Renault | `francois-provost` | 0 | — | INACTIVE |
| — | Valérie Baudson | CEO Amundi | `valerie-baudson` | 0 | — | INACTIVE |
| — | Philippe Corrot | CEO Mirakl | `philippecorrot` | 0 | — | INACTIVE |
| — | Corine de Bilbao | CVP Microsoft France | `corinedebilbao` | 0 | — | INACTIVE |

Note : les CEO grands groupes Top Voice qui sont actifs publient en EN (Capgemini, Sodexo). Ceux qui sont silencieux le restent. Les 2 retenus (Gavalda banque FR, Mignaux marketing FR pure) sont des exceptions.

### Cat D — Contributeurs presse B2B (2/5 retenus)

| # | Nom | Média | Slug | posts/30j | FR/EN | Verdict |
|---|---|---|---|---|---|---|
| 5 | Sophie Levy Ayoun | Maddyness | `sophie-levy-ayoun` | 1 | 1/0 | FR_MAJORITAIRE ✓ |
| 6 | Célia Séramour | L'Usine Digitale | `celia-seramour` | 3 | 3/0 | **FR_PURE** ✓ |
| — | Daphné Leprince-Ringuet | Sifted Paris | `daphne-leprince-ringuet` | 10 | 0/10 | EN_DOMINANT |
| — | Yoann Bourgin | L'Usine Digitale | `yoannbourgin` | 0 | — | INACTIVE |
| — | Alice Vitard | L'Usine Digitale | `alice-vitard` | 0 | — | INACTIVE |

Note : Sifted Paris correspond publie en anglais (média anglophone européen). Seuls les journalistes Usine Digitale FR pure passent.

---

## §4 — Watchlist v0.3 consolidée

**34 profils** = 28 v0.2 actifs + 6 nouveaux v0.3 (FR confirmé).

| # | Nom | Slug | Secteur | Langue | Source / Niveau |
|---|---|---|---|---|---|
| 1 | Arthur Waller | `arthur-waller-a793a611` | saas_ops | FR (smoke test conf.) | v0.2 MAYBE |
| 2 | Firmin Zocchetto | `firmin-zocchetto` | rh_tech | FR (smoke test conf.) | v0.2 KEEP |
| 3 | Jonathan Anguelov | `jonathan-anguelov-14346611` | saas_ops | **FR_PURE audit** | v0.2 KEEP |
| 4 | Nicolas Bouzou | `nbouzou` | finance_conseil | **FR_PURE audit** | v0.2 KEEP |
| 5 | Louis Larret-Chahine | `louis-larret-chahine-9889a281` | legal_regtech | FR présumé (legal-tech FR) | v0.2 KEEP non audité |
| 6 | Hubert de Vauplane | `hubert-de-vauplane-18297621` | legal_regtech | FR présumé | v0.2 KEEP non audité |
| 7 | Caroline Ramade | `carolineramade` | rh_tech | **FR_PURE audit** | v0.2 KEEP |
| 8 | Théo Lion | `théo-lion-25108812a` | sales_marketing | **FR_PURE audit** | v0.2 KEEP |
| 9 | Quentin Le Gall | `quentin-le-gall-hexa` | sales_marketing | FR présumé | v0.2 KEEP non audité |
| 10 | Asma Mhalla | `amhalla` | ia_b2b | FR_MAJORITAIRE | v0.2 MAYBE |
| 11 | Steve Anavi | `steveanavi` | saas_ops | FR présumé | v0.2 MAYBE non audité |
| 12 | Frédéric Plais | `fplais` | saas_ops | FR présumé | v0.2 MAYBE non audité |
| 13 | Anaïs Monlong | `its-me-anais-monlong` | saas_ops | FR présumé | v0.2 MAYBE non audité |
| 14 | Alexandre Yazdi | `alexandre-yazdi-21a9813a` | saas_ops | FR présumé | v0.2 MAYBE non audité |
| 15 | Igor Carron | `igorcarron` | ia_b2b | FR présumé | v0.2 MAYBE non audité |
| 16 | Jean-David Chamboredon | `jeandavidchamboredon` | finance_conseil | FR présumé | v0.2 MAYBE non audité |
| 17 | Frédéric Bardeau | `fredericbardeau` | finance_conseil | FR (smoke test) | v0.2 MAYBE |
| 18 | Yann Coatanlem | `yann-coatanlem` | finance_conseil | FR présumé | v0.2 MAYBE non audité |
| 19 | Olivier Chaduteau | `ochaduteau` | legal_regtech | FR présumé | v0.2 MAYBE non audité |
| 20 | Étienne Drouard | `drouard` | legal_regtech | FR présumé | v0.2 MAYBE non audité |
| 21 | Bertrand Cassar | `bertrandcassar` | legal_regtech | FR présumé | v0.2 MAYBE non audité |
| 22 | Quentin Guilluy | `quentin-guilluy-82a73a30` | rh_tech | FR_MAJORITAIRE | v0.2 MAYBE |
| 23 | Stan Massueras | `stan-massueras-45bb564a` | sales_marketing | FR présumé | v0.2 MAYBE non audité |
| 24 | Pierre Bessé (**assurance**) | `pierre-bessé-conseil-assurance` | assurance_fr | FR présumé | v0.2 MAYBE non audité |
| 25 | Paul Jousse (**assurance**) | `paul-jousse` | assurance_fr | FR présumé | v0.2 MAYBE non audité |
| 26 | Benjamin Verlingue (**assurance**) | `benjamin-verlingue-913b3037` | assurance_fr | FR_MAJORITAIRE | v0.2 MAYBE |
| 27 | Stephen Leguillon (**assurance**) | `stephen-leguillon-67001937` | assurance_fr | FR présumé | v0.2 MAYBE non audité |
| 28 | Jules Veyrat (**assurance**) | `jules-veyrat` | assurance_fr | FR présumé | v0.2 MAYBE non audité |
| 29 | Jérémy Goillot | `jeremygoillot` | saas_ops | **FR_PURE audit** | **v0.3 NEW (Cat A)** |
| 30 | Julie Touyarot | `julietouyarot` | saas_ops | FR_MAJORITAIRE | **v0.3 NEW (Cat A)** |
| 31 | Olivier Gavalda | `olivier-gavalda` | finance_conseil | **FR_PURE audit** | **v0.3 NEW (Cat C)** |
| 32 | Caroline Mignaux | `caroline-mignaux` | sales_marketing | **FR_PURE audit** | **v0.3 NEW (Cat C)** |
| 33 | Sophie Levy Ayoun | `sophie-levy-ayoun` | presse_b2b | FR_MAJORITAIRE | **v0.3 NEW (Cat D)** |
| 34 | Célia Séramour | `celia-seramour` | presse_b2b | **FR_PURE audit** | **v0.3 NEW (Cat D)** |

**Confidence langue : 13 profils sur 34 confirmés FR (38 %)**. 21 profils v0.2 actifs présumés FR sans audit langue strict — ils seront filtrés au prochain stress test si EN. Risque résiduel acceptable car le pipeline filtre.

---

## §5 — Distribution finale par secteur

| Secteur | Compte | % |
|---|---|---|
| saas_ops | 9 | 26 % |
| ia_b2b | 2 | 6 % |
| finance_conseil | 5 | 15 % |
| legal_regtech | 5 | 15 % |
| rh_tech | 3 | 9 % |
| sales_marketing | 4 | 12 % |
| **assurance_fr** | **5** | **15 %** |
| **presse_b2b** (nouveau) | **2** | **6 %** |
| **Total** | **35** | 100 % |

Note distribution : assurance_fr reste à 5 profils (Bessé, Jousse, Verlingue, Leguillon, Veyrat — Graillot drop), c'est 15 % de la v0.3. Cluster `ia_b2b` s'effondre à 2 (Mhalla + Carron) après le drop de Douetteau et Clozel. Nouveau secteur `presse_b2b` ajouté pour les 2 journalistes USB.

---

## §6 — Coût audit langue cumulé

| Run | Profils | CU | Coût USD | Coût EUR |
|---|---|---|---|---|
| Audit batch v0.1 (69 profils, fenêtre 30j) — du 2026-05-13 | 69 | 0,005 | $0,32 | €0,29 |
| Audit langue v0.3 batch 1 (20 profils) | 20 | 0,0015 | $0,07 | €0,06 |
| Audit langue v0.3 batch 2 (20 profils) | 20 | 0,0035 | $0,13 | €0,12 |
| Stress test v0.2 (34 profils, fenêtre 7j) | 34 | 0,003 | $0,10 | €0,09 |
| Sous-total audits diagnostic | — | — | $0,62 | **€0,56** |

Budget < €1 du brief ✓ (€0,56 cumulé).

---

## §7 — Suite

Stress test v0.3 lancé en parallèle de la finalisation de ce document. Critères GO Agent 3 :
- clean_posts ≥ 30
- ≥ 2 clusters métiers alimentés
- ≥ 3 filtres déclenchés
- DLQ = 0
- Coût Apify < €0,30

Si NO-GO, prochaine itération v0.4 viserait à élargir la category "presse B2B" et compléter la category "assurance courtage régional" — les deux gisements restants prouvés FR.

---

*Document à committer git. Itération v0.4 à prévoir uniquement si stress test v0.3 montre une qualité insuffisante.*
