# RGPD — Registre Art. 30

Registre des traitements pour Nexus Editorial.

---

## Responsable de traitement

- **Entité** : Synvex
- **Personne référente** : Marouane Borsali (fondateur)
- **Contact** : voir profil professionnel Synvex

## Finalité

Veille éditoriale et production de contenu professionnel sur LinkedIn. Le système agrège du contenu **public** publié par des comptes professionnels actifs sur LinkedIn, le clusterise, en extrait des tendances, et produit des suggestions de posts à publier sous compte propre.

Aucune segmentation marketing, aucun ciblage publicitaire, aucune revente de données.

## Base légale

**Article 6.1.f RGPD — intérêt légitime.**

Test de mise en balance :
- Intérêt poursuivi : amélioration de la qualité éditoriale et de la pertinence métier des publications professionnelles du fondateur.
- Données traitées : uniquement contenus publics LinkedIn et métriques publiques associées.
- Impact sur les personnes concernées : nul (pas de profilage, pas de contact direct, pas de communication aux personnes scannées, pas de monétisation).
- Attente raisonnable : publier un post LinkedIn revient à le rendre lisible publiquement à des fins d'analyse professionnelle.

## Catégories de données traitées

| Catégorie | Détail | Source |
|---|---|---|
| Identifiants publics | `profile_id` (handle LinkedIn), `nom`, `headline` | Profil public LinkedIn |
| Contenu public | Texte des posts, type de média, URL du post | Posts LinkedIn publics |
| Métriques publiques | Likes, comments, reposts, vues estimées | Compteurs publics affichés sur le post |
| Données dérivées | Scoring engagement, cluster topic, analyse éditoriale | Calculs internes, pas d'origine externe |

## Données exclues (collecte interdite)

- Adresses email
- Numéros de téléphone
- Adresses postales
- Messages privés ou DM
- Connexions / réseau privé
- Données de localisation
- Données de santé, opinions politiques, syndicales, religieuses (art. 9)

## Durée de conservation

| Table | Durée | Mécanisme de purge |
|---|---|---|
| `raw_posts` | 90 jours | `pg_cron` mensuel (cf. migration 20260513000003) |
| `clean_posts` | 90 jours | `pg_cron` mensuel |
| `post_analysis` | 6 mois | `pg_cron` mensuel |
| `temporal_analysis` | Permanent (agrégats anonymes) | — |
| `weekly_reports` | Permanent | — |
| `synvex_voice_pack` | Permanent (référence interne) | — |
| `editorial_performance` | Permanent (KPI internes) | — |
| `profiles_watchlist` | Permanent ou jusqu'à demande de retrait | Cascade applicative à implémenter (tâche n°3) |

## Mesures de sécurité

- Hébergement Supabase **eu-west-3 (Paris)**, UE.
- **RLS activé** sur les 8 tables. `anon` n'a aucun accès. `authenticated` est limité en lecture + 2 cas d'écriture restreints (cf. migration 20260513000002).
- Secrets gérés exclusivement via variables d'environnement, jamais commit. Rotation manuelle documentée dans le README.
- **Audit trail** : chaque ligne porte une colonne `*_at` (collected_at, processed_at, analyzed_at, produced_at, saisi_at) pour traçabilité.
- Pas de logs verbose en production : niveau `info` par défaut, `debug` réservé au local.
- Communications n8n ↔ Supabase via HTTPS uniquement.

## Droits des personnes concernées

Bien que les données soient publiques et que la finalité ne crée pas d'impact direct, les personnes concernées peuvent demander :
- **Droit d'opposition** (art. 21) : retrait du profil de `profiles_watchlist`.
- **Droit à l'effacement** (art. 17) : suppression de toutes les données dérivées (cascade applicative à implémenter en tâche n°3 — supprimer un profil de `profiles_watchlist` doit purger les `raw_posts`, `clean_posts`, `post_analysis` associés).

**Procédure** : demande par email à Marouane Borsali. Réponse sous 30 jours.

## Sous-traitants

Liste des sous-traitants intervenant dans la chaîne de traitement :

| Sous-traitant | Rôle | Localisation | Garanties |
|---|---|---|---|
| Supabase (Supabase Inc.) | Hébergement BDD | eu-west-3 (Paris) | DPA signé, SCCs si transfert hors UE |
| Anthropic | LLM rédaction (Claude) | US | DPA, données API non utilisées pour entraînement (zero-retention activable) |
| Apify | Scraping LinkedIn | US/Czech Republic | DPA, traitement temporaire |
| Perplexity AI | Recherche web (veille) | US | DPA, pas de stockage long terme |
| Firecrawl | Scraping web fallback | US | DPA |
| n8n GmbH | Orchestration workflows | EU | DPA, hébergement EU possible |
| OpenAI | Embeddings (uniquement `text-embedding-3-small`) | US | DPA, zero-retention activable |
| Resend | Notifications email | US/EU | DPA |

Action humaine : signer les DPA fournisseur par fournisseur lors de l'activation des comptes (cf. checklist README).

## Registre des incidents

À tenir à jour dans `weekly_reports.human_notes` pour les incidents éditoriaux, et dans un fichier annexe `docs/incidents.md` (à créer si incident sécurité ou violation).

## Date de mise à jour

Document créé le 2026-05-13 lors de la tâche n°1 (fondations). Révision recommandée à chaque ajout de sous-traitant ou de catégorie de données.
