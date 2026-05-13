-- Nexus Editorial — Init schema (8 tables + index)
-- Migration: 20260513000001_init_schema
-- Idempotent (IF NOT EXISTS partout).

-- Table 1 : profils watchlist
CREATE TABLE IF NOT EXISTS profiles_watchlist (
  profile_id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  headline TEXT,
  secteur TEXT,
  langue TEXT DEFAULT 'FR',
  audience_size_estimee INT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2 : posts bruts collectés
CREATE TABLE IF NOT EXISTS raw_posts (
  post_id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES profiles_watchlist(profile_id),
  published_at TIMESTAMPTZ NOT NULL,
  day_of_week TEXT,
  hour_of_day INT,
  text TEXT,
  media_type TEXT,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  reposts INT DEFAULT 0,
  views_estimees INT,
  url TEXT,
  comment_sample JSONB,
  collected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 3 : posts nettoyés et scorés
CREATE TABLE IF NOT EXISTS clean_posts (
  post_id TEXT PRIMARY KEY REFERENCES raw_posts(post_id),
  engagement_score_normalized FLOAT,
  is_relevant BOOLEAN,
  topic_cluster_pre TEXT,
  filter_reason TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 4 : analyses éditoriales par post
CREATE TABLE IF NOT EXISTS post_analysis (
  post_id TEXT PRIMARY KEY REFERENCES clean_posts(post_id),
  analysis_json JSONB,
  transferabilite_assurance INT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 5 : analyse temporelle (jour × heure × format)
CREATE TABLE IF NOT EXISTS temporal_analysis (
  id BIGSERIAL PRIMARY KEY,
  week_id TEXT,
  day_of_week TEXT,
  hour_bucket TEXT,
  posts_count INT,
  avg_engagement_norm FLOAT,
  top_format TEXT,
  format_distribution JSONB,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_id, day_of_week, hour_bucket)
);

-- Table 6 : rapports hebdomadaires
CREATE TABLE IF NOT EXISTS weekly_reports (
  week_id TEXT PRIMARY KEY,
  linkedin_trends_json JSONB,
  insurance_trends_json JSONB,
  angles_json JSONB,
  winners_json JSONB,
  visuals_json JSONB,
  timing_json JSONB,
  produced_at TIMESTAMPTZ DEFAULT NOW(),
  human_validated BOOLEAN DEFAULT false,
  human_notes TEXT
);

-- Table 7 : voice pack Synvex (référence permanente)
CREATE TABLE IF NOT EXISTS synvex_voice_pack (
  entry_id BIGSERIAL PRIMARY KEY,
  type TEXT,
  content TEXT,
  weight INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 8 : performance éditoriale (boucle feedback)
CREATE TABLE IF NOT EXISTS editorial_performance (
  id BIGSERIAL PRIMARY KEY,
  week_id TEXT,
  post_position INT,
  post_id_internal TEXT,
  published_at TIMESTAMPTZ,
  archetype TEXT,
  icp_vise TEXT,
  likes_7d INT,
  comments_7d INT,
  reposts_7d INT,
  impressions_7d INT,
  dm_received INT,
  notes_qualite TEXT,
  saisi_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_raw_posts_published_at ON raw_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_raw_posts_profile_id ON raw_posts(profile_id);
CREATE INDEX IF NOT EXISTS idx_temporal_analysis_week_id ON temporal_analysis(week_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_produced_at ON weekly_reports(produced_at);
