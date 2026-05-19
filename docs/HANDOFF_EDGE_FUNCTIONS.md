# HANDOFF — Déploiement Edge Functions Nexus Editorial

## Vue d'ensemble

11 Edge Functions Supabase Deno (équivalent prod des 9 agents + collect + notify) :

| Function | Modèle / Tech | Endpoint | Body |
|---|---|---|---|
| `collect-and-normalize` | Apify rotation | `POST /functions/v1/collect-and-normalize` | `{ max_posts_per_run?: number }` |
| `agent-3-post-analysis` | Haiku 4.5 | `POST /functions/v1/agent-3-post-analysis` | `{ limit?: number, force?: boolean }` |
| `agent-4-linkedin-trends` | Haiku 4.5 | `POST /functions/v1/agent-4-linkedin-trends` | `{ week_id?: string, force?: boolean, min_posts?: number }` |
| `agent-5-insurance-trends` | Perplexity Sonar Pro | `POST /functions/v1/agent-5-insurance-trends` | `{ week_id?: string, force?: boolean, only_cluster?: string }` |
| `agent-6-angles-generator` | Opus 4.7 | `POST /functions/v1/agent-6-angles-generator` | `{ week_id?: string, force?: boolean }` |
| `agent-7-editorial-director` | Opus 4.7 | `POST /functions/v1/agent-7-editorial-director` | `{ week_id?: string, force?: boolean }` |
| `agent-8-visual-decision` | Haiku 4.5 | `POST /functions/v1/agent-8-visual-decision` | `{ week_id?: string, force?: boolean }` |
| `agent-9-timing-recommendation` | TS déterministe | `POST /functions/v1/agent-9-timing-recommendation` | `{ week_id?: string, force?: boolean }` |
| `notify-weekly-report` | Resend HTTP | `POST /functions/v1/notify-weekly-report` | `{ week_id?: string }` |

Tous renvoient JSON. Tous attendent un `Authorization: Bearer <NEXUS_API_TOKEN>`.

## Pré-requis

- **Supabase CLI** ≥ 1.205 (`pnpm dlx supabase --version`)
- Projet linké : `supabase link --project-ref jugcyqtweavrltmxdogg`
- Migration `system_prompts` appliquée (`supabase db push` ou via Dashboard SQL Editor).

## Étape 1 — Migration + seed system_prompts

```bash
# Appliquer la nouvelle migration (table system_prompts).
supabase db push

# Seeder les Markdown invariants depuis docs/ vers la table.
pnpm --filter @nexus/scripts seed:system-prompts
# Affiche :
#   ✓ synvex_context_brief         (~5500 chars from docs/synvex-context-brief.md)
#   ✓ synvex_voice_tone            (~2000 chars from docs/synvex-voice-tone.md)
```

À relancer après toute modification des deux Markdown sources de vérité.

## Étape 2 — Générer le token d'authentification

```bash
# UUID v4 — n'importe quel secret cryptographiquement aléatoire fait l'affaire.
node -e "console.log(crypto.randomUUID())"
# Exemple de sortie : f3b9c4d7-1a2e-4f5c-9b8a-0d1e2f3a4b5c
```

Garder ce token précieusement (1Password / coffre n8n cloud). Il sera collé :
- Comme secret Supabase ci-dessous.
- Comme credential côté n8n cloud (header Authorization).

## Étape 3 — Set des secrets côté Supabase

Liste exhaustive (toutes les vars consommées par les 11 functions) :

```bash
# Auth interne entre n8n et les functions
supabase secrets set NEXUS_API_TOKEN=<le-token-genere-etape-2>

# Supabase (le service_role_key est déjà accessible aux functions, mais
# on le re-set explicitement car certains contexts l'ignorent autrement).
supabase secrets set SUPABASE_URL=https://jugcyqtweavrltmxdogg.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<copier-depuis-.env-local>

# LLM providers
supabase secrets set ANTHROPIC_API_KEY=<copier-depuis-.env-local>
supabase secrets set PERPLEXITY_API_KEY=<copier-depuis-.env-local>
supabase secrets set OPENAI_API_KEY=<copier-depuis-.env-local>  # optionnel (embeddings voice-pack non utilisé pour l'instant)

# Scraping
supabase secrets set APIFY_TOKEN=<copier-depuis-.env-local>

# Notifications
supabase secrets set RESEND_API_KEY=<copier-depuis-.env-local>
supabase secrets set NOTIFY_EMAIL_TO=aaa.projekt06@gmail.com
supabase secrets set NOTIFY_EMAIL_FROM=onboarding@resend.dev
supabase secrets set DASHBOARD_URL=https://nexus-editorial.lovable.app  # à mettre à jour après tâche 9b
```

Vérification :
```bash
supabase secrets list
# Doit afficher les 11 secrets (sans leur valeur).
```

## Étape 4 — Déployer les 11 functions

```bash
# Une par une (recommandé pour suivre les erreurs build) :
supabase functions deploy agent-3-post-analysis
supabase functions deploy agent-4-linkedin-trends
supabase functions deploy agent-5-insurance-trends
supabase functions deploy agent-6-angles-generator
supabase functions deploy agent-7-editorial-director
supabase functions deploy agent-8-visual-decision
supabase functions deploy agent-9-timing-recommendation
supabase functions deploy collect-and-normalize
supabase functions deploy notify-weekly-report

# OU tout d'un coup :
supabase functions deploy
```

Chaque deploy prend 30-90s (build Deno + push). L'output indique l'URL :
`https://jugcyqtweavrltmxdogg.functions.supabase.co/agent-X-...`

## Étape 5 — Tests post-déploiement (smoke)

```bash
TOKEN=<le-token-genere-etape-2>
BASE=https://jugcyqtweavrltmxdogg.functions.supabase.co

# Agent 9 (pas de LLM, le plus rapide pour valider l'auth + Supabase access).
curl -X POST "$BASE/agent-9-timing-recommendation" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"week_id":"2026-W20","force":true}'
# Attendu : 200 avec timing array (déjà UPSERTé en DB).

# Agent 8 (Haiku, ~5-10s).
curl -X POST "$BASE/agent-8-visual-decision" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"week_id":"2026-W20","force":true}'

# Notification email (final).
curl -X POST "$BASE/notify-weekly-report" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"week_id":"2026-W20"}'
# Devrait envoyer un email réel à NOTIFY_EMAIL_TO.
```

Si une function retourne 401 → token mismatch (re-set secret).
Si 500 avec `env_missing: X` → secret manquant.
Si 500 avec `system_prompt_missing` → seed:system-prompts pas exécuté.

## Étape 6 — Brancher n8n cloud

Mettre à jour le workflow `nexus_orchestration_branch_b.json` pour remplacer
les `executeCommand` (qui appelaient pnpm en local) par des `httpRequest`
vers les Edge Functions. Pattern par node :

```json
{
  "type": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "POST",
    "url": "https://jugcyqtweavrltmxdogg.functions.supabase.co/agent-X-...",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={ \"week_id\": \"{{$node['Code: compute_week_id'].json.week_id}}\" }",
    "options": {
      "timeout": 180000
    }
  },
  "credentials": {
    "httpHeaderAuth": {
      "id": "{{NEXUS_BEARER_CREDENTIAL_ID}}",
      "name": "Nexus Bearer Token"
    }
  }
}
```

Credential `httpHeaderAuth` côté n8n :
- Nom : `Nexus Bearer Token`
- Header Name : `Authorization`
- Header Value : `Bearer <le-token-etape-2>`

## Timeouts (point d'attention)

| Function | Durée observée | Timeout Edge default |
|---|---|---|
| collect-and-normalize | 60-300s (Apify dépend) | 150s ⚠️ |
| agent-3 | 5-15s par post × N | 150s ⚠️ si N > 10 |
| agent-4 | 10-60s | OK |
| agent-5 | 60-90s (séquentiel 7 clusters) | 150s OK |
| agent-6 | 80-160s (Opus) | 150s ⚠️ |
| agent-7 | 120-160s (Opus) | 150s ⚠️ |
| agent-8 | 5-30s (Haiku) | OK |
| agent-9 | < 100ms | OK |
| notify | 1-3s | OK |

**Risque timeout 150s** : Agents 3 (si batch grand), 5, 6, 7, collect. Mitigations :
- Agent 3 : ne pas dépasser `limit=50` par invocation (n8n peut paginer).
- Agent 6/7 : si dépassement systématique observé en prod, basculer en
  mode async (function retourne `job_id`, polling status via une table
  `agent_jobs` à créer). Pas implémenté pour l'instant — à reprendre si
  besoin.
- Agent 5 : couper l'`only_cluster` pour relancer cluster par cluster
  via 7 invocations n8n en série.

## Notes implémentation

- **Pas de filesystem** : `synvex-context-brief.md` et `synvex-voice-tone.md`
  sont lus depuis la table `system_prompts` au runtime (cache 5min par
  instance).
- **Pas de prefill Opus 4.7** : Agents 6 et 7 utilisent `extractJsonObject`
  (sans préfixe `{`). Haiku 4.5 (Agents 3, 4, 8) garde le prefill.
- **Pas de paramètre `temperature` pour Opus 4.7** : deprecated dans
  l'API mai 2026.
- **URL verifier Agent 5** : accepte 999 (LinkedIn-style anti-bot) et
  redirige 3xx.
- **Schémas Zod** : portés in-extenso dans `_shared/schemas.ts`. Le
  monorepo Node garde la source de vérité côté tests Vitest (163 tests).

## Coûts mensuels projetés (4 runs hebdo)

| Poste | €/mois |
|---|---|
| Apify (collect) | ~1.20 |
| Anthropic (3+4+6+7+8) | ~2.24 |
| Perplexity (5) | ~0.32 |
| Resend (notify) | 0 (free tier 3000/mois) |
| Supabase Edge Functions | 0 (Free tier 500k invocations/mois) |
| **TOTAL** | **~€3.76/mois** |

Aucun coût d'hébergement supplémentaire vs CLI Node.
