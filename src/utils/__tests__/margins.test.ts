import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getAvailableReserve,
  getValidMargins,
  getValidReserves,
  processData,
  getDataForDay,
  safeAvg,
} from '../dataTransform';
import { makePoint } from '../../test/factories';
import { PSERawItem } from '../../types';

import fixture from '../__fixtures__/pse-reserve-vs-margin.json';

const RAW = (fixture as { value: PSERawItem[] }).value;

afterEach(() => vi.useRealTimers());

describe('getValidMargins', () => {
  it('returns available minus required', () => {
    expect(
      getValidMargins([makePoint({ reserve: 2500, required: 1800 })])
    ).toEqual([700]);
  });

  it('reports a deficit as a negative number rather than clamping it', () => {
    expect(
      getValidMargins([makePoint({ reserve: 1663, required: 1818 })])
    ).toEqual([-155]);
  });

  it('skips a point when either part is missing, instead of treating it as zero', () => {
    const margins = getValidMargins([
      makePoint({ reserve: 2000, required: 1000 }),
      makePoint({ reserve: null }),
      makePoint({ required: null }),
      makePoint({ reserve: null, required: null }),
    ]);

    expect(margins).toEqual([1000]);
  });

  it('returns nothing for empty data', () => {
    expect(getValidMargins([])).toEqual([]);
  });
});

describe('reserve and margin can disagree — real PSE data', () => {
  it('moves in opposite directions between 2 and 3 August 2026', () => {
    // The card used to average raw reserve, so this pair rendered as a green
    // "+157 MW" improvement while the usable margin actually fell.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12));

    const points = processData(RAW);
    const first = getDataForDay(points, 0);
    const second = getDataForDay(points, 1);

    const reserveChange =
      safeAvg(getValidReserves(second))! - safeAvg(getValidReserves(first))!;
    const marginChange =
      safeAvg(getValidMargins(second))! - safeAvg(getValidMargins(first))!;

    expect(reserveChange).toBeGreaterThan(0);
    expect(marginChange).toBeLessThan(0);
  });
});

describe('getAvailableReserve', () => {
  it('reads the TSO surplus', () => {
    expect(getAvailableReserve({ surplus_cap_avail_tso: 3359 } as PSERawItem)).toBe(
      3359
    );
  });

  it('never substitutes available capacity for the surplus', () => {
    // These measure different things: on 2026-08-03 the surplus averaged 3359 MW
    // while available capacity averaged 14 965 MW. Falling back would have
    // reported a +13 273 MW margin instead of +1 667 MW — a calm "OK" during a
    // real alarm. This test fails if the fallback ever comes back.
    const reserve = getAvailableReserve({
      surplus_cap_avail_tso: null,
      avail_cap_gen_units_stor_prov: 14965,
    } as PSERawItem);

    expect(reserve).toBeNull();
  });

  it('reports absence as null rather than zero', () => {
    expect(getAvailableReserve({} as PSERawItem)).toBeNull();
    expect(
      getAvailableReserve({ surplus_cap_avail_tso: 'nonsense' } as PSERawItem)
    ).toBeNull();
  });
});
