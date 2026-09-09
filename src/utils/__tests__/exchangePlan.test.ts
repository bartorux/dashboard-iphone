import { describe, it, expect } from 'vitest';
import {
  exchangeArrivedAt,
  exchangePlanned,
  readingHasExchange,
  EXCHANGE_PLACEHOLDER_ABS_MW,
} from '../exchangePlan';

describe('exchangePlanned', () => {
  it('is false for the flat placeholder PSE publishes before the day-ahead market', () => {
    expect(exchangePlanned(Array.from({ length: 24 }, () => ({ exchange: -12 })))).toBe(false);
    expect(exchangePlanned(Array.from({ length: 24 }, () => ({ exchange: 0 })))).toBe(false);
  });

  it('is true once the exchange varies hour by hour', () => {
    expect(exchangePlanned([{ exchange: -12 }, { exchange: 1882 }, { exchange: 2994 }])).toBe(true);
  });

  it('ignores nulls and is false with nothing to go on', () => {
    expect(exchangePlanned([{ exchange: null }, { exchange: null }])).toBe(false);
    expect(exchangePlanned([])).toBe(false);
  });
});

describe('readingHasExchange', () => {
  it('treats the small placeholder as "not yet", a real value as planned, and unknown as planned', () => {
    expect(readingHasExchange(-12)).toBe(false);
    expect(readingHasExchange(0)).toBe(false);
    expect(readingHasExchange(EXCHANGE_PLACEHOLDER_ABS_MW)).toBe(false);
    expect(readingHasExchange(EXCHANGE_PLACEHOLDER_ABS_MW + 1)).toBe(true);
    expect(readingHasExchange(-2286)).toBe(true);
    expect(readingHasExchange(null)).toBe(true);
    expect(readingHasExchange(undefined)).toBe(true);
  });
});

describe('exchangeArrivedAt', () => {
  it('returns the readAt of the first real-exchange reading that follows a placeholder one', () => {
    const readings = [
      { readAt: '2026-09-08T10:00:00Z', exchange: -12 },
      { readAt: '2026-09-08T11:15:00Z', exchange: -12 },
      { readAt: '2026-09-08T11:30:00Z', exchange: 2941 }, // the transition
      { readAt: '2026-09-08T12:00:00Z', exchange: 3010 }, // still real: not this one
    ];
    expect(exchangeArrivedAt(readings)).toBe('2026-09-08T11:30:00Z');
  });

  it('returns null when the series never transitions — still only the placeholder', () => {
    const readings = [
      { readAt: '2026-09-10T10:00:00Z', exchange: -12 },
      { readAt: '2026-09-10T11:00:00Z', exchange: 0 },
    ];
    expect(exchangeArrivedAt(readings)).toBeNull();
  });

  it('returns null when the day had a real exchange from its very first reading', () => {
    const readings = [
      { readAt: '2026-09-08T06:00:00Z', exchange: 1900 },
      { readAt: '2026-09-08T07:00:00Z', exchange: 2100 },
    ];
    expect(exchangeArrivedAt(readings)).toBeNull();
  });

  it('returns null for an empty series', () => {
    expect(exchangeArrivedAt([])).toBeNull();
  });
});
