# Architecture Nexus Editorial

## Vision

Moteur hebdomadaire d'intelligence éditoriale LinkedIn pour Synvex. Cron samedi 22h → livraison dimanche 8h de 3 posts calibrés au ton du fondateur, avec recommandations timing et visuels. Pas d'auto-post : validation humaine obligatoire.

## Les 6 couches

```
┌──────────────────────────────────────────────────────────────────┐
│  Couche 6 — Dashboard (Lovable)                                  │
│  Validation humaine, feedback éditorial, lecture rapports        │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Supabase REST + RLS authenticated
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Couche 5 — Persistance (Supabase, eu-west-3)                    │
│  8 tables · RLS · pg_cron retention                              │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ service_role
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Couche 4 — Orchestration (n8n cloud)                            │
│  Workflow hebdo : collect → clean → analyze → trend → produce    │
│  Cron sam. 22h → livraison dim. 8h                               │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ HTTP / SDK
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Couche 3 — Agents IA (9 agents, Claude principal)               │
│  1 Collect · 2 Clean · 3 PostAnalysis · 4 LinkedinTrends ·       │
│  5 InsuranceTrends · 6 Angles · 7 Winners · 8 Visuals · 9 Timing │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Couche 2 — Acquisition (Apify, Perplexity, Firecrawl)           │
│  Posts LinkedIn watchlist · veille assurance signaux             │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Couche 1 — Fondations (ce repo, tâche n°1)                      │
│  Schémas SQL · contrats Zod · logger · CI · docs                 │
└──────────────────────────────────────────────────────────────────┘
```

## Flux hebdomadaire (résumé)

1. **Samedi 22h UTC+1** : cron n8n déclenche `weekly-run`.
2. **Agent 1 — Collect** : Apify scrape watchlist → `raw_posts`.
3. **Agent 2 — Clean** : normalisation, dédoublonnage, scoring engagement → `clean_posts` + `temporal_analysis`.
4. **Agent 3 — PostAnalysis** : Claude analyse chaque post relevant → `post_analysis`.
5. **Agent 4 — LinkedinTrends** : agrégation tendances LinkedIn semaine → `weekly_reports.linkedin_trends_json`.
6. **Agent 5 — InsuranceTrends** : Perplexity + Firecrawl veille assurance → `weekly_reports.insurance_trends_json`.
7. **Agent 6 — Angles** : production de 8 angles éditoriaux → `weekly_reports.angles_json`.
8. **Agent 7 — Winners** : scoring et sélection des 3 posts finaux → `weekly_reports.winners_json`.
9. **Agent 8 — Visuals** : décision visuel par post → `weekly_reports.visuals_json`.
10. **Agent 9 — Timing** : recommandation jour/heure → `weekly_reports.timing_json`.
11. **Dimanche 8h** : notification Slack + email Resend à Marouane.
12. **Validation humaine** : dashboard Lovable, `human_validated = true`.
13. **Publication manuelle** par Marouane.
14. **Feedback J+7** : saisie engagement réel → `editorial_performance`.

## Stack et dépendances

| Couche | Outil | Lib |
|---|---|---|
| Langage | TypeScript Node 20+ | — |
| Package manager | pnpm 9 workspaces | — |
| Validation runtime | Zod 3 | `zod` |
| SQL client | Supabase JS v2 | `@supabase/supabase-js` |
| Migrations | Supabase CLI | (CLI hors repo) |
| Tests | Vitest 2 | `vitest` |
| Lint + format | Biome 1.8 | `@biomejs/biome` |
| Logger | pino 9 | `pino` |
| CI | GitHub Actions | — |
| LLM rédaction | Claude (Anthropic) | via n8n HTTP |
| LLM veille | Perplexity | via n8n HTTP |
| Scraping | Apify, Firecrawl | via n8n HTTP |
| Embeddings | OpenAI `text-embedding-3-small` (uniquement) | via n8n HTTP |

## Sécurité et conformité

- Hébergement Supabase **eu-west-3 (Paris)** pour cohérence RGPD.
- Toutes les tables ont **RLS activé**. `anon` n'a aucun accès.
- Secrets exclusivement en env, jamais commit.
- Rétention : raw_posts 90j, clean_posts 90j, post_analysis 6 mois, le reste permanent. Cf. [rgpd.md](rgpd.md).
- Audit trail via colonnes `*_at` sur chaque table.

## Ce que cette tâche n°1 **ne** construit pas

- Aucun agent IA (tâches 3 à 9).
- Aucun workflow n8n (tâche 2+).
- Aucun écran Lovable (tâche 7).
- Aucun appel API externe.
