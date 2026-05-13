-- Nexus Editorial — Dead-letter queue pour posts mal formés
-- Migration: 20260514000001_dlq
--
-- Toute sortie Apify qui ne valide pas le schéma Zod minimal
-- (post_id, author_id, published_at, text) atterrit ici plutôt que d'être
-- silencieusement droppée. Permet l'audit et la reprise manuelle.

CREATE TABLE IF NOT EXISTS raw_posts_dlq (
  id BIGSERIAL PRIMARY KEY,
  raw_payload JSONB NOT NULL,
  source_actor TEXT,
  error_reason TEXT,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  retried_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_raw_posts_dlq_collected_at ON raw_posts_dlq(collected_at);

ALTER TABLE raw_posts_dlq ENABLE ROW LEVEL SECURITY;

-- service_role : full access (n8n)
DROP POLICY IF EXISTS "service_role_all_dlq" ON raw_posts_dlq;
CREATE POLICY "service_role_all_dlq" ON raw_posts_dlq
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated : read-only (debug dashboard Lovable)
DROP POLICY IF EXISTS "authenticated_read_dlq" ON raw_posts_dlq;
CREATE POLICY "authenticated_read_dlq" ON raw_posts_dlq
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON raw_posts_dlq FROM anon;

-- Traçabilité acteur Apify sur raw_posts. Quel acteur a livré le post —
-- utile pour identifier des biais de format quand on rotate les fallbacks.
ALTER TABLE raw_posts ADD COLUMN IF NOT EXISTS source_actor TEXT;
