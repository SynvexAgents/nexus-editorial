-- Nexus Editorial — Corpus produits Synvex (carburant éditorial Agent 6)
-- Migration: 20260628000001_produits_synvex
--
-- Table de référence des fiches produit Synvex. Agent 6 pioche 1 produit en
-- rotation chaque semaine et génère ses 8 angles à partir de SA matière réelle
-- (problèmes terrain, mécaniques, chiffres déjà cadrés "client type",
-- punchlines). Règle de vérité : aucun contenu inventé hors de cette table.
--
-- Données sensibles (anciens employeurs, emails, mentions confidentielles,
-- signature nominative) EXCLUES à l'import — ne doivent jamais entrer ici.

CREATE TABLE IF NOT EXISTS produits_synvex (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  domaine TEXT,
  positionnement TEXT,
  problemes_terrain JSONB NOT NULL DEFAULT '[]'::jsonb,
  mecaniques JSONB NOT NULL DEFAULT '[]'::jsonb,
  chiffres JSONB NOT NULL DEFAULT '[]'::jsonb,
  cibles JSONB NOT NULL DEFAULT '[]'::jsonb,
  punchlines JSONB NOT NULL DEFAULT '[]'::jsonb,
  differenciation TEXT,
  contenu_brut TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  derniere_utilisation_semaine TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index rotation : produits actifs, les moins récemment utilisés d'abord.
CREATE INDEX IF NOT EXISTS idx_produits_synvex_rotation
  ON produits_synvex(derniere_utilisation_semaine NULLS FIRST, slug)
  WHERE actif = true;

-- updated_at auto sur UPDATE.
CREATE OR REPLACE FUNCTION set_produits_synvex_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_produits_synvex_updated_at ON produits_synvex;
CREATE TRIGGER trg_produits_synvex_updated_at
  BEFORE UPDATE ON produits_synvex
  FOR EACH ROW EXECUTE FUNCTION set_produits_synvex_updated_at();

ALTER TABLE produits_synvex ENABLE ROW LEVEL SECURITY;

-- service_role : full access (import script + Edge Function Agent 6).
DROP POLICY IF EXISTS "service_role_all_produits_synvex" ON produits_synvex;
CREATE POLICY "service_role_all_produits_synvex" ON produits_synvex
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated : read-only (dashboard éventuel).
DROP POLICY IF EXISTS "authenticated_read_produits_synvex" ON produits_synvex;
CREATE POLICY "authenticated_read_produits_synvex" ON produits_synvex
  FOR SELECT TO authenticated USING (true);
