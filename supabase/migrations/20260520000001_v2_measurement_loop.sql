-- Nexus Editorial V2 — Measurement Loop
-- Migration: 20260520000001_v2_measurement_loop
--
-- Ajoute les 2 tables nécessaires à la boucle de mesure :
--   1. published_posts : posts marqués publiés par Marouane (URL + metadata)
--   2. post_performance : metriques scrapées via Apify à J+7 et J+14
--
-- RAG light dans Agent 6 lit ces 2 tables pour injecter les top performers
-- passés (≥5 posts mesurés = mode light, ≥10 = full mode).

-- ---------------------------------------------------------------------------
-- TABLE 1 : published_posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS published_posts (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id TEXT NOT NULL REFERENCES weekly_reports(week_id),
  position INT NOT NULL CHECK (position IN (1, 2, 3)),
  archetype TEXT NOT NULL,
  icp TEXT,
  length_target TEXT,
  score_generation NUMERIC(4, 2),
  lead_trigger_present BOOLEAN NOT NULL DEFAULT false,
  linkedin_url TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_scrape_at TIMESTAMPTZ,
  scrape_d7_done BOOLEAN NOT NULL DEFAULT false,
  scrape_d14_done BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false
);

-- Index partiel pour cron Measurement Loop : ne scan que les non-archivés
-- avec un scrape dû.
CREATE INDEX IF NOT EXISTS idx_published_posts_next_scrape
  ON published_posts(next_scrape_at)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_published_posts_week_id
  ON published_posts(week_id);

ALTER TABLE published_posts ENABLE ROW LEVEL SECURITY;

-- service_role : full access (Edge Functions + n8n cron)
DROP POLICY IF EXISTS "service_role_all_published_posts" ON published_posts;
CREATE POLICY "service_role_all_published_posts" ON published_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated : read-only (dashboard Lovable page Stats)
DROP POLICY IF EXISTS "authenticated_read_published_posts" ON published_posts;
CREATE POLICY "authenticated_read_published_posts" ON published_posts
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- TABLE 2 : post_performance
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_performance (
  perf_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES published_posts(post_id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_since_publish INT NOT NULL CHECK (days_since_publish IN (7, 14)),
  likes INT,
  comments INT,
  reposts INT,
  impressions INT,
  dms_received INT,
  notes TEXT,
  raw_apify_response JSONB,
  UNIQUE (post_id, days_since_publish)
);

CREATE INDEX IF NOT EXISTS idx_post_performance_post_id
  ON post_performance(post_id);

CREATE INDEX IF NOT EXISTS idx_post_performance_measured_at
  ON post_performance(measured_at);

ALTER TABLE post_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_post_performance" ON post_performance;
CREATE POLICY "service_role_all_post_performance" ON post_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_post_performance" ON post_performance;
CREATE POLICY "authenticated_read_post_performance" ON post_performance
  FOR SELECT TO authenticated USING (true);
