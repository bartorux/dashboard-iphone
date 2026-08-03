/**
 * Steps an axis is allowed to use. Anything else produces labels like 393 / 786.
 */
export const NICE_STEPS = [
  1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000,
  25000, 50000,
] as const;

const MIN_TICKS = 4;
const MAX_TICKS = 7;
const HEADROOM = 1.05;

export interface Scale {
  /** Upper bound of the axis domain — always a multiple of the tick step. */
  max: number;
  /** Tick positions, starting at 0 and ending exactly at `max`. */
  ticks: number[];
}

/**
 * Build a Y axis that only ever shows round numbers.
 *
 * Picks the smallest allowed step that fits the data into MIN_TICKS..MAX_TICKS
 * labels, then rounds the domain up to a multiple of it. Falls back to a sane
 * scale for empty data — `Math.max(...[])` is -Infinity, which used to reach
 * the axis untouched.
 */
export function niceScale(dataMax: number): Scale {
  const safeMax = Number.isFinite(dataMax) && dataMax > 0 ? dataMax : 1000;
  const target = safeMax * HEADROOM;

  for (const step of NICE_STEPS) {
    const intervals = Math.ceil(target / step);
    if (intervals + 1 < MIN_TICKS || intervals + 1 > MAX_TICKS) continue;

    const max = step * intervals;
    if (max < safeMax) continue;

    return {
      max,
      ticks: Array.from({ length: intervals + 1 }, (_, i) => i * step),
    };
  }

  // Larger than the biggest allowed step — scale the step to the data instead.
  const step = Math.ceil(target / MIN_TICKS);
  return {
    max: step * MIN_TICKS,
    ticks: Array.from({ length: MIN_TICKS + 1 }, (_, i) => i * step),
  };
}

export interface RangeScale extends Scale {
  min: number;
}

/**
 * Same idea as niceScale, but for series that go below zero — a reserve margin
 * does, whenever available capacity fails to cover what is required. Zero always
 * lands on a tick, so the sign of a value is readable from the axis alone.
 */
export function niceScaleRange(
  dataMin: number,
  dataMax: number
): RangeScale {
  const lo = Number.isFinite(dataMin) ? Math.min(dataMin, 0) : 0;
  const hi = Number.isFinite(dataMax) && dataMax > 0 ? dataMax : 1000;
  const padding = (hi - lo) * 0.05 || 100;

  for (const step of NICE_STEPS) {
    const min = Math.floor((lo - padding) / step) * step;
    const max = Math.ceil((hi + padding) / step) * step;
    const count = Math.round((max - min) / step) + 1;
    if (count < MIN_TICKS || count > MAX_TICKS) continue;

    return {
      min,
      max,
      ticks: Array.from({ length: count }, (_, i) => min + i * step),
    };
  }

  const step = Math.ceil((hi - lo + 2 * padding) / MIN_TICKS) || 1;
  const min = Math.floor((lo - padding) / step) * step;
  return {
    min,
    max: min + step * MIN_TICKS,
    ticks: Array.from({ length: MIN_TICKS + 1 }, (_, i) => min + i * step),
  };
}
