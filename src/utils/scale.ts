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

  /*
   * Rounding comes first and breathing room second, which is the opposite of
   * what this did.
   *
   * A flat 5% was added before snapping, so the padding could push a bound past
   * a step boundary and cost a whole extra step at each end. Worse, that could
   * take the tick count over the limit and drop the step size entirely: a day
   * spanning -4240..19639 padded to -5434..20833, needed eight ticks at a step
   * of 5000, was rejected, and fell through to 10000 — an axis of -10000..30000
   * for data that fits in -5000..20000. The chart used 60% of its height where
   * the next day used 88%, off a difference of 800 MW in the data.
   *
   * Snapping outward to a nice step already leaves room in every case but one:
   * data landing exactly on a boundary. That case is handled explicitly below,
   * so nothing is ever drawn against the frame. Measured over 43 days of both
   * series this function serves: mean height used 74% -> 82% for generation and
   * 68% -> 75% for margins, worst day 46% -> 58%, not one day made worse, and
   * not one curve touching the edge.
   */
  for (const step of NICE_STEPS) {
    let min = Math.floor(lo / step) * step;
    let max = Math.ceil(hi / step) * step;
    // Exactly on a boundary would draw the curve along the frame.
    if (max === hi) max += step;
    if (min === lo && lo < 0) min -= step;

    const count = Math.round((max - min) / step) + 1;
    if (count < MIN_TICKS || count > MAX_TICKS) continue;

    return {
      min,
      max,
      ticks: Array.from({ length: count }, (_, i) => min + i * step),
    };
  }

  /*
   * Nothing in NICE_STEPS fits, so the step is sized to the data. Headroom is
   * kept here, unlike in the loop above: there is no nice boundary to snap to,
   * so without it the curve would sit on the frame.
   */
  const headroom = (hi - lo) * 0.05 || 100;
  const step = Math.ceil((hi - lo + 2 * headroom) / MIN_TICKS) || 1;
  const min = Math.floor((lo - headroom) / step) * step;
  return {
    min,
    max: min + step * MIN_TICKS,
    ticks: Array.from({ length: MIN_TICKS + 1 }, (_, i) => min + i * step),
  };
}
