import type { LinkedinTrends, WeeklyWinner, WeeklyWinners } from '@nexus/shared';
import { describe, expect, it } from 'vitest';
import { parseHourBucket, recommendTiming } from '../timing-recommender.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWinner(position: 1 | 2 | 3, longueur_finale: number): WeeklyWinner {
  return {
    post_position: position,
    winner_id: `W20-A${position}`,
    fusion_used: false,
    scoring: [],
    rationale_strategique: 'rationale',
    post_final: 'x'.repeat(longueur_finale),
    hook_variantes: ['A', 'B', 'C'],
    cta_recommande: 'aucun',
    longueur_finale,
    checklist_qualite_passee: {
      anti_cliche_ok: true,
      ancrage_actu_assurance_ok: true,
      ton_synvex_ok: true,
      longueur_alignee_tendance_ok: true,
      absence_survente_ok: true,
      vocabulaire_metier_ok: true,
    },
  };
}

function makeTrends(over: Partial<LinkedinTrends> = {}): LinkedinTrends {
  return {
    top_hooks: [{ type: 'stat_choc', frequency: 1, avg_engagement_norm: 1, example_post_id: 'p1' }],
    top_formats: [{ format: 'analyse', frequency: 1, avg_engagement_norm: 1 }],
    top_topic_clusters: [{ cluster: 'c', frequency: 1, avg_engagement_norm: 1 }],
    rising_topics: [],
    falling_topics: [],
    tone_dominant: 'lucide',
    longueur_optimale_p50_p90: [500, 1200],
    mecaniques_emergentes: [],
    best_days_observed: [
      { day: 'Mar', avg_engagement_norm: 6.5 },
      { day: 'Jeu', avg_engagement_norm: 4.0 },
      { day: 'Mer', avg_engagement_norm: 2.5 },
    ],
    best_hours_observed: [
      { hour_bucket: '08h-10h', avg_engagement_norm: 7.0 },
      { hour_bucket: '12h-14h', avg_engagement_norm: 5.5 },
      { hour_bucket: '19h-21h', avg_engagement_norm: 3.5 },
      { hour_bucket: '10h-12h', avg_engagement_norm: 2.0 },
    ],
    format_performance: [{ format: 'analyse', avg_engagement_norm: 1 }],
    ten_best_posts: [{ post_id: 'p1', score: 1, summary: 's' }],
    synthese_textuelle: 's',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Tests parseHourBucket
// ---------------------------------------------------------------------------

describe('parseHourBucket — parsing tolerant', () => {
  it('parses "08h-10h" correctly', () => {
    expect(parseHourBucket('08h-10h')).toEqual({ start: 8, end: 10 });
  });
  it('parses "8-10" correctly', () => {
    expect(parseHourBucket('8-10')).toEqual({ start: 8, end: 10 });
  });
  it('parses "12h-14h" correctly', () => {
    expect(parseHourBucket('12h-14h')).toEqual({ start: 12, end: 14 });
  });
  it('returns null on invalid input', () => {
    expect(parseHourBucket('abc')).toBeNull();
    expect(parseHourBucket('25-30')).toBeNull(); // hors plage
    expect(parseHourBucket('10-8')).toBeNull(); // inversé
  });
});

// ---------------------------------------------------------------------------
// Tests recommendTiming — happy path
// ---------------------------------------------------------------------------

describe('recommendTiming — happy path', () => {
  it('returns 3 timing recommendations with distinct days when trends supply 3+ days', () => {
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, makeTrends());

    expect(result.timing).toHaveLength(3);
    expect(result.stats.fallback_used).toBe(false);
    // 3 jours distincts attribués selon ranking.
    const days = result.timing.map((t) => t.day_recommended);
    expect(new Set(days).size).toBe(3);
    // post_position 1 → meilleur jour (Mar).
    expect(result.timing[0]!.day_recommended).toBe('Mar');
    expect(result.timing[1]!.day_recommended).toBe('Jeu');
    expect(result.timing[2]!.day_recommended).toBe('Mer');
  });
});

// ---------------------------------------------------------------------------
// Tests anti-collision
// ---------------------------------------------------------------------------

describe('recommendTiming — anti-collision', () => {
  it('shifts a 2nd post when its base slot would collide with the 1st', () => {
    // Trends avec 1 SEUL bon jour (Mar) + 1 seul bucket pour court & moyen.
    // → posts 1 et 2 vont tenter Mar+08:00 → collision.
    const trends = makeTrends({
      best_days_observed: [{ day: 'Mar', avg_engagement_norm: 7.0 }],
      best_hours_observed: [
        { hour_bucket: '08h-10h', avg_engagement_norm: 6.5 },
        { hour_bucket: '10h-12h', avg_engagement_norm: 4.0 },
      ],
    });
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, trends);

    // Toutes les paires (day, hour) doivent être uniques.
    const slots = result.timing.map((t) => `${t.day_recommended}|${t.hour_recommended}`);
    expect(new Set(slots).size).toBe(3);
  });

  it('avoids 3 posts on the same day even when trends suggest 1 winner day', () => {
    const trends = makeTrends({
      best_days_observed: [{ day: 'Mar', avg_engagement_norm: 7.0 }],
      best_hours_observed: [
        { hour_bucket: '08h-10h', avg_engagement_norm: 6.5 },
        { hour_bucket: '10h-12h', avg_engagement_norm: 4.5 },
        { hour_bucket: '12h-14h', avg_engagement_norm: 3.0 },
      ],
    });
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, trends);
    // Pas 3 fois Mar.
    const dayCounts = result.timing.reduce<Record<string, number>>((acc, t) => {
      acc[t.day_recommended] = (acc[t.day_recommended] ?? 0) + 1;
      return acc;
    }, {});
    for (const c of Object.values(dayCounts)) {
      expect(c).toBeLessThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests confidence
// ---------------------------------------------------------------------------

describe('recommendTiming — confidence calibration', () => {
  it('high confidence (0.8) when chosen bucket score > 5.0', () => {
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const trends = makeTrends(); // best bucket 08h-10h score 7.0
    const result = recommendTiming(winners, trends);
    // Post 1 prend le bucket 08h-10h (court). Score 7.0 → confidence 0.8.
    expect(result.timing[0]!.confidence).toBe(0.8);
  });

  it('low confidence (0.4) when chosen bucket score <= 2.0', () => {
    const trends = makeTrends({
      best_hours_observed: [{ hour_bucket: '08h-10h', avg_engagement_norm: 1.5 }],
    });
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, trends);
    expect(result.timing[0]!.confidence).toBe(0.4);
  });
});

// ---------------------------------------------------------------------------
// Tests longueur-aware bucket selection
// ---------------------------------------------------------------------------

describe('recommendTiming — long post chooses deep-read slot', () => {
  it('post > 1200c picks 12h-14h or 19h-21h, not morning peak', () => {
    const winners: WeeklyWinners = [
      makeWinner(1, 1500), // long
      makeWinner(2, 1000), // moyen
      makeWinner(3, 400), // court
    ] as WeeklyWinners;
    const trends = makeTrends();
    const result = recommendTiming(winners, trends);
    // post_position 1 (long) → milieu de bucket déjeuner ou soir.
    const longPost = result.timing.find((t) => t.post_position === 1)!;
    const longHour = Number.parseInt(longPost.hour_recommended.split(':')[0]!, 10);
    expect((longHour >= 11 && longHour <= 14) || (longHour >= 18 && longHour <= 21)).toBe(true);
  });
});

describe('recommendTiming — short post picks morning peak', () => {
  it('post < 500c picks 08h-10h or 12h-14h, not evening', () => {
    const winners: WeeklyWinners = [
      makeWinner(1, 400), // court
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const trends = makeTrends();
    const result = recommendTiming(winners, trends);
    const shortPost = result.timing.find((t) => t.post_position === 1)!;
    const shortHour = Number.parseInt(shortPost.hour_recommended.split(':')[0]!, 10);
    expect(shortHour >= 7 && shortHour <= 14).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests fallback palette
// ---------------------------------------------------------------------------

describe('recommendTiming — fallback when best_days_observed sparse', () => {
  it('uses default palette and sets confidence=0.3 when trends are empty', () => {
    const trends = makeTrends({
      best_days_observed: [],
      best_hours_observed: [],
    });
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, trends);
    expect(result.stats.fallback_used).toBe(true);
    for (const t of result.timing) {
      expect(t.confidence).toBe(0.3);
    }
    // Palette par défaut : Mar (#1), Jeu (#2), Mer (#3).
    expect(result.timing[0]!.day_recommended).toBe('Mar');
    expect(result.timing[1]!.day_recommended).toBe('Jeu');
    expect(result.timing[2]!.day_recommended).toBe('Mer');
  });
});

// ---------------------------------------------------------------------------
// Tests alternative_slot
// ---------------------------------------------------------------------------

describe('recommendTiming — alternative_slot always differs from primary', () => {
  it('alternative slot is always different from primary slot', () => {
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, makeTrends());
    for (const t of result.timing) {
      const sameDay = t.alternative_slot.day === t.day_recommended;
      const sameHour = t.alternative_slot.hour === t.hour_recommended;
      // Pas le même slot exact (same day AND same hour).
      expect(sameDay && sameHour).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests format Zod hour
// ---------------------------------------------------------------------------

describe('recommendTiming — hour format matches HH:00 or HH:30', () => {
  it('hour_recommended always matches /^([01]\\d|2[0-3]):(00|30)$/', () => {
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, makeTrends());
    const re = /^([01]\d|2[0-3]):(00|30)$/;
    for (const t of result.timing) {
      expect(re.test(t.hour_recommended)).toBe(true);
      expect(re.test(t.alternative_slot.hour)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Test rationale contient les champs attendus
// ---------------------------------------------------------------------------

describe('recommendTiming — rationale template includes longueur and day', () => {
  it('rationale string mentions day, hour, longueur_finale', () => {
    const winners: WeeklyWinners = [
      makeWinner(1, 480),
      makeWinner(2, 1000),
      makeWinner(3, 1500),
    ] as WeeklyWinners;
    const result = recommendTiming(winners, makeTrends());
    for (const t of result.timing) {
      expect(t.rationale).toContain(t.day_recommended);
      expect(t.rationale).toContain(t.hour_recommended);
      expect(t.rationale).toMatch(/longueur \d+c/);
    }
  });
});
