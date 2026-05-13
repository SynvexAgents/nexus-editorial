import { describe, expect, it } from 'vitest';
import { parsePublishedAt, toHourBucket, toIsoWeekId, toParisDateParts } from '../date-utils.js';

describe('toParisDateParts()', () => {
  it('returns Tuesday parts for 2026-05-12T09:30:00+02:00 (CEST)', () => {
    const parts = toParisDateParts(new Date('2026-05-12T09:30:00+02:00'));
    expect(parts.weekday).toBe('Mar');
    expect(parts.hour).toBe(9);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(5);
    expect(parts.day).toBe(12);
  });

  it('handles DST boundary correctly (winter time UTC+1)', () => {
    // 2026-01-12 09:30 UTC = 10:30 Paris (CET, UTC+1)
    const parts = toParisDateParts(new Date('2026-01-12T09:30:00Z'));
    expect(parts.weekday).toBe('Lun');
    expect(parts.hour).toBe(10);
  });
});

describe('toIsoWeekId()', () => {
  it('returns 2026-W20 for 2026-05-12 (a Tuesday in May)', () => {
    const parts = toParisDateParts(new Date('2026-05-12T09:30:00+02:00'));
    expect(toIsoWeekId(parts)).toBe('2026-W20');
  });

  it('returns 2026-W01 for Jan 2 (Fri, in the week of Thursday Jan 1)', () => {
    // ISO 8601 : la semaine 1 contient le premier jeudi de l'année.
    // 2026-01-01 est un jeudi → 2026-W01 = lundi 29/12/2025 → dimanche 04/01/2026.
    // 2026-01-05 (lundi) est donc déjà la W02 — fixture choisie en conséquence.
    const parts = toParisDateParts(new Date('2026-01-02T10:00:00+01:00'));
    expect(toIsoWeekId(parts)).toBe('2026-W01');
  });
});

describe('toHourBucket()', () => {
  it.each([
    [6, '06h-08h'],
    [7, '06h-08h'],
    [8, '08h-10h'],
    [9, '08h-10h'],
    [11, '10h-12h'],
    [13, '12h-14h'],
    [16, '14h-17h'],
    [18, '17h-19h'],
    [20, '19h-21h'],
    [22, 'autre'],
    [3, 'autre'],
  ])('hour %i maps to bucket %s', (hour, expected) => {
    expect(toHourBucket(hour)).toBe(expected);
  });
});

describe('parsePublishedAt()', () => {
  it('parses an ISO string', () => {
    const d = parsePublishedAt('2026-05-12T09:30:00+02:00');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getTime()).toBe(new Date('2026-05-12T07:30:00Z').getTime());
  });

  it('parses a unix timestamp in seconds', () => {
    const d = parsePublishedAt(1747035000); // 2025-05-12T08:50 UTC ish
    expect(d).toBeInstanceOf(Date);
  });

  it('parses a unix timestamp in milliseconds', () => {
    const ms = Date.UTC(2026, 4, 12, 9, 30, 0);
    const d = parsePublishedAt(ms);
    expect(d?.getTime()).toBe(ms);
  });

  it('parses a harvestapi-style object { date, timestamp }', () => {
    const d = parsePublishedAt({ date: '2026-05-12T09:30:00+02:00', timestamp: 1234567890 });
    expect(d?.getTime()).toBe(new Date('2026-05-12T07:30:00Z').getTime());
  });

  it('returns null for invalid input', () => {
    expect(parsePublishedAt('not a date')).toBeNull();
    expect(parsePublishedAt(null)).toBeNull();
    expect(parsePublishedAt({})).toBeNull();
  });
});
