-- Nexus Editorial — DROP V2 Measurement Loop
-- Migration: 20260525000001_drop_v2_measurement_loop
--
-- Décision Marouane (mai 2026) : suppression de la boucle de mesure V2
-- (scraping performance des posts publiés). Reach LinkedIn organique
-- étranglé (~100-500 impressions / post sur 21K abonnés hors-cible) →
-- la mesure n'apporte pas de signal exploitable pour le RAG. Suspendu.
--
-- Annule la migration 20260520000001_v2_measurement_loop.sql.
-- post_performance d'abord (FK CASCADE vers published_posts), puis
-- published_posts. CASCADE retire aussi indexes + policies RLS associés.
--
-- NE TOUCHE PAS : weekly_reports, clean_posts, raw_posts, audit_logs,
-- system_prompts, raw_posts_dlq (pipeline de génération intact).

DROP TABLE IF EXISTS public.post_performance CASCADE;
DROP TABLE IF EXISTS public.published_posts CASCADE;

-- Vérification post-drop (à exécuter manuellement si besoin) :
--   SELECT COUNT(*) FROM information_schema.tables
--     WHERE table_schema = 'public'
--     AND table_name IN ('post_performance', 'published_posts');
--   -- doit retourner 0
