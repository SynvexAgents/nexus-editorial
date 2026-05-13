# Nexus Editorial

## Vision

Moteur hebdomadaire d'intelligence éditoriale LinkedIn pour **Synvex** (studio d'IA verticale assurance). Cron samedi 22h → livraison dimanche 8h de 3 posts calibrés au ton du fondateur, recommandations timing et visuels. Pas d'auto-post : validation humaine obligatoire.

## Stack

| Couche | Outil |
|---|---|
| Langage | TypeScript (Node 20+) |
| Package manager | pnpm 9 (workspaces) |
| Validation runtime | Zod 3 |
| SQL client | `@supabase/supabase-js` v2 |
| Migrations | Supabase CLI (fichiers SQL versionnés) |
| Tests | Vitest 2 |
| Lint + format | Biome 1.8 |
| Logger | pino 9 |
| CI | GitHub Actions |

## Quick start

```bash
git clone <repo-url> nexus-editorial
cd nexus-editorial
pnpm install
cp .env.example .env
# → remplir les clés (Supabase, Anthropic, Apify, etc.)
pnpm test         # >= 15 tests verts
pnpm lint         # Biome lint
pnpm supabase:migrate
```

## Checklist humaine (actions hors code) avant la tâche n°2

Ces actions doivent être faites **avant** d'avancer sur la tâche suivante. Elles sont hors scope du repo et nécessitent un compte / une interface externe.

- [ ] **Créer projet Supabase**, région `eu-west-3` (Paris). Cohérence RGPD impérative.
- [ ] **Activer l'extension `pg_cron`** dans Supabase Studio → Database → Extensions. Sans ça, la migration `20260513000003_retention_cron.sql` échouera.
- [ ] **Créer workspace n8n cloud** (préférer région UE).
- [ ] **Obtenir et stocker les clés API** dans `.env` (jamais dans git) :
  - Anthropic (Claude)
  - OpenAI (uniquement embeddings `text-embedding-3-small`)
  - Perplexity
  - Apify
  - Firecrawl
  - Resend
- [ ] **Tester l'acteur Apify** `harvestapi~linkedin-post-search-scraper` (Marketplace) — vérifier disponibilité et tarification.
- [ ] **Créer un compte LinkedIn secondaire** dédié au scraping (séparé du compte principal Marouane). Le scraping LinkedIn implique un risque de ban, ne jamais utiliser le compte fondateur.

## Commandes

| Commande | Effet |
|---|---|
| `pnpm install` | Installe toutes les dépendances workspace. |
| `pnpm test` | Exécute tous les tests Vitest (≥ 15 tests verts attendus). |
| `pnpm lint` | Lint Biome sur l'ensemble du repo. |
| `pnpm format` | Auto-format Biome (réécrit les fichiers). |
| `pnpm format:check` | Vérifie le format sans modifier. |
| `pnpm check` | Lint + format check + organize imports (utilisé en CI). |
| `pnpm typecheck` | Compile TS en mode noEmit sur tous les packages. |
| `pnpm supabase:migrate` | `supabase db push` — applique les migrations. |
| `pnpm supabase:types` | Régénère `packages/shared/src/db/types.ts`. À lancer après chaque migration. |

## Structure du repo

```
nexus-editorial/
├── .github/workflows/ci.yml      # CI lint + tests + typecheck
├── supabase/
│   ├── config.toml
│   ├── migrations/               # 3 migrations idempotentes
│   └── seed/                     # Templates SQL commentés
├── packages/
│   ├── shared/                   # Logger, Supabase client, 7 schémas Zod + tests
│   ├── n8n-nodes/                # Helpers Code Node (vide, structure prête)
│   └── scripts/                  # CLIs opérationnels (seed, etc.)
└── docs/
    ├── architecture.md           # 6 couches + diagramme ASCII
    ├── runbook.md                # 5 points de défaillance critiques
    ├── rgpd.md                   # Registre Art. 30 RGPD
    └── synvex-voice-tone.md      # Voice & tone Synvex (source de vérité)
```

## Prochaines tâches

Cette tâche n°1 livre la **fondation data + ossature repo** uniquement. Les tâches suivantes du plan global sont :

- **Tâche n°2** : workflow n8n `weekly-run` (Cron sam. 22h) + Agent 1 (Collect Apify) + Agent 2 (Clean).
- **Tâche n°3** : scripts d'ingestion (`seed-watchlist`, `drain-dlq`), cascade applicative RGPD sur retrait profil.
- **Tâche n°4** : Agent 3 (PostAnalysis Claude).
- **Tâche n°5** : Agents 4 et 5 (LinkedinTrends + InsuranceTrends).
- **Tâche n°6** : Agents 6, 7, 8, 9 (Angles, Winners, Visuals, Timing).
- **Tâche n°7** : dashboard Lovable (validation humaine + feedback).
- **Tâche n°8** : observabilité + notifications Slack/email.
- **Tâche n°9** : hardening (DLQ drain, monitoring, RGPD opérationnel).

Voir [docs/architecture.md](docs/architecture.md) pour la vue d'ensemble.
