import { describe, it, expect } from 'vitest';
import { RedispatchHour } from '../redispatch';
import {
  parseRedispatchCache,
  readCachedRedispatch,
  redispatchTtlMs,
  withRedispatchEntry,
  REDISPATCH_TTL_EMPTY_MS,
  REDISPATCH_TTL_NONEMPTY_MS,
} from '../redispatchCache';

const HOUR: RedispatchHour = {
  hourStartMs: 0,
  businessDate: '2026-08-04',
  pvRed: -500,
  windRed: 0,
};

describe('parseRedispatchCache', () => {
  it('returns an empty object for missing or junk storage', () => {
    expect(parseRedispatchCache(null)).toEqual({});
    expect(parseRedispatchCache(undefined)).toEqual({});
    expect(parseRedispatchCache('')).toEqual({});
    expect(parseRedispatchCache('not json')).toEqual({});
    expect(parseRedispatchCache('42')).toEqual({});
    expect(parseRedispatchCache('null')).toEqual({});
  });

  it('parses a well-formed cache', () => {
    const raw = JSON.stringify({ '2026-08-04': { rows: [HOUR], validUntil: 100 } });
    expect(parseRedispatchCache(raw)).toEqual({
      '2026-08-04': { rows: [HOUR], validUntil: 100 },
    });
  });
});

describe('redispatchTtlMs', () => {
  it('gives an empty day the shorter TTL, so a future date without a publication yet keeps refetching every 15 minutes rather than sitting silent for an hour', () => {
    expect(redispatchTtlMs([])).toBe(REDISPATCH_TTL_EMPTY_MS);
  });

  it('gives a day with real rows the full hour', () => {
    expect(redispatchTtlMs([HOUR])).toBe(REDISPATCH_TTL_NONEMPTY_MS);
  });
});

describe('readCachedRedispatch', () => {
  it('is null when the date was never cached', () => {
    expect(readCachedRedispatch({}, '2026-08-04', 0)).toBeNull();
  });

  it('returns the rows while still within validUntil', () => {
    const cache = { '2026-08-04': { rows: [HOUR], validUntil: 1000 } };
    expect(readCachedRedispatch(cache, '2026-08-04', 999)).toEqual([HOUR]);
  });

  it('is null once now reaches validUntil', () => {
    const cache = { '2026-08-04': { rows: [HOUR], validUntil: 1000 } };
    expect(readCachedRedispatch(cache, '2026-08-04', 1000)).toBeNull();
    expect(readCachedRedispatch(cache, '2026-08-04', 1001)).toBeNull();
  });
});

describe('withRedispatchEntry', () => {
  it('adds a new entry with a TTL computed from the rows it was given', () => {
    const next = withRedispatchEntry({}, '2026-08-04', [HOUR], 1000, ['2026-08-04']);

    expect(next['2026-08-04']).toEqual({
      rows: [HOUR],
      validUntil: 1000 + REDISPATCH_TTL_NONEMPTY_MS,
    });
  });

  it('drops entries for dates outside the kept window', () => {
    const cache = {
      '2026-07-01': { rows: [HOUR], validUntil: 999999999999 },
      '2026-08-04': { rows: [HOUR], validUntil: 999999999999 },
    };

    const next = withRedispatchEntry(cache, '2026-08-04', [HOUR], 1000, ['2026-08-04', '2026-08-05']);

    expect(Object.keys(next).sort()).toEqual(['2026-08-04']);
  });

  it('keeps the date being written even if it is not itself in keepDates', () => {
    // Defensive: the caller passing the day just fetched is the contract, but
    // the day being written must never disappear from its own update.
    const next = withRedispatchEntry({}, '2026-08-04', [HOUR], 1000, []);

    expect(next['2026-08-04']).toBeDefined();
  });

  it('preserves other kept dates untouched', () => {
    const cache = {
      '2026-08-05': { rows: [], validUntil: 555 },
    };

    const next = withRedispatchEntry(cache, '2026-08-04', [HOUR], 1000, ['2026-08-05']);

    expect(next['2026-08-05']).toEqual({ rows: [], validUntil: 555 });
  });
});
