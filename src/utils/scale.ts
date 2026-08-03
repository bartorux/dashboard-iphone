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
