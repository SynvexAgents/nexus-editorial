// supabase/functions/_shared/week.ts
// Utilitaires de calcul de week_id ISO 8601 et conversion range.

export function currentIsoWeek(): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface WeekRange {
  date_start: string; // YYYY-MM-DD
  date_end: string;
}

export function isoWeekToDateRange(weekId: string): WeekRange {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match) throw new Error(`invalid_week_id: ${weekId}`);
  const year = Number.parseInt(match[1], 10);
  const week = Number.parseInt(match[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const targetSunday = new Date(targetMonday);
  targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);
  const fmt = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { date_start: fmt(targetMonday), date_end: fmt(targetSunday) };
}

export function extractWeekNumber(weekId: string): number {
  const match = /^\d{4}-W(\d{2})$/.exec(weekId);
  if (!match) throw new Error(`invalid_week_id_format: ${weekId}`);
  return Number.parseInt(match[1], 10);
}
