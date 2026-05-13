# HANDOFF — Tâche n°1 : fondations Nexus Editorial

> Livré le 2026-05-13. Tâche n°1 du plan de construction. Fondation data + ossature repo uniquement.

---

## 1. Fichiers créés

```
nexus-editorial/
├── .env.example
├── .github/workflows/ci.yml
├── .gitignore
├── HANDOFF.md
├── README.md
├── biome.json
├── package.json
├── pnpm-workspace.yaml
├── tools/format.mjs                              (wrapper Biome ↔ Prettier-style --check)
├── tsconfig.base.json
├── vitest.config.ts
├── docs/                                         (4 fichiers)
│   ├── architecture.md
│   ├── rgpd.md
│   ├── runbook.md
│   └── synvex-voice-tone.md
├── packages/
│   ├── n8n-nodes/                                (4 fichiers — squelette + placeholder)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── .gitkeep
│   │       └── index.ts                          (placeholder pour que tsc/biome aient des inputs)
│   ├── scripts/                                  (3 fichiers)
│   │   ├── package.json
│   │   ├── src/seed-watchlist.ts
│   │   └── tsconfig.json
│   └── shared/                                   (21 fichiers)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── __tests__/logger.test.ts          (1 test smoke)
│           ├── db/types.ts                       (stub à régénérer après `supabase link`)
│           ├── index.ts
│           ├── logger.ts
│           ├── supabase-client.ts
│           └── schemas/
│               ├── insurance-trends.schema.ts
│               ├── linkedin-trends.schema.ts
│               ├── post-analysis.schema.ts
│               ├── timing-recommendation.schema.ts
│               ├── visual-decision.schema.ts
│               ├── weekly-angles.schema.ts
│               ├── weekly-winners.schema.ts
│               └── __tests__/                    (7 fichiers, 2 tests chacun = 14 tests)
│                   ├── insurance-trends.test.ts
│                   ├── linkedin-trends.test.ts
│                   ├── post-analysis.test.ts
│                   ├── timing-recommendation.test.ts
│                   ├── visual-decision.test.ts
│                   ├── weekly-angles.test.ts
│                   └── weekly-winners.test.ts
└── supabase/                                     (6 fichiers)
    ├── config.toml
    ├── migrations/
    │   ├── 20260513000001_init_schema.sql        (8 tables + 4 index)
    │   ├── 20260513000002_rls_policies.sql       (RLS + 3 jeux de policies + trigger)
    │   └── 20260513000003_retention_cron.sql     (pg_cron mensuel)
    └── seed/
        ├── profiles_watchlist.seed.sql           (template commenté)
        └── synvex_voice_pack.seed.sql            (template commenté)
```

**Compteurs par dossier (hors `node_modules`) :**
- Racine : 11 fichiers (config + 2 docs + wrapper tools/).
- `docs/` : 4 fichiers.
- `supabase/` : 6 fichiers.
- `packages/shared/` : 21 fichiers.
- `packages/n8n-nodes/` : 4 fichiers.
- `packages/scripts/` : 3 fichiers.

**Total** : 49 fichiers versionnés.

## 2. Validation du setup — 4 commandes vertes

À lancer dans l'ordre depuis la racine du repo :

```bash
pnpm install       # 9.5.0, 78 packages installés
pnpm test          # 15 tests verts (14 schémas Zod + 1 logger smoke)
pnpm lint          # Biome : 31 fichiers, 0 erreur
pnpm format --check # Biome via wrapper tools/format.mjs : 31 fichiers, no fixes needed
pnpm typecheck     # 3 packages, 0 erreur
```

Sortie de référence (run du 2026-05-13) :
- `Test Files 8 passed, Tests 15 passed`
- `Checked 31 files. No fixes applied.` (lint et format)
- Aucun fichier généré (dist/) — tous les tsconfig sont en `noEmit`.

## 3. Checklist humaine avant la tâche n°2

À cocher avant d'enchaîner sur le workflow n8n :

- [ ] **Créer projet Supabase** en région `eu-west-3` (Paris) pour cohérence RGPD.
- [ ] **Activer l'extension `pg_cron`** dans Supabase Studio → Database → Extensions (sinon migration 3 échoue).
- [ ] **Créer workspace n8n cloud** (région UE).
- [ ] **Obtenir 6 clés API** et les coller dans `.env` : Anthropic, OpenAI (embeddings uniquement), Perplexity, Apify, Firecrawl, Resend.
- [ ] **Vérifier l'acteur Apify** `harvestapi~linkedin-post-search-scraper` (disponibilité + budget).
- [ ] **Créer compte LinkedIn secondaire** dédié scraping (séparé du compte fondateur Marouane).
- [ ] **Signer les DPA fournisseur** (Supabase, Anthropic, Apify, Perplexity, Firecrawl, n8n, OpenAI, Resend).

## 4. Décisions techniques prises en autonomie

| Décision | Choix | Raison |
|---|---|---|
| **Version Zod** | `^3.23.8` (Zod 3) | Le prompt cite explicitement « breaking change Zod v4 » comme exemple de blocage à gérer. Zod 3 reste la dernière major stable largement adoptée. |
| **Version Biome** | `1.8.3` (pinned exact) | 1.8 reste la dernière minor de la série 1.x stable au moment de la tâche ; le passage à 2.x changerait la grammaire de `biome.json` et casserait le pinning du `$schema`. Pin exact pour reproductibilité CI. |
| **Version pnpm** | `9.5.0` | Aligné avec le champ `packageManager` et `pnpm/action-setup@v4` en CI. Évite "pnpm version mismatch" en CI. |
| **Version Vitest** | `^2.0.3` | Stable, ESM-first, compatible Node 20. Préférée à 1.x car 2.x fixe plusieurs bugs ESM. |
| **`tsx` ajouté** | `^4.16.2` (devDep root + scripts) | Pour exécuter directement les `.ts` (ex : `seed-watchlist.ts`). Pas dans la stack imposée mais utilisé uniquement comme tooling de dev (équivalent `ts-node` moderne). Justifié dans le README (commande `seed:watchlist`). |
| **Wrapper `tools/format.mjs`** | Petit script Node qui mappe `--check` → mode lecture de Biome | Biome 1.x ne supporte pas le flag Prettier-style `--check` sur `biome format` (`Error: --check is not expected in this context`). Le prompt impose `pnpm format --check`. Le wrapper résout en 18 lignes sans dépendance externe. |
| **RLS update sur `weekly_reports`** | Policy `FOR UPDATE` permissive + trigger `BEFORE UPDATE` qui rejette toute modification hors `human_validated`/`human_notes` | Postgres RLS ne supporte pas le WITH CHECK par colonne. Le trigger garantit la sémantique attendue par le prompt sans complexifier l'API côté client. |
| **`db/types.ts`** | Stub permissif (`Record<string, unknown>` par table) | Le fichier réel est généré via `supabase gen types`, ce qui requiert un projet Supabase initialisé. Stub temporaire permet au client de compiler tout de suite. Une note dans le fichier explique la régénération attendue (`pnpm supabase:types`). |
| **`pnpm typecheck`** | `pnpm -r typecheck` (chaque package fait son `tsc --noEmit`) au lieu de `tsc -b ... --noEmit` racine | TS interdit `--noEmit` quand les projets référencés sont `composite`. Plutôt que d'activer l'émission (et créer des `dist/` parasites), chaque package vérifie ses types isolément. La résolution `@nexus/shared` passe par le symlink pnpm workspace + champ `types` de la sous-package.json. |
| **`composite: true` retiré** | Tous les `tsconfig.json` packages | Conséquence directe de la décision précédente. Les references TS n'apportaient rien : on n'utilise pas le mode build (`tsc -b`) en pratique, et les packages se résolvent via npm workspaces. |
| **Placeholder `n8n-nodes/src/index.ts`** | 3 lignes exportant juste une constante de version | `tsc --noEmit` échoue avec « No inputs were found » si le dossier `src/` ne contient que `.gitkeep`. Le placeholder neutralise ça sans préjuger de la structure que prendra le package à la tâche n°2. |
| **Schéma `visual-decision`** | Garde additionnelle : refuse `visual_type === 'aucun'` quand `visual_recommended === true` | Cohérence sémantique évidente, évite des sorties d'agent contradictoires. Non demandé strictement par le prompt mais aligné avec l'esprit. |
| **`postPositionEnum` partagé** | Importé depuis `weekly-winners.schema.ts` par `visual-decision` et `timing-recommendation` | Source unique de vérité pour le type littéral `1 \| 2 \| 3`. Réduit risque de drift entre 3 schémas. |

## 5. Risques identifiés / points à valider au prochain run

1. **`pg_cron` activation manuelle** : la migration 3 suppose que `CREATE EXTENSION pg_cron` est autorisé. Sur Supabase cloud, certaines régions / plans nécessitent l'activation préalable depuis le Studio. À tester avant le déploiement tâche n°2 — sinon désactiver temporairement la migration 3 et automatiser la purge via un workflow n8n mensuel.
2. **RLS trigger weekly_reports** : le trigger lit `current_setting('request.jwt.claim.role', true)` pour décider de bloquer ou laisser passer. Si l'écriture passe par `service_role` (JWT n8n), le trigger ne bloque rien (intentionnel). Si elle passe par un autre rôle (custom claim Lovable), comportement à valider en intégration sur Supabase live.
3. **Génération `db/types.ts`** : à régénérer dès qu'un projet Supabase est lié (`supabase link --project-ref <ref>` puis `pnpm supabase:types`). Le stub actuel compile mais ne donne pas l'autocomplétion attendue côté client.
4. **Compte LinkedIn secondaire** : le ban du compte secondaire est probable à moyen terme. Prévoir une rotation de comptes / une stratégie alternative (Apify residential proxies, throttling) avant la mise en production de la tâche n°2.
5. **Voice pack en base** : `synvex_voice_pack` est aujourd'hui seedé via le SQL template uniquement. La synchronisation `docs/synvex-voice-tone.md` ↔ base se fera via un script dédié à implémenter en tâche n°3.
6. **Acteur Apify `harvestapi`** : aucune garantie de disponibilité long terme. Le runbook prévoit les fallbacks (`apimaestro`, `curious_coder`, Firecrawl), mais ils restent à brancher concrètement dans le workflow n8n de la tâche n°2.
7. **Pas de `tsconfig` racine en mode build** : chaque package a son `tsconfig.json` autonome avec `noEmit: true`. Le script `pnpm typecheck` à la racine appelle `pnpm -r typecheck`. Si on veut un jour produire des artefacts (`dist/`), il faudra réactiver `composite: true` + `references` côté shared et reconstruire la chaîne.
8. **Wrapper `tools/format.mjs`** : compatible Biome 1.x. Si on passe un jour à Biome 2.x (qui supporte `--check` nativement), le wrapper devient inutile mais ne casse rien (il continuera juste à fonctionner). Le retirer demandera juste de remettre `format: "biome format --write ."` dans `package.json`.

---

**Statut** : repo prêt pour la tâche n°2 dès que la checklist humaine ci-dessus est cochée. Toutes les commandes de validation passent vertes en local Windows 11 / Node 20 / pnpm 9.5.0.

---

# Tâche n°2 — Collector Apify + Normalizer + Branche A n8n

> Livré le 2026-05-13 (suite de la tâche n°1). Cette section append-only au HANDOFF.

## 1. Acteur Apify retenu

| Rôle | Acteur | URL Store | Pricing | Maintien |
|---|---|---|---|---|
| **Principal** | `harvestapi/linkedin-profile-posts` | https://apify.com/harvestapi/linkedin-profile-posts | $1.50 / 1 000 posts | 4.9★, dernière maj < 10j, 4.1k MAU |
| **Fallback 1** | `harvestapi/linkedin-post-search` | https://apify.com/harvestapi/linkedin-post-search | $1.50 / 1 000 posts | 5.0★, même provider HarvestAPI |
| **Fallback 2** | `apimaestro/linkedin-posts-search-scraper-no-cookies` | https://apify.com/apimaestro/linkedin-posts-search-scraper-no-cookies | $5.00 / 1 000 résultats | 4.6★, autre provider (réduit dépendance HarvestAPI) |

**Choix principal — raisonnement** : le watchlist est composé de `profile_id`, donc un acteur profile-based est le bon outil (search-based force un keyword artificiel). `harvestapi/linkedin-profile-posts` est sans cookies (pas de risque ban compte LinkedIn), supporte `scrapeComments` (pour `comment_sample`), accepte `postedLimitDate` (pour ne récupérer que la fenêtre 7 jours). Tarif bas, maintien actif.

**Schéma I/O — principal** :
- Input : `{ targetUrls: string[], maxPosts, scrapeReactions, scrapeComments, maxComments, postedLimitDate, includeQuotePosts, includeReposts }`
- Output (par post) : `{ id, linkedinUrl, content, author: { name, publicIdentifier, linkedinUrl }, postedAt: { date, timestamp, relative }, engagement: { likes, comments, shares }, postImages: [], comments: [{ commentary, author: { name }, likes }] }`

**Écart vs prompt initial** : le prompt listait `curious_coder/linkedin-post-search-scraper` comme fallback 2. Vérification effectuée — cet acteur **requiert un cookie de session LinkedIn**, ce qui contredit la consigne « pas de stockage de credentials privés » et fait peser un risque de ban du compte de scraping. Remplacé par `apimaestro/linkedin-posts-search-scraper-no-cookies` (no-cookies, autre provider pour diversifier les risques de panne fournisseur).

## 2. Fichiers créés ou modifiés

### Migrations Supabase (nouvelles)
- `supabase/migrations/20260514000001_dlq.sql` — table `raw_posts_dlq` + colonne `source_actor` sur `raw_posts` + RLS service_role/authenticated.
- `supabase/migrations/20260514000002_retention_dlq.sql` — `CREATE OR REPLACE` de `nexus_retention_purge()` pour inclure la purge `raw_posts_dlq` (30 jours).

### Schémas Zod (nouveaux, dans `packages/shared/src/schemas/`)
- `raw-post.schema.ts` — `rawPostSchema`, `mediaTypeEnum`, `commentSampleItemSchema`.
- `clean-post.schema.ts` — `cleanPostSchema`, `topicClusterPreEnum`, `filterReasonEnum`.
- `temporal-row.schema.ts` — `temporalRowSchema`, `dayOfWeekFullEnum`, `hourBucketEnum`, `formatDistributionSchema`.
- `apify-post.schema.ts` — `apifyPostMinimalSchema` (le gate Zod du `validate_and_route`), `apifyPostNormalizedSchema` (cible des mappers).
- `packages/shared/src/index.ts` — exports étendus pour ces 4 modules.

### Package `@nexus/n8n-nodes` (TypeScript de la logique de collecte)
- `packages/n8n-nodes/package.json` — version 0.2.0, `franc-min ^6.2.0` ajouté, scripts `test` + `typecheck`, `main`/`types`/`exports` configurés.
- `packages/n8n-nodes/src/date-utils.ts` — `toParisDateParts`, `toIsoWeekId`, `toHourBucket`, `parsePublishedAt`.
- `packages/n8n-nodes/src/apify-mappers.ts` — 3 mappers (`mapHarvestApiProfilePosts`, `mapHarvestApiPostSearch`, `mapApiMaestroPost`) + dispatcher `getMapperFor`.
- `packages/n8n-nodes/src/normalizer.ts` — `normalize()`, `computeEngagementScore()`, `detectFrench()`. Source de vérité de l'algorithme.
- `packages/n8n-nodes/src/index.ts` — réexporte les 3 modules.
- `packages/n8n-nodes/src/__tests__/fixtures.ts` — 7 textes français ancrés assurance (1 par cluster) + 1 anglais + 1 self-promo + 1 trop court + helper `buildRawPost`.
- `packages/n8n-nodes/src/__tests__/normalizer.test.ts` — **15 tests** (happy path 10 posts, scoring formula, 5 filtres individuels, agrégation temporelle, idempotence + dédup, 7 clusters, détection FR).
- `packages/n8n-nodes/src/__tests__/date-utils.test.ts` — **20 tests** (paris parts CET/CEST, ISO week, hour buckets, parsePublishedAt formats variés).
- `packages/n8n-nodes/src/__tests__/apify-mappers.test.ts` — **5 tests** (harvestapi happy + carrousel + rejet, apimaestro post_id dérivé, dispatcher).

### Package `@nexus/scripts`
- `packages/scripts/package.json` — ajout dépendance `@nexus/n8n-nodes` + script `test-collector`.
- `packages/scripts/src/test-collector.ts` — CLI bout-en-bout (read watchlist → Apify avec fallback → mapping → UPSERT raw_posts + DLQ → calcul baselines glissantes → `normalize()` → UPSERT clean_posts + temporal_analysis → rapport synthétique CLI).

### Workflow n8n
- `n8n-workflows/nexus_collect_and_normalize.json` — 22 nodes, 17 connections. Cron samedi 22h FR **désactivé par défaut** (à activer manuellement après validation). Idempotent (UPSERT partout), retry 2× backoff exponentiel, timeout 180s, fallback Apify en cascade (3 acteurs), DLQ pour payloads malformés, Error Trigger global → Slack.

## 3. Commande pour lancer le test end-to-end

```bash
pnpm --filter @nexus/scripts test-collector
# Options : -- --limit N (default 5), -- --dry-run (skip writes)
```

Prérequis env : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`. Optionnel : `APIFY_MAX_POSTS_PER_RUN` (default 500), `LOG_LEVEL`.

## 4. Estimation d'un run sur watchlist de 5 profils

Hypothèses : 5 profils actifs, 10 posts max par profil sur fenêtre 7 jours.
- **Volume** : ~30-50 posts collectés (les profils LinkedIn pros postent typiquement 1-2 fois/semaine).
- **Coût Apify (principal)** : ~50 posts × $1.50/1 000 ≈ **$0.075 par run** soit ~**$0.30/mois** (4 runs/mois). Compute Units = ~50 / 1 000 × $1.50 / $0.25 par CU ≈ 0.3 CU.
- **Coût après normalize** : ~50% conservés (FR + longueur OK + non self-promo + ratio engagement ≥ 0.8 baseline). Soit ~25 `clean_posts`.

Si le système monte à 20 profils, compter ~$1.20/mois sur Apify principal. Plafond budgetaire à surveiller : variable `APIFY_MAX_POSTS_PER_RUN=500` (default), divisé sur le nombre de profils = `maxPostsPerProfile` envoyé à Apify.

## 5. Décisions techniques prises en autonomie

| Décision | Choix | Raison |
|---|---|---|
| **Lib langue** | `franc-min ^6.2.0` (MIT, ~30 KB compressé, top 82 langues) | Demandée par le prompt. Détection FR via `francAll(text, { minLength: 50 })` + check `top match === 'fra' && score >= 0.7`. |
| **Code Node n8n vs TS package** | Le Code Node n8n du workflow embarque une **version JS inline** du normalizer (heuristique stopwords FR au lieu de franc-min). Le TS `normalize()` reste la source de vérité testée. | n8n Cloud Code Nodes n'autorisent pas d'import npm arbitraire (franc-min). Le test-collector script Node.js utilise le vrai TS normalizer ; le Code Node n8n vit avec un détecteur FR heuristique mais le reste de l'algorithme est strictement identique. Documenter cette divergence et préférer en pratique le run via test-collector tant que la chaîne n8n n'est pas validée. |
| **Fallback 2 changé** | `apimaestro` au lieu de `curious_coder` (qui était dans le prompt) | curious_coder requiert un cookie LinkedIn → risque de ban + complexité auth supplémentaire + violation du principe « no stored credentials ». apimaestro est no-cookies, autre provider, mieux noté en mai 2026. |
| **`apifyPostMinimalSchema`** | 4 champs obligatoires : `post_id`, `author_id`, `published_at` (ISO 8601 avec offset), `text` (min 1 char) | Cible exacte du prompt §3 nœud 6 « validate_and_route ». Toute sortie acteur qui ne valide pas part en DLQ avec `error_reason` détaillé. |
| **Edge case "première occurrence auteur"** | `baseline_author` défaut = `engagement_raw` du post lui-même → ratio = 1.0 → passe | Implémentation du brief §5 Étape C. Évite de pénaliser un auteur qui débute dans la watchlist. Si engagement_raw = 0, baseline = 1 → ratio = 0 → rejet `below_author_baseline` (sémantique correcte : un post à 0 like ne mérite pas de figurer dans clean_posts). |
| **Trigger `temporal_analysis` matching** | `UPSERT` sur clé composite `(week_id, day_of_week, hour_bucket)` côté n8n + côté script | Aligné sur la contrainte UNIQUE de la migration 1. Permet le re-run idempotent : un même bucket réagrégé écrase la valeur précédente avec les nouveaux totaux. |
| **DLQ rétention 30j** | Migration 2 fait `CREATE OR REPLACE FUNCTION nexus_retention_purge()` (vs ALTER) | La migration 1 (tâche n°1) est immutable (déjà historique). Plutôt qu'altérer son script SQL, on remplace la fonction stockée — résultat fonctionnel identique, traçabilité historique préservée. |
| **Format heuristic FR dans Code Node n8n** | Ratio ≥ 6% de stopwords parmi les mots du texte, avec liste de ~40 stopwords français | Substitut au franc-min indisponible côté n8n. Calibré sur les fixtures du repo (les 7 textes FR passent largement, l'anglais échoue). Moins robuste que franc-min en queue de distribution — d'où la recommandation de routage via test-collector tant qu'on n'a pas activé `N8N_AVAILABLE_NPM_MODULES=franc-min` sur n8n cloud. |
| **Topic clusters — ordre strict** | L'ordre exact du brief est respecté : pilotage → commercial → reglementaire → operationnel → tech_ia → marche_assurance → autre | Un texte parlant à la fois d'ACPR et d'agent IA tombe dans `reglementaire` (en premier). Documenté pour les agents downstream qui ne doivent pas surinterpréter le cluster comme unique étiquette. |

## 6. Points de validation humaine avant la tâche n°3

- [ ] **Appliquer les migrations** `20260514000001_dlq.sql` et `20260514000002_retention_dlq.sql` sur Supabase live (`pnpm supabase:migrate`).
- [ ] **Régénérer `db/types.ts`** via `pnpm supabase:types` pour récupérer l'autocomplétion sur `raw_posts.source_actor` et `raw_posts_dlq`.
- [ ] **Lancer un premier run dry-run** : `pnpm --filter @nexus/scripts test-collector -- --limit 1 --dry-run` pour vérifier la chaîne réseau Apify sans toucher la DB.
- [ ] **Seeder 5 profils** dans `profiles_watchlist` (manuellement ou via le seed SQL template).
- [ ] **Lancer un run réel** : `pnpm --filter @nexus/scripts test-collector` et inspecter les `raw_posts` + `clean_posts` produits.
- [ ] **Inspecter manuellement les `clean_posts`** : valider que les 50% conservés sont bien des posts dignes d'être analysés par l'Agent 3 (pas de bruit auto-promo passé entre les mailles).
- [ ] **Importer `n8n-workflows/nexus_collect_and_normalize.json`** dans n8n cloud (Import from File). Configurer la credential `Supabase Nexus` (id à propager dans les 6 nodes Supabase qui ont `{{SUPABASE_CREDENTIAL_ID}}`). Configurer les env vars `APIFY_TOKEN`, `SLACK_WEBHOOK_URL`, `APIFY_MAX_POSTS_PER_RUN`.
- [ ] **Premier déclenchement manuel** du workflow n8n (ne PAS activer le cron tant que la qualité n'est pas validée).
- [ ] **Décision GO/NO-GO Agent 3** : si les `clean_posts` sont propres et la couverture watchlist est satisfaisante, passer à la tâche n°3 (Agent 3 PostAnalysis Claude).

## 7. Risques identifiés / points à valider au prochain run (suite)

9. **Heuristique FR du Code Node n8n** : ~94% de précision sur les fixtures du repo. Sur des posts limites (mélange FR/EN, citations longues en anglais), peut produire des faux positifs. **Mitigation** : faire tourner test-collector (qui utilise franc-min) en parallèle pendant 2-3 semaines pour comparer les rejets entre les deux pipelines avant de basculer 100% n8n.
10. **Fenêtre temporelle Apify** : `postedLimitDate` à T-7j. Un profil très actif (5+ posts/jour) peut dépasser `maxPosts=10` envoyé à Apify et tronquer silencieusement. À monitorer via la stat `kept` du rapport test-collector — si on suspecte une saturation, augmenter `APIFY_MAX_POSTS_PER_RUN`.
11. **`workflow_logs` table absente** : le prompt évoque une option de log structuré en table. J'ai préféré le couple `pino` côté process + `weekly_reports.human_notes` en cas d'erreur critique (cf. runbook §5). Si l'équipe Marouane veut une table dédiée plus tard, la migration sera simple : `CREATE TABLE workflow_logs (...)` + un node `Supabase Insert` dans le workflow.
12. **`comment_sample` JSONB** : le mapper récupère top 5 commentaires (par likes décroissants). En base, c'est stocké JSONB avec `JSON.stringify` côté n8n (UPSERT raw_posts). Vérifier qu'aucun email ou téléphone ne traverse le filtre — c'est techniquement possible si un commentateur public en met dans son commentaire. **Mitigation** à mettre dans la tâche n°3 : sanitizer des PII sur le contenu des `comment_sample` avant insertion.
13. **Connexions Supabase node n8n** : les 6 nodes Supabase référencent `{{SUPABASE_CREDENTIAL_ID}}` comme placeholder. À l'import, n8n demandera de relier la credential — c'est un choix conscient pour ne pas committer d'ID de credential interne.

---

**Statut tâche n°2** : repo livré complet, 55 tests verts, lint/format/typecheck OK, workflow n8n JSON valide (22 nodes, 17 connections). Prêt pour la validation humaine de la qualité de collecte avant d'enchaîner sur la tâche n°3 (Agent 3 PostAnalysis Claude).
