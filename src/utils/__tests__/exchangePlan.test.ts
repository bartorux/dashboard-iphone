import { describe, it, expect } from 'vitest';
import {
  datesAwaitingExchangePlan,
  provisionalCaveat,
  exchangeArrivedAt,
  exchangePlanned,
  plannedByReading,
  readingHasExchange,
  EXCHANGE_PLACEHOLDER_ABS_MW,
  EXCHANGE_PLAN_MIN_PEAK_MW,
} from '../exchangePlan';

/**
 * The placeholder PSE published for 24.09 as read on 22.09: a few megawatts
 * that differ between the night hours and the rest — not one flat figure.
 */
const PLACEHOLDER_24_09 = [-14, -17, -18, -17, -14, -18, -17, ...Array.from({ length: 17 }, () => -9)];

describe('exchangePlanned', () => {
  it('is false for the flat placeholder PSE publishes before the day-ahead market', () => {
    expect(exchangePlanned(Array.from({ length: 24 }, () => ({ exchange: -12 })))).toBe(false);
    expect(exchangePlanned(Array.from({ length: 24 }, () => ({ exchange: 0 })))).toBe(false);
  });

  it('is true once the exchange varies hour by hour', () => {
    expect(exchangePlanned([{ exchange: -12 }, { exchange: 1882 }, { exchange: 2994 }])).toBe(true);
  });

  it('is false for a placeholder that varies by a few megawatts (24.09 as seen on 22.09)', () => {
    expect(exchangePlanned(PLACEHOLDER_24_09.map((exchange) => ({ exchange })))).toBe(false);
  });

  it('draws the line at the measured gap: 408 MW was a placeholder, 1033 MW a plan', () => {
    expect(exchangePlanned([{ exchange: -12 }, { exchange: 408 }])).toBe(false);
    expect(exchangePlanned([{ exchange: 0 }, { exchange: -1033 }])).toBe(true);
    expect(exchangePlanned([{ exchange: EXCHANGE_PLAN_MIN_PEAK_MW - 1 }])).toBe(false);
    expect(exchangePlanned([{ exchange: -EXCHANGE_PLAN_MIN_PEAK_MW }])).toBe(true);
  });

  it('ignores nulls and is false with nothing to go on', () => {
    expect(exchangePlanned([{ exchange: null }, { exchange: null }])).toBe(false);
    expect(exchangePlanned([])).toBe(false);
  });
});

describe('readingHasExchange (fallback for readings serialized without the day flag)', () => {
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

describe('plannedByReading', () => {
  const at = (hh: string) => `2026-09-23T${hh}:00Z`;
  const firstReading = PLACEHOLDER_24_09.map((exchange, hour) => ({ hour, readAt: at('09:15'), exchange }));

  it('judges the whole day at each reading, not the hour a row happens to describe', () => {
    const rows = [
      ...firstReading,
      // The plan lands: the evening swings to thousands, noon passes through zero.
      { hour: 12, readAt: at('11:15'), exchange: 0 },
      { hour: 19, readAt: at('11:15'), exchange: 3120 },
      // A later reading changes only the noon hour — still a planned day.
      { hour: 12, readAt: at('12:00'), exchange: 14 },
    ];
    const planned = plannedByReading(rows);
    expect(planned.get(at('09:15'))).toBe(false);
    expect(planned.get(at('11:15'))).toBe(true);
    expect(planned.get(at('12:00'))).toBe(true);
  });

  it('keeps a varying placeholder a placeholder, however many readings repeat it', () => {
    const rows = [...firstReading, { hour: 3, readAt: at('09:30'), exchange: -16 }];
    const planned = plannedByReading(rows);
    expect(planned.get(at('09:15'))).toBe(false);
    expect(planned.get(at('09:30'))).toBe(false);
  });

  it('sorts rows itself: handed newest first, a one-hour update still sees the whole planned day', () => {
    const rows = [
      { hour: 12, readAt: at('12:00'), exchange: 14 },
      { hour: 19, readAt: at('11:15'), exchange: 3120 },
      ...firstReading,
    ];
    const planned = plannedByReading(rows);
    expect(planned.get(at('09:15'))).toBe(false);
    expect(planned.get(at('12:00'))).toBe(true);
  });

  it('reads a day archived before the exchange column as planned', () => {
    const rows = [
      { hour: 19, readAt: at('10:00'), exchange: null },
      { hour: 18, readAt: at('08:00'), exchange: null },
    ];
    const planned = plannedByReading(rows);
    expect(planned.get(at('08:00'))).toBe(true);
    expect(planned.get(at('10:00'))).toBe(true);
  });
});

describe('exchangeArrivedAt', () => {
  it('returns the readAt of the first real-exchange reading that follows a placeholder one', () => {
    const readings = [
      { readAt: '2026-09-08T10:00:00Z', planned: false },
      { readAt: '2026-09-08T11:15:00Z', planned: false },
      { readAt: '2026-09-08T11:30:00Z', planned: true }, // the transition
      { readAt: '2026-09-08T12:00:00Z', planned: true }, // still real: not this one
    ];
    expect(exchangeArrivedAt(readings)).toBe('2026-09-08T11:30:00Z');
  });

  it('returns null when the series never transitions — still only the placeholder', () => {
    const readings = [
      { readAt: '2026-09-10T10:00:00Z', planned: false },
      { readAt: '2026-09-10T11:00:00Z', planned: false },
    ];
    expect(exchangeArrivedAt(readings)).toBeNull();
  });

  it('returns null when the day had a real exchange from its very first reading', () => {
    const readings = [
      { readAt: '2026-09-08T06:00:00Z', planned: true },
      { readAt: '2026-09-08T07:00:00Z', planned: true },
    ];
    expect(exchangeArrivedAt(readings)).toBeNull();
  });

  it('returns null for an empty series', () => {
    expect(exchangeArrivedAt([])).toBeNull();
  });
});

describe('datesAwaitingExchangePlan', () => {
  const hours = (date: string, exchange: number | null, reserve: number | null = 2000) =>
    Array.from({ length: 24 }, () => ({ businessDate: date, exchange, reserve }));
  const evening = (date: string) =>
    Array.from({ length: 24 }, (_, hour) => ({ businessDate: date, exchange: hour >= 17 ? 2300 : -400, reserve: 2000 }));

  it('names the days that carry only the placeholder, and not the ones with a plan', () => {
    const points = [...evening('2026-10-28'), ...evening('2026-10-29'), ...hours('2026-10-30', -12), ...hours('2026-11-02', 0)];
    expect(datesAwaitingExchangePlan(points)).toEqual(new Set(['2026-10-30', '2026-11-02']));
  });

  it('judges each day on its own hours — a varying placeholder of a few tens of MW is still a placeholder', () => {
    const points = Array.from({ length: 24 }, (_, hour) => ({ businessDate: '2026-10-30', exchange: -62 + hour * 3, reserve: 2000 }));
    expect(datesAwaitingExchangePlan(points)).toEqual(new Set(['2026-10-30']));
  });

  it('leaves out a day with no readings at all — nothing fetched yet is not "unplanned"', () => {
    expect(datesAwaitingExchangePlan(hours('2026-10-30', null, null))).toEqual(new Set());
  });
});

describe('provisionalCaveat', () => {
  // Local wall clock, as the app runs in Europe/Warsaw (the suite is pinned to it).
  const at = (iso: string) => new Date(iso);

  it('names the day the plan will come, two days ahead: "w czw. 29.10"', () => {
    expect(provisionalCaveat('2026-10-30', at('2026-10-28T19:13:00'))).toBe(
      'Ocena wstępna: rezerwa jest liczona bez importu, bo PSE poda plan wymiany z zagranicą na tę dobę dopiero w czw. 29.10 około 13:00–13:45 — do tego czasu margines wieczorem jest zwykle zaniżony o 1–1,4 GW, a w południe zawyżony.'
    );
  });

  it('says "we wt." for a Tuesday, as "we wtorek", and names Sunday for a Monday', () => {
    expect(provisionalCaveat('2026-10-28', at('2026-10-26T10:00:00'))).toContain('dopiero we wt. 27.10 około');
    expect(provisionalCaveat('2026-11-02', at('2026-10-29T10:00:00'))).toContain('dopiero w niedz. 01.11 około');
  });

  it('says "dziś" for tomorrow until the window closes, then that the plan is late', () => {
    expect(provisionalCaveat('2026-10-29', at('2026-10-28T09:00:00'))).toContain('dopiero dziś około 13:00–13:45');
    expect(provisionalCaveat('2026-10-29', at('2026-10-28T13:44:00'))).toContain('dopiero dziś około');
    const late = provisionalCaveat('2026-10-29', at('2026-10-28T13:45:00'));
    expect(late).toContain('jeszcze nie doszedł (zwykle do 13:45)');
    expect(late).not.toContain('dopiero');
  });

  it('calls a plan missing on the day itself late as well', () => {
    expect(provisionalCaveat('2026-10-28', at('2026-10-28T08:00:00'))).toContain('jeszcze nie doszedł');
  });
});

