// agent-9-timing-recommendation
// Endpoint POST. Lit weekly_reports.winners_json + linkedin_trends_json
// pour week_id, calcule 3 créneaux jour+heure (déterministe, pas de LLM),
// UPSERT timing_json.
//
// Body : { week_id: string, force?: boolean }

import { verifyAuth } from '../_shared/auth.ts';
import { errorResponse, handleCorsPreflight, jsonResponse } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import type {
  Day,
  LinkedinTrends,
  TimingRecommendation,
  WeeklyWinner,
  WeeklyWinners,
} from '../_shared/schemas.ts';
import { timingRecommendationSchema } from '../_shared/schemas.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { currentIsoWeek } from '../_shared/week.ts';

const DEFAULT_DAY_PALETTE: Day[] = ['Mar', 'Jeu', 'Mer'];
const DAY_NAME_TO_ENUM: Record<string, Day> = {
  Lun: 'Lun',
  Lundi: 'Lun',
  lun: 'Lun',
  lundi: 'Lun',
  Mar: 'Mar',
  Mardi: 'Mar',
  mar: 'Mar',
  mardi: 'Mar',
  Mer: 'Mer',
  Mercredi: 'Mer',
  mer: 'Mer',
  mercredi: 'Mer',
  Jeu: 'Jeu',
  Jeudi: 'Jeu',
  jeu: 'Jeu',
  jeudi: 'Jeu',
  Ven: 'Ven',
  Vendredi: 'Ven',
  ven: 'Ven',
  vendredi: 'Ven',
};
const DAY_ORDER: Day[] = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

interface ParsedBucket {
  start: number;
  end: number;
  recommended: string;
  score: number;
}

function parseHourBucket(raw: string): { start: number; end: number } | null {
  const cleaned = raw.replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:h(?:\d{2})?|:\d{2})?-(\d{1,2})(?:h(?:\d{2})?|:\d{2})?$/.exec(cleaned);
  if (!m) return null;
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    start > 23 ||
    end <= start ||
    end > 24
  )
    return null;
  return { start, end };
}

function bucketToHourString(start: number, end: number): string {
  const mid = (start + end) / 2;
  const hour = Math.floor(mid);
  const minute = mid - hour >= 0.5 ? 30 : 0;
  return `${String(hour).padStart(2, '0')}:${minute === 30 ? '30' : '00'}`;
}

function parseBuckets(buckets: LinkedinTrends['best_hours_observed']): ParsedBucket[] {
  const out: ParsedBucket[] = [];
  for (const b of buckets ?? []) {
    const range = parseHourBucket(b.hour_bucket);
    if (!range) continue;
    out.push({
      start: range.start,
      end: range.end,
      recommended: bucketToHourString(range.start, range.end),
      score: b.avg_engagement_norm,
    });
  }
  return out;
}

function bucketsCompatibleWithLength(
  buckets: ParsedBucket[],
  longueur_finale: number,
): ParsedBucket[] {
  let allowed: (b: ParsedBucket) => boolean;
  if (longueur_finale < 500) allowed = (b) => b.start >= 7 && b.start <= 14;
  else if (longueur_finale <= 1200) allowed = (b) => b.start >= 7 && b.start <= 12;
  else allowed = (b) => (b.start >= 11 && b.start <= 14) || (b.start >= 18 && b.start <= 21);
  const filtered = buckets.filter(allowed);
  return filtered.length > 0 ? filtered : buckets;
}

function computeConfidence(score: number, fallbackUsed: boolean): number {
  if (fallbackUsed) return 0.3;
  if (score > 5.0) return 0.8;
  if (score > 2.0) return 0.6;
  return 0.4;
}

function parseDays(days: LinkedinTrends['best_days_observed']): Array<{ day: Day; score: number }> {
  const out: Array<{ day: Day; score: number }> = [];
  for (const d of days ?? []) {
    const norm = DAY_NAME_TO_ENUM[d.day];
    if (!norm) continue;
    out.push({ day: norm, score: d.avg_engagement_norm });
  }
  return out.sort((a, b) => b.score - a.score);
}

function deriveLongueurCible(longueur_finale: number): 'court' | 'moyen' | 'long' {
  if (longueur_finale < 500) return 'court';
  if (longueur_finale <= 1200) return 'moyen';
  return 'long';
}

function shiftSlot(
  day: Day,
  hourIdx: number,
  buckets: ParsedBucket[],
  usedSlots: Set<string>,
): { day: Day; hour: string; score: number } {
  for (let i = hourIdx + 1; i < buckets.length; i += 1) {
    const c = buckets[i];
    const key = `${day}|${c.recommended}`;
    if (!usedSlots.has(key)) return { day, hour: c.recommended, score: c.score };
  }
  const dayPos = DAY_ORDER.indexOf(day);
  const orig = buckets[hourIdx];
  for (let d = dayPos + 1; d < DAY_ORDER.length; d += 1) {
    const candidateDay = DAY_ORDER[d];
    const hourStr = orig?.recommended ?? '09:00';
    const key = `${candidateDay}|${hourStr}`;
    if (!usedSlots.has(key)) return { day: candidateDay, hour: hourStr, score: orig?.score ?? 0 };
  }
  return { day: 'Ven', hour: '09:00', score: 0 };
}

function computeAlternative(
  day: Day,
  hourIdx: number,
  buckets: ParsedBucket[],
  rankedDays: Array<{ day: Day; score: number }>,
  daysUsedCount: Map<Day, number>,
): { day: Day; hour: string } {
  const nextBucket = buckets[hourIdx + 1];
  const opt1 = nextBucket ? { day, hour: nextBucket.recommended, score: nextBucket.score } : null;
  let opt2: { day: Day; hour: string; score: number } | null = null;
  const orig = buckets[hourIdx];
  for (const rd of rankedDays) {
    if (rd.day === day) continue;
    if ((daysUsedCount.get(rd.day) ?? 0) >= 2) continue;
    if (!orig) break;
    opt2 = { day: rd.day, hour: orig.recommended, score: rd.score };
    break;
  }
  if (opt1 && opt2) return opt1.score >= opt2.score ? opt1 : opt2;
  if (opt1) return opt1;
  if (opt2) return opt2;
  return { day: 'Mar', hour: '09:00' };
}

function recommendTiming(
  winners: WeeklyWinners,
  lt: LinkedinTrends,
): {
  timing: TimingRecommendation[];
  stats: { fallback_used: boolean; collisions_resolved: number };
} {
  const rankedDays = parseDays(lt.best_days_observed);
  const allBuckets = parseBuckets(lt.best_hours_observed).sort((a, b) => b.score - a.score);

  let fallbackUsed = false;
  let collisions = 0;

  if (rankedDays.length < 3) {
    fallbackUsed = true;
    for (const d of DEFAULT_DAY_PALETTE) {
      if (!rankedDays.find((r) => r.day === d)) rankedDays.push({ day: d, score: 0 });
    }
  }
  if (allBuckets.length === 0) {
    fallbackUsed = true;
    allBuckets.push(
      { start: 8, end: 10, recommended: '09:00', score: 0 },
      { start: 12, end: 14, recommended: '13:00', score: 0 },
      { start: 19, end: 21, recommended: '20:00', score: 0 },
    );
  }

  const sortedByPos = [...winners].sort((a, b) => a.post_position - b.post_position);
  const usedSlots = new Set<string>();
  const daysUsedCount = new Map<Day, number>();
  const timing: TimingRecommendation[] = [];

  for (let i = 0; i < sortedByPos.length; i += 1) {
    const w = sortedByPos[i];
    const longueur_finale = w.longueur_finale;
    const longueur_cible = deriveLongueurCible(longueur_finale);
    const baseDay = rankedDays[i]?.day ?? DEFAULT_DAY_PALETTE[i] ?? 'Mar';
    const compatible = bucketsCompatibleWithLength(allBuckets, longueur_finale);
    const baseBucket = compatible[0];

    let day = baseDay;
    let hour = baseBucket.recommended;
    let score = baseBucket.score;
    const slotKey = `${day}|${hour}`;
    const dayCount = daysUsedCount.get(day) ?? 0;

    if (usedSlots.has(slotKey)) {
      const shifted = shiftSlot(day, 0, compatible, usedSlots);
      day = shifted.day;
      hour = shifted.hour;
      score = shifted.score;
      collisions += 1;
    } else if (dayCount >= 2) {
      const shifted = shiftSlot(day, 0, compatible, usedSlots);
      day = shifted.day;
      hour = shifted.hour;
      score = shifted.score;
      collisions += 1;
    }

    const confidence = computeConfidence(score, fallbackUsed);
    const alternative_slot = computeAlternative(day, 0, compatible, rankedDays, daysUsedCount);
    const rationale =
      score > 0
        ? `${day} ${hour} : créneau noté ${score.toFixed(2)} dans linkedin_trends de la semaine. Cohérent avec longueur ${longueur_finale}c (${longueur_cible}).`
        : `${day} ${hour} : palette par défaut (linkedin_trends sans signal exploitable). Cohérent avec longueur ${longueur_finale}c (${longueur_cible}).`;

    timing.push({
      post_position: w.post_position as 1 | 2 | 3,
      day_recommended: day,
      hour_recommended: hour,
      confidence,
      rationale,
      alternative_slot,
    });

    usedSlots.add(`${day}|${hour}`);
    daysUsedCount.set(day, (daysUsedCount.get(day) ?? 0) + 1);
  }

  return { timing, stats: { fallback_used: fallbackUsed, collisions_resolved: collisions } };
}

Deno.serve(async (req: Request) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);
  const authErr = verifyAuth(req);
  if (authErr) return authErr;

  const log = logger.child({ fn: 'agent-9-timing-recommendation' });
  const t0 = Date.now();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      week_id?: string;
      force?: boolean;
    };
    const weekId = body.week_id ?? currentIsoWeek();
    const sb = getSupabase();

    if (!body.force) {
      const { data: existing } = await sb
        .from('weekly_reports')
        .select('timing_json')
        .eq('week_id', weekId)
        .maybeSingle();
      if (existing && (existing as { timing_json: unknown }).timing_json) {
        return jsonResponse({ skipped: true, reason: 'already_has_timing', week_id: weekId });
      }
    }

    const { data: row } = await sb
      .from('weekly_reports')
      .select('winners_json, linkedin_trends_json')
      .eq('week_id', weekId)
      .maybeSingle();
    const r = row as {
      winners_json: WeeklyWinners | null;
      linkedin_trends_json: LinkedinTrends | null;
    } | null;
    if (!r?.winners_json) return errorResponse('winners_json_missing', 400, { week_id: weekId });
    if (!r.linkedin_trends_json)
      return errorResponse('linkedin_trends_json_missing', 400, { week_id: weekId });

    const result = recommendTiming(r.winners_json, r.linkedin_trends_json);
    // Valide chaque entrée Zod (sanité, normalement déterministe).
    for (const t of result.timing) {
      timingRecommendationSchema.parse(t);
    }

    const { error: upErr } = await sb.from('weekly_reports').upsert(
      {
        week_id: weekId,
        timing_json: result.timing as unknown,
        produced_at: new Date().toISOString(),
      },
      { onConflict: 'week_id' },
    );
    if (upErr) return errorResponse(`weekly_reports_upsert_failed: ${upErr.message}`, 500);

    const duration = Date.now() - t0;
    log.info({ week_id: weekId, duration_ms: duration, ...result.stats }, 'agent_9_done');
    return jsonResponse({
      week_id: weekId,
      timing: result.timing,
      stats: result.stats,
      duration_ms: duration,
      cost_eur: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, 'agent_9_failed');
    return errorResponse(msg, 500);
  }
});
