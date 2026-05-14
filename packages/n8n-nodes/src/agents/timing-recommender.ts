/**
 * timing-recommender — Agent 9 Nexus Editorial.
 *
 * Recommande pour chaque winner (post_position 1, 2, 3) un créneau
 * jour + heure de publication LinkedIn FR, avec confidence et
 * alternative_slot.
 *
 * 100 % déterministe — aucun appel LLM. Pattern : LLM = jugement créatif,
 * tout le reste = TypeScript.
 *
 * Algorithme :
 *   1. Tri best_days_observed DESC par avg_engagement_norm.
 *   2. Tri best_hours_observed DESC par avg_engagement_norm.
 *   3. Pour chaque post i ∈ {1, 2, 3} :
 *      - day = i-ième meilleur jour (avec fallback palette par défaut).
 *      - hour = meilleur hour_bucket compatible avec longueur_finale,
 *        converti en HH:MM (milieu de bucket, arrondi à la demi-heure).
 *      - confidence dérivée de l'engagement_score effectif.
 *      - alternative_slot = même jour, bucket suivant OU jour suivant,
 *        même bucket (choix le moins risqué).
 *   4. Anti-collision : si 2 posts ont (day, hour) identiques, décale
 *      le 2e d'un bucket ou d'un jour.
 *   5. Pas plus de 2 posts le même jour (règle métier : Marouane ne
 *      publie pas 3 fois le même jour).
 */
import type { Day, LinkedinTrends, TimingRecommendation, WeeklyWinners } from '@nexus/shared';

// Palette par défaut si best_days_observed insuffisant (< 3 jours).
const DEFAULT_DAY_PALETTE: Day[] = ['Mar', 'Jeu', 'Mer'];

// Mapping français → enum Day. Le LinkedinTrends utilise des libellés
// comme "Mar" ou "Mardi" selon l'agent qui a produit. On tolère.
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

// Pour anti-collision : ordre des jours pour le décalage suivant.
const DAY_ORDER: Day[] = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

interface ParsedBucket {
  /** Libellé d'origine (ex: "08h-10h"). */
  raw: string;
  /** Heure de début incluse (0-23). */
  start: number;
  /** Heure de fin exclue (0-24). */
  end: number;
  /** Heure recommandée HH:MM (milieu de bucket arrondi à la demi-heure). */
  recommended: string;
  /** Engagement score normalisé du créneau. */
  score: number;
}

/**
 * Parse un hour_bucket en plage horaire. Tolère plusieurs formats :
 *   "08h-10h", "8h-10h", "8-10", "08:00-10:00", "08h00-10h00".
 * Retourne null si non parsable.
 */
export function parseHourBucket(raw: string): { start: number; end: number } | null {
  const cleaned = raw.replace(/\s+/g, '');
  // Capture deux groupes : avant et après le tiret.
  const m = /^(\d{1,2})(?:h(?:\d{2})?|:\d{2})?-(\d{1,2})(?:h(?:\d{2})?|:\d{2})?$/.exec(cleaned);
  if (!m) return null;
  const start = Number.parseInt(m[1]!, 10);
  const end = Number.parseInt(m[2]!, 10);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start < 0 || start > 23) return null;
  if (end <= start || end > 24) return null;
  return { start, end };
}

/**
 * Convertit une plage en heure recommandée HH:MM (format Zod : HH:00 ou HH:30).
 * Prend le milieu, arrondit à la demi-heure inférieure.
 */
function bucketToHourString(start: number, end: number): string {
  const mid = (start + end) / 2; // ex: (8+10)/2 = 9.0 ; (12+14)/2 = 13.0
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
      raw: b.hour_bucket,
      start: range.start,
      end: range.end,
      recommended: bucketToHourString(range.start, range.end),
      score: b.avg_engagement_norm,
    });
  }
  return out;
}

/**
 * Filtre les buckets compatibles avec une longueur de post :
 *   - court (< 500c) → pics d'engagement matinée / déjeuner (start ∈ [7..14]).
 *   - moyen (500-1200c) → créneaux standards matinée (start ∈ [7..12]).
 *   - long (> 1200c) → créneaux lecture profonde déjeuner / soir
 *                       (start ∈ [11..14] OR start ∈ [18..21]).
 *
 * Si aucun bucket ne match la règle, on relâche et on prend tous les
 * buckets disponibles (mieux qu'un fallback aveugle).
 */
function bucketsCompatibleWithLength(
  buckets: ParsedBucket[],
  longueur_finale: number,
): ParsedBucket[] {
  let allowed: (b: ParsedBucket) => boolean;
  if (longueur_finale < 500) {
    allowed = (b) => b.start >= 7 && b.start <= 14;
  } else if (longueur_finale <= 1200) {
    allowed = (b) => b.start >= 7 && b.start <= 12;
  } else {
    allowed = (b) => (b.start >= 11 && b.start <= 14) || (b.start >= 18 && b.start <= 21);
  }
  const filtered = buckets.filter(allowed);
  return filtered.length > 0 ? filtered : buckets;
}

function computeConfidence(score: number, fallbackUsed: boolean): number {
  if (fallbackUsed) return 0.3;
  if (score > 5.0) return 0.8;
  if (score > 2.0) return 0.6;
  return 0.4;
}

function normalizeDay(raw: string): Day | null {
  return DAY_NAME_TO_ENUM[raw] ?? null;
}

interface RankedDay {
  day: Day;
  score: number;
}

function parseDays(days: LinkedinTrends['best_days_observed']): RankedDay[] {
  const out: RankedDay[] = [];
  for (const d of days ?? []) {
    const norm = normalizeDay(d.day);
    if (!norm) continue;
    out.push({ day: norm, score: d.avg_engagement_norm });
  }
  // Tri DESC déjà par engagement. On le ré-applique pour robustesse.
  return out.sort((a, b) => b.score - a.score);
}

interface TimingComputeStats {
  fallback_used: boolean;
  collisions_resolved: number;
  three_same_day_resolved: number;
}

export interface RecommendTimingOutput {
  timing: TimingRecommendation[];
  stats: TimingComputeStats;
}

/**
 * Pour la longueur d'un winner, dérive la longueur_cible.
 * Évite de dépendre de l'angle d'origine (le post_processor Agent 7 a
 * recalculé longueur_finale réel).
 */
function deriveLongueurCible(longueur_finale: number): 'court' | 'moyen' | 'long' {
  if (longueur_finale < 500) return 'court';
  if (longueur_finale <= 1200) return 'moyen';
  return 'long';
}

/**
 * Décale (day, hourIdx) pour éviter une collision. Stratégie : essaie le
 * bucket suivant le mieux noté du même jour. Si épuisé, passe au jour
 * suivant (DAY_ORDER) même bucket d'origine.
 */
function shiftSlot(
  day: Day,
  hourIdx: number,
  buckets: ParsedBucket[],
  usedSlots: Set<string>,
): { day: Day; hour: string; score: number } {
  // Tentative 1 : bucket suivant le mieux noté, même jour.
  for (let i = hourIdx + 1; i < buckets.length; i += 1) {
    const candidate = buckets[i]!;
    const key = `${day}|${candidate.recommended}`;
    if (!usedSlots.has(key)) {
      return { day, hour: candidate.recommended, score: candidate.score };
    }
  }
  // Tentative 2 : jour suivant dans DAY_ORDER, même bucket d'origine.
  const dayPos = DAY_ORDER.indexOf(day);
  const startIdx = dayPos >= 0 ? dayPos + 1 : 0;
  const origBucket = buckets[hourIdx];
  for (let d = startIdx; d < DAY_ORDER.length; d += 1) {
    const candidateDay = DAY_ORDER[d]!;
    const hourStr = origBucket?.recommended ?? '09:00';
    const key = `${candidateDay}|${hourStr}`;
    if (!usedSlots.has(key)) {
      return {
        day: candidateDay,
        hour: hourStr,
        score: origBucket?.score ?? 0,
      };
    }
  }
  // Fallback ultime : Vendredi 09:00 (très rare en pratique).
  return { day: 'Ven', hour: '09:00', score: 0 };
}

/**
 * Compose l'alternative_slot : le moins risqué entre "même jour bucket
 * suivant" et "jour suivant même bucket". On retourne celui dont le
 * score d'engagement est le plus élevé (proxy "moins risqué").
 */
function computeAlternative(
  day: Day,
  hourIdx: number,
  buckets: ParsedBucket[],
  rankedDays: RankedDay[],
  daysUsedCount: Map<Day, number>,
): { day: Day; hour: string } {
  // Option 1 : même jour, bucket suivant.
  const nextBucket = buckets[hourIdx + 1];
  const opt1 = nextBucket ? { day, hour: nextBucket.recommended, score: nextBucket.score } : null;
  // Option 2 : jour suivant dans le ranking qui n'est pas saturé (≥ 2 usages déjà).
  let opt2: { day: Day; hour: string; score: number } | null = null;
  const origBucket = buckets[hourIdx];
  for (const rd of rankedDays) {
    if (rd.day === day) continue;
    if ((daysUsedCount.get(rd.day) ?? 0) >= 2) continue;
    if (!origBucket) break;
    opt2 = { day: rd.day, hour: origBucket.recommended, score: rd.score };
    break;
  }
  // Choisir le plus haut score.
  if (opt1 && opt2) return opt1.score >= opt2.score ? opt1 : opt2;
  if (opt1) return opt1;
  if (opt2) return opt2;
  // Fallback : Mardi 09:00 si jamais.
  return { day: 'Mar', hour: '09:00' };
}

export function recommendTiming(
  winners: WeeklyWinners,
  linkedinTrends: LinkedinTrends,
): RecommendTimingOutput {
  const rankedDays = parseDays(linkedinTrends.best_days_observed);
  const allBuckets = parseBuckets(linkedinTrends.best_hours_observed).sort(
    (a, b) => b.score - a.score,
  );

  let fallbackUsed = false;
  let collisionsResolved = 0;
  let threeSameDayResolved = 0;

  // Si moins de 3 jours rankés OU moins de 1 bucket : fallback palette.
  if (rankedDays.length < 3) {
    fallbackUsed = true;
    for (const dDef of DEFAULT_DAY_PALETTE) {
      if (!rankedDays.find((r) => r.day === dDef)) {
        rankedDays.push({ day: dDef, score: 0 });
      }
    }
  }
  if (allBuckets.length === 0) {
    fallbackUsed = true;
    // Buckets par défaut.
    allBuckets.push(
      { raw: '08h-10h', start: 8, end: 10, recommended: '09:00', score: 0 },
      { raw: '12h-14h', start: 12, end: 14, recommended: '13:00', score: 0 },
      { raw: '19h-21h', start: 19, end: 21, recommended: '20:00', score: 0 },
    );
  }

  const sortedByPos = [...winners].sort((a, b) => a.post_position - b.post_position);

  const usedSlots = new Set<string>();
  const daysUsedCount = new Map<Day, number>();
  const timing: TimingRecommendation[] = [];

  for (let i = 0; i < sortedByPos.length; i += 1) {
    const w = sortedByPos[i]!;
    const longueur_finale = w.longueur_finale;
    const longueur_cible = deriveLongueurCible(longueur_finale);

    // Jour : i-ième meilleur (1=#1, 2=#2, 3=#3).
    const baseDay = rankedDays[i]?.day ?? DEFAULT_DAY_PALETTE[i] ?? 'Mar';

    // Buckets compatibles avec longueur.
    const compatibleBuckets = bucketsCompatibleWithLength(allBuckets, longueur_finale);
    const baseHourIdx = 0; // meilleur bucket compatible
    const baseBucket = compatibleBuckets[baseHourIdx]!;

    // Anti-collision : si (baseDay, baseBucket) déjà utilisé, ou si baseDay
    // déjà à 2 usages, on décale.
    let day = baseDay;
    let hour = baseBucket.recommended;
    let score = baseBucket.score;
    const slotKey = `${day}|${hour}`;
    const dayCount = daysUsedCount.get(day) ?? 0;

    if (usedSlots.has(slotKey)) {
      const shifted = shiftSlot(day, baseHourIdx, compatibleBuckets, usedSlots);
      day = shifted.day;
      hour = shifted.hour;
      score = shifted.score;
      collisionsResolved += 1;
    } else if (dayCount >= 2) {
      // Règle "pas 3 posts le même jour".
      const shifted = shiftSlot(day, baseHourIdx, compatibleBuckets, usedSlots);
      day = shifted.day;
      hour = shifted.hour;
      score = shifted.score;
      threeSameDayResolved += 1;
    }

    const confidence = computeConfidence(score, fallbackUsed);

    const alternative_slot = computeAlternative(
      day,
      baseHourIdx,
      compatibleBuckets,
      rankedDays,
      daysUsedCount,
    );

    const rationale =
      score > 0
        ? `${day} ${hour} : créneau noté ${score.toFixed(2)} dans linkedin_trends de la semaine. Cohérent avec longueur ${longueur_finale}c (${longueur_cible}).`
        : `${day} ${hour} : palette par défaut (linkedin_trends sans signal exploitable). Cohérent avec longueur ${longueur_finale}c (${longueur_cible}).`;

    timing.push({
      post_position: w.post_position,
      day_recommended: day,
      hour_recommended: hour,
      confidence,
      rationale,
      alternative_slot,
    });

    usedSlots.add(`${day}|${hour}`);
    daysUsedCount.set(day, (daysUsedCount.get(day) ?? 0) + 1);
  }

  return {
    timing,
    stats: {
      fallback_used: fallbackUsed,
      collisions_resolved: collisionsResolved,
      three_same_day_resolved: threeSameDayResolved,
    },
  };
}
