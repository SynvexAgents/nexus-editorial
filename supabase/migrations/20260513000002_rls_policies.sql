-- Nexus Editorial — Row Level Security policies
-- Migration: 20260513000002_rls_policies
-- service_role : full access (n8n + scripts backend)
-- authenticated : read sur toutes tables, update restreint sur weekly_reports
--                 (human_validated, human_notes), insert sur editorial_performance.
-- anon : aucun accès.

-- ============================================================================
-- Enable RLS on all tables
-- ============================================================================
ALTER TABLE profiles_watchlist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_posts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE clean_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analysis          ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporal_analysis      ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE synvex_voice_pack      ENABLE ROW LEVEL SECURITY;
ALTER TABLE editorial_performance  ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- service_role: full access on every table
-- ============================================================================
DROP POLICY IF EXISTS "service_role full access" ON profiles_watchlist;
CREATE POLICY "service_role full access" ON profiles_watchlist
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role full access" ON raw_posts;
CREATE POLICY "service_role full access" ON raw_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role full access" ON clean_posts;
CREATE POLICY "service_role full access" ON clean_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role full access" ON post_analysis;
CREATE POLICY "service_role full access" ON post_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role full access" ON temporal_analysis;
CREATE POLICY "service_role full access" ON temporal_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role full access" ON weekly_reports;
CREATE POLICY "service_role full access" ON weekly_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role full access" ON synvex_voice_pack;
CREATE POLICY "service_role full access" ON synvex_voice_pack
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role full access" ON editorial_performance;
CREATE POLICY "service_role full access" ON editorial_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- authenticated: SELECT on every table
-- ============================================================================
DROP POLICY IF EXISTS "authenticated read" ON profiles_watchlist;
CREATE POLICY "authenticated read" ON profiles_watchlist
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read" ON raw_posts;
CREATE POLICY "authenticated read" ON raw_posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read" ON clean_posts;
CREATE POLICY "authenticated read" ON clean_posts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read" ON post_analysis;
CREATE POLICY "authenticated read" ON post_analysis
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read" ON temporal_analysis;
CREATE POLICY "authenticated read" ON temporal_analysis
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read" ON weekly_reports;
CREATE POLICY "authenticated read" ON weekly_reports
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read" ON synvex_voice_pack;
CREATE POLICY "authenticated read" ON synvex_voice_pack
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read" ON editorial_performance;
CREATE POLICY "authenticated read" ON editorial_performance
  FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- authenticated: UPDATE restricted to weekly_reports validation columns
-- ----------------------------------------------------------------------------
-- We block writes on every other column via a column-level trigger so we can
-- enforce "only human_validated + human_notes" semantics. RLS USING/WITH CHECK
-- alone cannot lock specific columns, so we combine the policy with a trigger.
-- ============================================================================
DROP POLICY IF EXISTS "authenticated update validation" ON weekly_reports;
CREATE POLICY "authenticated update validation" ON weekly_reports
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION weekly_reports_block_non_validation_updates()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
    IF NEW.week_id              IS DISTINCT FROM OLD.week_id              OR
       NEW.linkedin_trends_json IS DISTINCT FROM OLD.linkedin_trends_json OR
       NEW.insurance_trends_json IS DISTINCT FROM OLD.insurance_trends_json OR
       NEW.angles_json          IS DISTINCT FROM OLD.angles_json          OR
       NEW.winners_json         IS DISTINCT FROM OLD.winners_json         OR
       NEW.visuals_json         IS DISTINCT FROM OLD.visuals_json         OR
       NEW.timing_json          IS DISTINCT FROM OLD.timing_json          OR
       NEW.produced_at          IS DISTINCT FROM OLD.produced_at
    THEN
      RAISE EXCEPTION 'authenticated role can only update human_validated and human_notes columns';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_weekly_reports_block_non_validation ON weekly_reports;
CREATE TRIGGER trg_weekly_reports_block_non_validation
  BEFORE UPDATE ON weekly_reports
  FOR EACH ROW EXECUTE FUNCTION weekly_reports_block_non_validation_updates();

-- ============================================================================
-- authenticated: INSERT on editorial_performance (manual feedback from dashboard)
-- ============================================================================
DROP POLICY IF EXISTS "authenticated insert feedback" ON editorial_performance;
CREATE POLICY "authenticated insert feedback" ON editorial_performance
  FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- anon: NO access. We explicitly grant nothing. Adding a deny-all policy keeps
-- intent obvious to future readers.
-- ============================================================================
REVOKE ALL ON profiles_watchlist, raw_posts, clean_posts, post_analysis,
              temporal_analysis, weekly_reports, synvex_voice_pack,
              editorial_performance
       FROM anon;
