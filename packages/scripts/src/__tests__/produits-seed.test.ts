import { containsSensitive } from '@nexus/shared';
import { describe, expect, it } from 'vitest';
import { PRODUITS_SEED } from '../data/produits-synvex-seed.js';

// Garde-fou de sécurité : le corpus committé ne doit JAMAIS contenir de
// donnée sensible (anciens employeurs, emails, signature, mention confidentielle).
// Remplace le test "mock ZIP" du brief (les fiches sont des PDF, pas des ZIP) :
// on vérifie directement que le seed déterministe est propre.

describe('PRODUITS_SEED — corpus committé', () => {
  it('contient les 7 produits attendus', () => {
    const slugs = PRODUITS_SEED.map((p) => p.slug).sort();
    expect(slugs).toEqual(['argus', 'atlas', 'chiron', 'cortex', 'helios', 'hermes', 'orion']);
  });

  it('chaque produit a problemes_terrain + mecaniques + chiffres non vides', () => {
    for (const p of PRODUITS_SEED) {
      expect(p.problemes_terrain.length, `${p.slug}.problemes_terrain`).toBeGreaterThan(0);
      expect(p.mecaniques.length, `${p.slug}.mecaniques`).toBeGreaterThan(0);
      expect(p.chiffres.length, `${p.slug}.chiffres`).toBeGreaterThan(0);
      expect(p.punchlines.length, `${p.slug}.punchlines`).toBeGreaterThan(0);
      for (const c of p.chiffres) {
        expect(c.valeur.length, `${p.slug} chiffre.valeur`).toBeGreaterThan(0);
        expect(c.libelle.length, `${p.slug} chiffre.libelle`).toBeGreaterThan(0);
      }
    }
  });

  it('ZÉRO donnée sensible dans tout le corpus (scan complet)', () => {
    for (const p of PRODUITS_SEED) {
      const flat = JSON.stringify(p);
      expect(containsSensitive(flat), `donnée sensible dans ${p.slug}`).toBe(false);
    }
  });
});
