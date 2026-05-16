-- 20260515000001_system_prompts.sql
-- ----------------------------------------------------------------------------
-- Table system_prompts : stocke en base les sources de vérité Markdown qui
-- alimentent les system prompts des Agents 3, 4, 6, 7 (et indirectement 8).
--
-- Pourquoi en base ? Les Edge Functions Supabase tournent sur Deno sans
-- accès au filesystem du repo. On ne peut donc pas faire readFileSync()
-- comme dans le code Node.js. Deux options :
--   1. Inline les Markdown dans chaque function (problème : doublons,
--      drift entre functions et fichiers docs/).
--   2. Lire depuis Supabase au runtime, avec cache mémoire par instance.
-- On choisit l'option 2.
--
-- Source de vérité humaine : docs/synvex-context-brief.md et
-- docs/synvex-voice-tone.md. Un script (seed-system-prompts.ts) lit ces
-- fichiers et UPSERT le contenu dans cette table. À relancer après chaque
-- modification des docs.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS system_prompts (
  prompt_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source_file TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);

COMMENT ON TABLE system_prompts IS
  'Source de vérité runtime pour les Markdown invariants (context_brief, voice_tone). Reseed depuis docs/ via pnpm seed:system-prompts.';

-- RLS : seul le service_role peut lire (les functions Edge utilisent
-- SUPABASE_SERVICE_ROLE_KEY). Anon est explicitement bloqué — c'est de la
-- doc interne.
ALTER TABLE system_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role can read system_prompts"
  ON system_prompts FOR SELECT
  USING (auth.role() = 'service_role');
CREATE POLICY "service_role can write system_prompts"
  ON system_prompts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
