-- Nexus Editorial — Extension de la politique de rétention pour la DLQ
-- Migration: 20260514000002_retention_dlq
--
-- La fonction `nexus_retention_purge()` créée en 20260513000003 ne purgeait
-- pas `raw_posts_dlq` (qui n'existait pas). On la REMPLACE (CREATE OR REPLACE)
-- pour inclure la table DLQ avec une rétention de 30 jours.
--
-- Choix de rétention DLQ courte (30j vs 90j pour raw_posts) :
--   - Une DLQ sert au triage à court terme, pas à l'historique long.
--   - Si un payload mal formé est analysé et corrigé sous 30j, on retraite ;
--     sinon il devient peu actionnable.
-- Documenté dans HANDOFF.md §Décisions.

CREATE OR REPLACE FUNCTION nexus_retention_purge()
RETURNS void AS $$
BEGIN
  DELETE FROM raw_posts      WHERE collected_at  < NOW() - INTERVAL '90 days';
  DELETE FROM clean_posts    WHERE processed_at  < NOW() - INTERVAL '90 days';
  DELETE FROM post_analysis  WHERE analyzed_at   < NOW() - INTERVAL '6 months';
  DELETE FROM raw_posts_dlq  WHERE collected_at  < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
