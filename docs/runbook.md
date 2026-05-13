# Runbook — Nexus Editorial

5 points de défaillance critiques. Pour chacun : symptômes, diagnostic, action, fallback.

---

## 1. Apify acteur HS / blocage scraping

**Symptômes**
- Workflow n8n bloque sur l'étape Collect.
- 0 ligne nouvelle dans `raw_posts` pour le run en cours.
- Erreur Apify 4xx (`actor not found`, `429 rate limited`) ou 5xx.

**Diagnostic (2 étapes)**
1. Vérifier statut acteur `harvestapi~linkedin-post-search-scraper` sur Apify Console.
2. Si OK côté acteur, lancer un run manuel avec 1 profil pour isoler ban LinkedIn / changement de format.

**Action**
- Basculer sur acteur secondaire dans n8n : `apimaestro~linkedin-post-scraper`.
- Si secondaire HS → basculer `curious_coder~linkedin-post-scraper`.
- Documenter l'incident dans `weekly_reports.human_notes`.

**Fallback**
- Firecrawl sur `/recent-activity/` des profils watchlist (plus lent, moins riche).
- Sinon : mode dégradé manuel, livraison du dimanche reposera uniquement sur `post_analysis` historique + agents 5/6/7/8/9.

---

## 2. Perplexity timeout ou hallucination URL

**Symptômes**
- Étape InsuranceTrends (Agent 5) renvoie un payload sans `source_url` valide.
- HTTP 504 ou réponse > 60s sur l'endpoint Perplexity.
- Zod `insuranceTrendsSchema` rejette le payload.

**Diagnostic (2 étapes)**
1. Lire les logs n8n pour la requête Perplexity : status code + temps de réponse.
2. Pour chaque `source_url` retourné : `curl -sI <url>` doit renvoyer HTTP 200/301/302.

**Action**
- Retry 2x avec backoff 5s puis 15s.
- Pour chaque item : vérification HTTP 200 obligatoire avant ingestion. Tout item avec URL morte est **skippé** (pas ingéré, logué).
- Si moins de 3 items survivent globalement → marquer la section `insurance_trends_json` comme `{ "degraded": true, "reason": "perplexity_url_failures" }`.

**Fallback**
- Switch sur veille manuelle Firecrawl (liste de sources whitelistées : ACPR, Argus de l'assurance, News Assurances Pro, L'Argus, La Tribune de l'Assurance).
- Si même Firecrawl échoue → skip Agent 5 et signaler dans le rapport hebdo.

---

## 3. Claude rate limit

**Symptômes**
- HTTP 429 `rate_limit_error` sur appel Anthropic.
- Token bucket épuisé (TPM ou RPM).

**Diagnostic (1 étape)**
1. Header `retry-after` ou `anthropic-ratelimit-*-reset` dans la réponse.

**Action**
- Backoff exponentiel : 2s → 4s → 8s.
- 3 tentatives max. Si toujours 429 → **abort du run** complet.
- Notification Slack via `SLACK_WEBHOOK_URL` avec : `run_id`, étape échouée, `agent_id`, timestamp.
- Le run reprend manuellement via webhook `/run-now` (cf. §5) une fois la quota restaurée.

**Fallback**
- Pas de fallback modèle (la stack interdit OpenAI GPT pour la rédaction). Le run est différé, jamais dégradé en qualité.

---

## 4. Supabase indisponible

**Symptômes**
- Erreur de connexion (`ECONNREFUSED`, `ETIMEDOUT`) ou HTTP 503 sur appel Supabase REST.
- n8n logue `PostgresError` ou `FetchError` côté node Supabase.

**Diagnostic (1 étape)**
1. Vérifier statut Supabase : `https://status.supabase.com` + un `SELECT 1` via psql sur l'instance.

**Action**
- Dead-letter queue locale : sérialiser le payload non-écrit dans `/tmp/nexus-dlq/<ISO-timestamp>-<table>.json` (chemin déjà gitignored).
- Au prochain run hebdo (ou via job de drain manuel), rejouer les fichiers DLQ dans l'ordre chronologique.
- Logger `dlq_write` avec le nom de fichier pour traçabilité.

**Fallback**
- Aucun. Le système accepte un retard d'écriture (pas de hard requirement temps réel sur l'écriture). Le drain reste une opération à brancher en tâche n°3 (script `drain-dlq.ts`).

---

## 5. Cron n8n raté

**Symptômes**
- Aucun run weekly samedi 22h.
- `weekly_reports` n'a pas d'entrée pour la `week_id` attendue le dimanche matin.

**Diagnostic (1 étape)**
1. Console n8n cloud → onglet Executions → filtrer le workflow `weekly-run` sur les dernières 24h.

**Action**
- Trigger manuel via webhook : `POST {N8N_BASE_URL}/webhook/run-now` avec body `{ "week_id": "W21-2026", "trigger": "manual_recovery" }`.
- À la fin du run de récup, insérer une note dans `weekly_reports.human_notes` : `"cron_missed_<ISO>, manual_trigger_at_<ISO>"`.

**Fallback**
- Si n8n cloud lui-même est down : run local via `tsx packages/scripts/src/run-weekly.ts` (à implémenter tâche n°4, prévu en plan B).
