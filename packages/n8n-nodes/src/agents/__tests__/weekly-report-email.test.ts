import type {
  InsuranceTrends,
  LinkedinTrends,
  TimingRecommendation,
  VisualDecision,
  WeeklyWinner,
  WeeklyWinners,
} from '@nexus/shared';
import { describe, expect, it } from 'vitest';
import { type WeeklyReportData, composeWeeklyReportEmail } from '../weekly-report-email.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_LINKEDIN: LinkedinTrends = {
  top_hooks: [{ type: 'stat_choc', frequency: 5, avg_engagement_norm: 1.5, example_post_id: 'p1' }],
  top_formats: [{ format: 'analyse', frequency: 8, avg_engagement_norm: 1.2 }],
  top_topic_clusters: [{ cluster: 'pilotage', frequency: 3, avg_engagement_norm: 1.4 }],
  rising_topics: [],
  falling_topics: [],
  tone_dominant: 'lucide',
  longueur_optimale_p50_p90: [500, 1200],
  mecaniques_emergentes: [],
  best_days_observed: [{ day: 'Mar', avg_engagement_norm: 1.3 }],
  best_hours_observed: [{ hour_bucket: '08h-10h', avg_engagement_norm: 1.4 }],
  format_performance: [{ format: 'analyse', avg_engagement_norm: 1.3 }],
  ten_best_posts: [
    { post_id: 'p1', score: 2.5, summary: 'Post test.' },
    { post_id: 'p2', score: 2.1, summary: 'Autre.' },
  ],
  synthese_textuelle: 'Synthèse test.',
};

const SAMPLE_INSURANCE: InsuranceTrends = {
  regulation_acpr: [],
  sinistres_fraude: [],
  courtage_distribution: [],
  mutuelles_complementaires: [],
  insurtech_ia_assurance: [],
  back_office_productivite: [],
  signaux_faibles: [],
  actualites_majeures: [
    {
      titre: 'Test actu majeure',
      source_url: 'https://acpr.banque-france.fr/test',
      resume_2_lignes: 'Résumé.',
      date: '2026-05-10T00:00:00+00:00',
      impact_metier: 'Impact.',
    },
  ],
  synthese_textuelle: 'Synthèse assurance test.',
};

function makeWinner(position: 1 | 2 | 3, over: Partial<WeeklyWinner> = {}): WeeklyWinner {
  const base: WeeklyWinner = {
    post_position: position,
    winner_id: `W20-A${position}`,
    fusion_used: false,
    scoring: [],
    rationale_strategique: 'rationale',
    post_final:
      'Le ratio S/P se compresse sur les portefeuilles IARD. La marge se réduit silencieusement.',
    hook_variantes: ['Hook A.', 'Hook B.', 'Hook C.'],
    cta_recommande: 'aucun CTA',
    longueur_finale: 100,
    checklist_qualite_passee: {
      anti_cliche_ok: true,
      ancrage_actu_assurance_ok: true,
      ton_synvex_ok: true,
      longueur_alignee_tendance_ok: true,
      absence_survente_ok: true,
      vocabulaire_metier_ok: true,
    },
  };
  return { ...base, ...over };
}

function makeWinners(): WeeklyWinners {
  return [
    makeWinner(1, { longueur_finale: 480 }),
    makeWinner(2, { longueur_finale: 1009 }),
    makeWinner(3, { longueur_finale: 1422 }),
  ] as WeeklyWinners;
}

function makeVisuals(): VisualDecision[] {
  return [
    {
      post_position: 1,
      visual_recommended: false,
      visual_reason: 'Constat sec porte seul.',
      visual_type: 'aucun',
      gamma_prompt: '',
    },
    {
      post_position: 2,
      visual_recommended: true,
      visual_reason: 'Pédagogie décomposable.',
      visual_type: 'carrousel_4',
      gamma_prompt:
        'Carrousel 4 slides minimaliste palette neutre gris bleu nuit blanc typographie sérieuse.',
    },
    {
      post_position: 3,
      visual_recommended: true,
      visual_reason: 'Thèse longue, étapes.',
      visual_type: 'carrousel_6',
      gamma_prompt:
        'Carrousel 6 slides minimaliste palette neutre gris bleu nuit blanc typographie sérieuse étapes 2026 2027 2028.',
    },
  ];
}

function makeTiming(): TimingRecommendation[] {
  return [
    {
      post_position: 1,
      day_recommended: 'Mar',
      hour_recommended: '09:00',
      confidence: 0.8,
      rationale: 'Mar 09:00 créneau pic.',
      alternative_slot: { day: 'Lun', hour: '09:00' },
    },
    {
      post_position: 2,
      day_recommended: 'Lun',
      hour_recommended: '09:00',
      confidence: 0.8,
      rationale: 'Lun 09:00 créneau pic.',
      alternative_slot: { day: 'Mar', hour: '09:00' },
    },
    {
      post_position: 3,
      day_recommended: 'Mer',
      hour_recommended: '13:00',
      confidence: 0.4,
      rationale: 'Mer 13:00 créneau lecture profonde.',
      alternative_slot: { day: 'Mar', hour: '13:00' },
    },
  ];
}

function makeFullReport(): WeeklyReportData {
  return {
    week_id: '2026-W20',
    produced_at: '2026-05-14T22:30:00+02:00',
    linkedin_trends: SAMPLE_LINKEDIN,
    insurance_trends: SAMPLE_INSURANCE,
    angles: [{ angle_id: 'W20-A1' }],
    winners: makeWinners(),
    visuals: makeVisuals(),
    timing: makeTiming(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composeWeeklyReportEmail — happy path', () => {
  it('produces subject, text and html with the 3 posts summarized', () => {
    const out = composeWeeklyReportEmail(makeFullReport(), {
      dashboard_url: 'https://nexus-editorial.lovable.app',
    });
    expect(out.subject).toBe('Nexus Editorial — 3 posts prêts pour 2026-W20');
    expect(out.text).toContain('Post 1');
    expect(out.text).toContain('Post 2');
    expect(out.text).toContain('Post 3');
    expect(out.text).toContain('2026-W20');
    expect(out.text).toContain('https://nexus-editorial.lovable.app/week/2026-W20');
    // HTML doit aussi contenir 3 .post blocks.
    expect((out.html.match(/<div class="post">/g) ?? []).length).toBe(3);
  });
});

describe('composeWeeklyReportEmail — throw on incomplete report', () => {
  it('throws when winners missing', () => {
    const r = makeFullReport();
    r.winners = null;
    expect(() => composeWeeklyReportEmail(r)).toThrow(/incomplete_report/);
  });

  it('throws when visuals missing', () => {
    const r = makeFullReport();
    r.visuals = null;
    expect(() => composeWeeklyReportEmail(r)).toThrow(/visuals_json/);
  });

  it('throws listing all missing columns', () => {
    const r: WeeklyReportData = {
      week_id: '2026-W20',
      produced_at: null,
      linkedin_trends: null,
      insurance_trends: null,
      angles: null,
      winners: null,
      visuals: null,
      timing: null,
    };
    expect(() => composeWeeklyReportEmail(r)).toThrow(
      /linkedin_trends_json.*insurance_trends_json.*angles_json.*winners_json.*visuals_json.*timing_json/,
    );
  });
});

describe('composeWeeklyReportEmail — body content', () => {
  it('includes timing day/hour for each winner in the text body', () => {
    const out = composeWeeklyReportEmail(makeFullReport());
    expect(out.text).toContain('Mar 09:00');
    expect(out.text).toContain('Lun 09:00');
    expect(out.text).toContain('Mer 13:00');
  });

  it('includes the longueur_finale for each winner', () => {
    const out = composeWeeklyReportEmail(makeFullReport());
    expect(out.text).toContain('480c');
    expect(out.text).toContain('1009c');
    expect(out.text).toContain('1422c');
  });

  it('counts visual_recommended properly in the tech section', () => {
    const out = composeWeeklyReportEmail(makeFullReport());
    // 2/3 visuels recommandés dans le fixture.
    expect(out.text).toMatch(/2\/3 visuels recommand/);
    expect(out.html).toMatch(/2\/3 visuels recommand/);
  });

  it('mentions visual_type only when recommended=true in body', () => {
    const out = composeWeeklyReportEmail(makeFullReport());
    expect(out.text).toContain('carrousel_4');
    expect(out.text).toContain('carrousel_6');
    // Post 1 → visual_recommended=false, on ne doit pas afficher "aucun" comme visual_type marquant.
    expect(out.text).not.toMatch(/Post 1.*visuel aucun/);
  });
});

describe('composeWeeklyReportEmail — fallback dashboard_url', () => {
  it('falls back to default dashboard URL when not provided', () => {
    const out = composeWeeklyReportEmail(makeFullReport());
    expect(out.text).toContain('https://nexus-editorial.lovable.app/week/2026-W20');
  });

  it('uses custom dashboard_url when provided', () => {
    const out = composeWeeklyReportEmail(makeFullReport(), {
      dashboard_url: 'https://custom.example.com',
    });
    expect(out.text).toContain('https://custom.example.com/week/2026-W20');
    expect(out.text).not.toContain('lovable.app');
  });
});

describe('composeWeeklyReportEmail — HTML escaping', () => {
  it('escapes HTML special chars in post_final excerpts', () => {
    const winners = makeWinners();
    winners[0]!.post_final =
      'Test avec <script>alert("xss")</script> et caractères & spéciaux. Ratio S/P stable.';
    const out = composeWeeklyReportEmail({
      ...makeFullReport(),
      winners,
    });
    expect(out.html).not.toContain('<script>alert');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&amp;');
  });
});
