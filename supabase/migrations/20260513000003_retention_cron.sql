-- Nexus Editorial — Retention cron (pg_cron)
-- Migration: 20260513000003_retention_cron
--
-- IMPORTANT (action humaine) : l'extension pg_cron doit être activée
-- manuellement dans Supabase Studio > Database > Extensions AVANT d'appliquer
-- cette migration. Sur Supabase cloud, pg_cron est disponible mais désactivé
-- par défaut.
--
-- Politique :
--   raw_posts        → 90 jours
--   clean_posts      → 90 jours
--   post_analysis    → 6 mois
-- Permanentes (jamais purgées) :
--   profiles_watchlist, temporal_analysis, weekly_reports,
--   synvex_voice_pack, editorial_performance.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Fonction de purge encapsulée pour faciliter audit et tests.
CREATE OR REPLACE FUNCTION nexus_retention_purge()
RETURNS void AS $$
BEGIN
  DELETE FROM raw_posts      WHERE collected_at  < NOW() - INTERVAL '90 days';
  DELETE FROM clean_posts    WHERE processed_at  < NOW() - INTERVAL '90 days';
  DELETE FROM post_analysis  WHERE analyzed_at   < NOW() - INTERVAL '6 months';
END;
$$ LANGUAGE plpgsql;

-- Cron mensuel le 1er du mois à 03:00 UTC.
-- Format pg_cron : "minute hour day month dow"
-- On unschedule d'abord pour rester idempotent.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'nexus_retention_purge_monthly';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END
$$;

SELECT cron.schedule(
  'nexus_retention_purge_monthly',
  '0 3 1 * *',
  $$SELECT nexus_retention_purge();$$
);
