import type { DayOfWeek, HourBucket } from '@nexus/shared';

const EN_TO_FR_DAY: Record<string, DayOfWeek> = {
  Mon: 'Lun',
  Tue: 'Mar',
  Wed: 'Mer',
  Thu: 'Jeu',
  Fri: 'Ven',
  Sat: 'Sam',
  Sun: 'Dim',
};

export interface ParisDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: DayOfWeek;
}

/**
 * Décompose une Date en composantes Europe/Paris. Utilise Intl pour gérer
 * automatiquement CET/CEST sans dépendance externe.
 */
export function toParisDateParts(d: Date): ParisDateParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

  const enWeekday = get('weekday');
  const weekday: DayOfWeek = EN_TO_FR_DAY[enWeekday] ?? 'Lun';

  // Intl `hour: '2-digit'` with hour12:false returns '24' at midnight on some
  // engines (legacy quirk). Normalise to 0 to keep the 0-23 invariant.
  const hourStr = get('hour');
  const hour = hourStr === '24' ? 0 : Number.parseInt(hourStr, 10);

  return {
    year: Number.parseInt(get('year'), 10),
    month: Number.parseInt(get('month'), 10),
    day: Number.parseInt(get('day'), 10),
    hour,
    minute: Number.parseInt(get('minute'), 10),
    weekday,
  };
}

/**
 * Calcule la semaine ISO 8601 d'une date Paris-locale (yyyy-Www).
 * Suit la convention ISO : la semaine 1 est celle contenant le premier jeudi
 * de l'année (donc le 4 janvier).
 */
export function toIsoWeekId(parts: ParisDateParts): string {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const yyyy = utc.getUTCFullYear();
  const ww = String(week).padStart(2, '0');
  return `${yyyy}-W${ww}`;
}

export function toHourBucket(hour: number): HourBucket {
  if (hour >= 6 && hour < 8) return '06h-08h';
  if (hour >= 8 && hour < 10) return '08h-10h';
  if (hour >= 10 && hour < 12) return '10h-12h';
  if (hour >= 12 && hour < 14) return '12h-14h';
  if (hour >= 14 && hour < 17) return '14h-17h';
  if (hour >= 17 && hour < 19) return '17h-19h';
  if (hour >= 19 && hour < 21) return '19h-21h';
  return 'autre';
}

/**
 * Parse robuste d'un `published_at` quel que soit le format Apify rencontré :
 *   - ISO 8601 string
 *   - Unix timestamp (s ou ms)
 *   - { date, timestamp, relative } objet (harvestapi)
 * Retourne null si parsing impossible (laisse l'appelant décider du fallback).
 */
export function parsePublishedAt(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidates: unknown[] = [obj.date, obj.timestamp, obj.iso, obj.value];
    for (const c of candidates) {
      const parsed = parsePublishedAt(c);
      if (parsed) return parsed;
    }
  }

  return null;
}
