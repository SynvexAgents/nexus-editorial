import { describe, expect, it } from 'vitest';
import {
  type ProduitRotationRow,
  assembleContenuBrut,
  buildProduitBlock,
  buildPiliersBlock,
  buildRegleVeriteBlock,
  containsSensitive,
  pickProductForRotation,
  scrubSensitive,
} from '../produit-synvex.js';

describe('scrubSensitive — removes sensitive business data', () => {
  it('strips former employers, email, contact URL, founder name, confidential mention', () => {
    const dirty =
      "Atlas est porté par un fondateur (MSH International, Henner). Contact : contact@synvex.ai · synvex.ai/atlas · Marouane Borsali. CONFIDENTIAL · FOR EXECUTIVE REVIEW.";
    const clean = scrubSensitive(dirty);
    expect(containsSensitive(clean)).toBe(false);
    expect(clean).not.toMatch(/MSH/i);
    expect(clean).not.toMatch(/Henner/i);
    expect(clean).not.toMatch(/Marouane|Borsali/i);
    expect(clean).not.toMatch(/@/);
    expect(clean).not.toMatch(/synvex\.ai/i);
    expect(clean).not.toMatch(/CONFIDENTIAL|EXECUTIVE REVIEW/i);
  });

  it('keeps legitimate product content intact', () => {
    const ok = 'Argus recalcule le dossier en 8 secondes. Ratio S/P piloté en temps réel.';
    expect(scrubSensitive(ok)).toBe(ok);
    expect(containsSensitive(ok)).toBe(false);
  });

  it('is idempotent', () => {
    const once = scrubSensitive('Henner et MSH International, contact@synvex.ai');
    expect(scrubSensitive(once)).toBe(once);
    expect(containsSensitive(once)).toBe(false);
  });
});

describe('containsSensitive — detection guard', () => {
  it('flags each sensitive token family', () => {
    expect(containsSensitive('travaillé chez MSH International')).toBe(true);
    expect(containsSensitive('team lead Henner')).toBe(true);
    expect(containsSensitive('Marouane Borsali')).toBe(true);
    expect(containsSensitive('x@y.com')).toBe(true);
    expect(containsSensitive('voir synvex.ai/argus')).toBe(true);
    expect(containsSensitive('CONFIDENTIAL document')).toBe(true);
  });

  it('returns false on clean content', () => {
    expect(containsSensitive('Un cabinet de courtage type traite ses sinistres.')).toBe(false);
  });
});

describe('pickProductForRotation — least-recently-used', () => {
  const rows: ProduitRotationRow[] = [
    { slug: 'argus', actif: true, derniere_utilisation_semaine: '2026-W24' },
    { slug: 'chiron', actif: true, derniere_utilisation_semaine: '2026-W22' },
    { slug: 'helios', actif: true, derniere_utilisation_semaine: null },
  ];

  it('picks the never-used product first (null derniere_utilisation)', () => {
    expect(pickProductForRotation(rows)?.slug).toBe('helios');
  });

  it('picks the oldest week when all have been used', () => {
    const used = rows.filter((r) => r.derniere_utilisation_semaine);
    expect(pickProductForRotation(used)?.slug).toBe('chiron'); // W22 < W24
  });

  it('tie-breaks by slug ascending', () => {
    const tie: ProduitRotationRow[] = [
      { slug: 'orion', actif: true, derniere_utilisation_semaine: '2026-W20' },
      { slug: 'atlas', actif: true, derniere_utilisation_semaine: '2026-W20' },
    ];
    expect(pickProductForRotation(tie)?.slug).toBe('atlas');
  });

  it('ignores inactive products', () => {
    const withInactive: ProduitRotationRow[] = [
      { slug: 'argus', actif: false, derniere_utilisation_semaine: null },
      { slug: 'chiron', actif: true, derniere_utilisation_semaine: '2026-W22' },
    ];
    expect(pickProductForRotation(withInactive)?.slug).toBe('chiron');
  });

  it('returns null when no active product (fallback to actu)', () => {
    expect(pickProductForRotation([])).toBeNull();
    expect(pickProductForRotation([{ slug: 'x', actif: false }])).toBeNull();
  });

  it('after-use rotation moves the picked product to the back next time', () => {
    let pool: ProduitRotationRow[] = [
      { slug: 'a', actif: true, derniere_utilisation_semaine: null },
      { slug: 'b', actif: true, derniere_utilisation_semaine: null },
    ];
    const first = pickProductForRotation(pool)!; // 'a' (tie-break)
    expect(first.slug).toBe('a');
    // simulate update derniere_utilisation = W25
    pool = pool.map((p) => (p.slug === 'a' ? { ...p, derniere_utilisation_semaine: '2026-W25' } : p));
    const second = pickProductForRotation(pool)!; // 'b' (still null)
    expect(second.slug).toBe('b');
  });
});

describe('buildProduitBlock — prompt fiche', () => {
  const fiche = {
    nom: 'Argus',
    domaine: 'Sinistres pro',
    positionnement: 'Le gardien des dossiers.',
    problemes_terrain: ['Leakage invisible'],
    mecaniques: ['Dossier Vivant'],
    chiffres: [{ valeur: '8 secondes', libelle: 'compréhension dossier' }],
    punchlines: ['Argus enquête, ne trie pas.'],
    cibles: ['MGA', 'Réassureurs'],
  };

  it('renders all sections + the no-invented-numbers guard', () => {
    const block = buildProduitBlock(fiche);
    expect(block).toContain('PRODUIT DE LA SEMAINE : Argus');
    expect(block).toContain('Leakage invisible');
    expect(block).toContain('Dossier Vivant');
    expect(block).toContain('8 secondes : compréhension dossier');
    expect(block).toContain('Argus enquête, ne trie pas.');
    expect(block).toContain('MGA · Réassureurs');
    expect(block).toMatch(/n'en invente AUCUN autre/i);
  });

  it('tolerates missing/empty arrays defensively', () => {
    const block = buildProduitBlock({ nom: 'X' });
    expect(block).toContain('PRODUIT DE LA SEMAINE : X');
    expect(block).toContain('- (n/a)');
  });
});

describe('buildPiliersBlock + buildRegleVeriteBlock', () => {
  it('pillars block names the 3 pillars', () => {
    const b = buildPiliersBlock();
    expect(b).toContain('PILIER 1 — LA PREUVE');
    expect(b).toContain('PILIER 2 — L');
    expect(b).toContain('PILIER 3 — LA PHILOSOPHIE');
  });

  it('truth rule block forbids inventing clients and numbers', () => {
    const b = buildRegleVeriteBlock();
    expect(b).toContain('RÈGLE DE VÉRITÉ NON NÉGOCIABLE');
    expect(b).toMatch(/NE JAMAIS inventer de chiffre/i);
    expect(b).toMatch(/NE JAMAIS inventer de client/i);
    expect(b).toMatch(/prime sur toute autre instruction/i);
  });
});

describe('assembleContenuBrut — derived, always scrubbed', () => {
  it('produces a complete context block with no sensitive tokens', () => {
    const brut = assembleContenuBrut({
      slug: 'argus',
      nom: 'Argus',
      domaine: 'Sinistres pro',
      positionnement: 'Le gardien.',
      problemes_terrain: ['Leakage'],
      mecaniques: ['Dossier Vivant'],
      chiffres: [{ valeur: '8s', libelle: 'compréhension' }],
      cibles: ['MGA'],
      punchlines: ['Argus enquête.'],
      differenciation: 'Raisonnement, pas classification.',
    });
    expect(brut).toContain('Argus — Sinistres pro');
    expect(brut).toContain('PROBLÈMES TERRAIN');
    expect(containsSensitive(brut)).toBe(false);
  });
});
