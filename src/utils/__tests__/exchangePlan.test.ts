import { describe, it, expect } from 'vitest';
import { exchangePlanned, readingHasExchange, EXCHANGE_PLACEHOLDER_ABS_MW } from '../exchangePlan';

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
