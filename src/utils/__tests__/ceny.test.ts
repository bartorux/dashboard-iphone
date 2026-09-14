import { describe, it, expect } from 'vitest';
import { archiveLines, normalizeDay, pricesFile } from '../ceny';
import type { PriceDay } from '../cenyTypes';
import confirmedFixture from '../__fixtures__/pradcast-confirmed.json';
import forecastFixture from '../__fixtures__/pradcast-forecast-d2.json';

/**
 * Deep-clones a fixture so a test mutating it never leaks into another.
 * Typed `any` on purpose: several tests poke a field with a value the real
 * fixture's inferred literal type would reject (e.g. p10 is always `null` in
 * the confirmed fixture, so TS would infer the property type as `null`
 * itself) — the whole point here is to feed `normalizeDay` something a real
 * `unknown` payload could actually contain.
 */
function clone(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

describe('normalizeDay', () => {
  it('reads a confirmed TGE fixing day, forcing p10/p90 null', () => {
    const day = normalizeDay(confirmedFixture);
    expect(day).not.toBeNull();
    expect(day?.date).toBe('2026-09-14');
    expect(day?.source).toBe('confirmed');
    expect(day?.horizon).toBeNull();
    expect(day?.confidence).toBeNull();
    expect(day?.hours).toHaveLength(24);
    expect(day?.hours[0]).toEqual({ hour: 0, price: 828.37, p10: null, p90: null });
    expect(day?.hours[23]).toEqual({ hour: 23, price: 923.29, p10: null, p90: null });
  });

  it('reads a forecast day, keeping horizon, confidence and the band', () => {
    const day = normalizeDay(forecastFixture);
    expect(day).not.toBeNull();
    expect(day?.source).toBe('forecast');
    expect(day?.horizon).toBe('D+2');
    expect(day?.confidence).toBe('medium');
    expect(day?.hours[0]).toEqual({ hour: 0, price: 714.9, p10: 583.45, p90: 961.16 });
  });

  it('forces p10/p90 null on a confirmed day even if the payload sent numbers', () => {
    const payload = clone(confirmedFixture);
    payload.prices[0].p10 = 100;
    payload.prices[0].p90 = 200;
    const day = normalizeDay(payload);
    expect(day?.hours[0].p10).toBeNull();
    expect(day?.hours[0].p90).toBeNull();
  });

  it('rejects an unknown source for the whole day', () => {
    const payload = clone(confirmedFixture);
    (payload as unknown as { source: string }).source = 'tge_fixing2';
    expect(normalizeDay(payload)).toBeNull();
  });

  it('rejects a day with no prices array', () => {
    const payload = clone(confirmedFixture) as Record<string, unknown>;
    delete payload.prices;
    expect(normalizeDay(payload)).toBeNull();
  });

  it('rejects a day whose prices array is empty', () => {
    const payload = clone(confirmedFixture);
    payload.prices = [];
    expect(normalizeDay(payload)).toBeNull();
  });

  it('rejects the whole day on one hour outside 0-23', () => {
    const payload = clone(confirmedFixture);
    payload.prices[5].hour = 24;
    expect(normalizeDay(payload)).toBeNull();
  });

  it('rejects the whole day on a negative hour', () => {
    const payload = clone(confirmedFixture);
    payload.prices[5].hour = -1;
    expect(normalizeDay(payload)).toBeNull();
  });

  it('rejects the whole day on a price that is not a number', () => {
    const payload = clone(confirmedFixture) as { prices: Array<Record<string, unknown>> };
    payload.prices[5].price = 'drogo';
    expect(normalizeDay(payload)).toBeNull();
  });

  it('rejects the whole day on a non-finite price', () => {
    const payload = clone(confirmedFixture);
    payload.prices[5].price = Number.POSITIVE_INFINITY;
    expect(normalizeDay(payload)).toBeNull();
  });

  it('falls back to null horizon on an unrecognised value, without spoiling the day', () => {
    const payload = clone(forecastFixture) as Record<string, unknown>;
    payload.horizon = 'D+9';
    const day = normalizeDay(payload);
    expect(day).not.toBeNull();
    expect(day?.horizon).toBeNull();
    expect(day?.hours).toHaveLength(24);
  });

  it('falls back to null confidence on an unrecognised value, without spoiling the day', () => {
    const payload = clone(forecastFixture) as Record<string, unknown>;
    payload.confidence = 'certain';
    const day = normalizeDay(payload);
    expect(day).not.toBeNull();
    expect(day?.confidence).toBeNull();
  });

  it('rejects a non-object payload', () => {
    expect(normalizeDay(null)).toBeNull();
    expect(normalizeDay('not an object')).toBeNull();
    expect(normalizeDay(42)).toBeNull();
  });

  it('rejects a payload with a malformed date', () => {
    const payload = clone(confirmedFixture);
    payload.date = '14-09-2026';
    expect(normalizeDay(payload)).toBeNull();
  });
});

describe('pricesFile', () => {
  const now = new Date('2026-09-14T12:00:00Z');

  function day(overrides: Partial<PriceDay> = {}): PriceDay {
    return {
      date: '2026-09-14',
      source: 'confirmed',
      horizon: null,
      confidence: null,
      hours: [{ hour: 0, price: 800, p10: null, p90: null }],
      ...overrides,
    };
  }

  it('stamps changedAt with now when there is no previous file', () => {
    const file = pricesFile([day()], null, now);
    expect(file.changedAt).toBe(now.toISOString());
    expect(file.source).toBe('pradcast.pl');
    expect(file.days).toEqual([day()]);
  });

  it('keeps the previous changedAt when the days are identical', () => {
    const previous = { changedAt: '2026-09-14T09:00:00Z', source: 'pradcast.pl' as const, days: [day()] };
    const file = pricesFile([day()], previous, now);
    expect(file.changedAt).toBe('2026-09-14T09:00:00Z');
  });

  it('refreshes changedAt when an hour price changed', () => {
    const previous = { changedAt: '2026-09-14T09:00:00Z', source: 'pradcast.pl' as const, days: [day()] };
    const changed = day({ hours: [{ hour: 0, price: 801, p10: null, p90: null }] });
    const file = pricesFile([changed], previous, now);
    expect(file.changedAt).toBe(now.toISOString());
  });

  it('refreshes changedAt when a day was added', () => {
    const previous = { changedAt: '2026-09-14T09:00:00Z', source: 'pradcast.pl' as const, days: [day()] };
    const file = pricesFile([day(), day({ date: '2026-09-15' })], previous, now);
    expect(file.changedAt).toBe(now.toISOString());
  });

  it('refreshes changedAt when horizon or confidence changed', () => {
    const previous = {
      changedAt: '2026-09-14T09:00:00Z',
      source: 'pradcast.pl' as const,
      days: [day({ source: 'forecast', horizon: 'D+2', confidence: 'medium' })],
    };
    const changed = day({ source: 'forecast', horizon: 'D+2', confidence: 'low' });
    const file = pricesFile([changed], previous, now);
    expect(file.changedAt).toBe(now.toISOString());
  });
});

describe('archiveLines', () => {
  const now = new Date('2026-09-14T20:00:00Z');

  function confirmedDay(hourly: number[], date = '2026-09-14'): PriceDay {
    return {
      date,
      source: 'confirmed',
      horizon: null,
      confidence: null,
      hours: hourly.map((price, hour) => ({ hour, price, p10: null, p90: null })),
    };
  }

  const fullDay = Array.from({ length: 24 }, (_, hour) => 800 + hour);

  it('appends a line for a new confirmed 24-hour day', () => {
    const lines = archiveLines([confirmedDay(fullDay)], '', now);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(['2026-09-14', fullDay, now.toISOString()]);
  });

  it('skips a day already archived with identical prices', () => {
    const existing = `${JSON.stringify(['2026-09-14', fullDay, '2026-09-14T19:00:00Z'])}\n`;
    const lines = archiveLines([confirmedDay(fullDay)], existing, now);
    expect(lines).toHaveLength(0);
  });

  it('appends a new line when the archived prices changed, later winning', () => {
    const older = [...fullDay];
    older[10] = 1;
    const existing = `${JSON.stringify(['2026-09-14', older, '2026-09-14T19:00:00Z'])}\n`;
    const lines = archiveLines([confirmedDay(fullDay)], existing, now);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(['2026-09-14', fullDay, now.toISOString()]);
  });

  it('never archives a forecast day', () => {
    const forecast: PriceDay = {
      date: '2026-09-16',
      source: 'forecast',
      horizon: 'D+2',
      confidence: 'medium',
      hours: fullDay.map((price, hour) => ({ hour, price, p10: price - 10, p90: price + 10 })),
    };
    expect(archiveLines([forecast], '', now)).toHaveLength(0);
  });

  it('skips a confirmed day that is not exactly 24 hours (DST)', () => {
    const short = confirmedDay(fullDay.slice(0, 23));
    expect(archiveLines([short], '', now)).toHaveLength(0);
  });

  it('skips a confirmed day with a duplicate hour', () => {
    const withDuplicate = confirmedDay(fullDay);
    withDuplicate.hours[23] = { ...withDuplicate.hours[23], hour: 22 };
    expect(archiveLines([withDuplicate], '', now)).toHaveLength(0);
  });

  it('ignores an unparseable line already in the archive rather than throwing', () => {
    const existing = 'not json at all\n';
    const lines = archiveLines([confirmedDay(fullDay)], existing, now);
    expect(lines).toHaveLength(1);
  });

  it('ignores a malformed archive line (wrong shape) and still archives the new day', () => {
    const existing = `${JSON.stringify(['2026-09-14', [1, 2, 3]])}\n`; // only 24 entries required, and no archivedAt
    const lines = archiveLines([confirmedDay(fullDay)], existing, now);
    expect(lines).toHaveLength(1);
  });

  it('dedupes two days for the same date within one call against each other', () => {
    const lines = archiveLines([confirmedDay(fullDay), confirmedDay(fullDay)], '', now);
    expect(lines).toHaveLength(1);
  });
});
