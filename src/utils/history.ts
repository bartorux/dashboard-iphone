import { PSEDataPoint } from '../types';

export interface HourDistribution {
  /** Start of the block, e.g. "19:00". */
  hourLabel: string;
  p10: number;
  p50: number;
  p90: number;
  samples: number;
}

/**
 * Linear-interpolated percentile over an ascending array.
 * Returns NaN for an empty input rather than pretending to have an answer.
 */
export function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Spread of the reserve margin for each hour of the day across past days.
 *
 * Buckets by the block's own hour label rather than by position in the array:
 * DST days carry 23 or 25 blocks, so an index-based bucket would smear every
 * later hour of those days into the wrong slot. The autumn "03a" block gets its
 * own bucket, which is what keeps the rest of that day straight — but the bucket
 * is then dropped, because one occurrence in a thirty-day window cannot support
 * a p10-p90 spread. That is correct, and worth saying plainly: an earlier note
 * here claimed the hour was kept.
 *
 * `minSamples` is why a successful download can still yield nothing. The caller
 * must not report that as a failed fetch — the two need different words, and
 * only one of them is worth a retry button.
 */
export function marginDistribution(
  points: PSEDataPoint[],
  minSamples = 3
): HourDistribution[] {
  const byHour = new Map<string, number[]>();

  for (const point of points) {
    if (point.reserve === null || point.required === null) continue;
    const margin = point.reserve - point.required;
    if (!Number.isFinite(margin)) continue;

    const bucket = byHour.get(point.hourLabel);
    if (bucket) bucket.push(margin);
    else byHour.set(point.hourLabel, [margin]);
  }

  return Array.from(byHour.entries())
    .filter(([, values]) => values.length >= minSamples)
    .map(([hourLabel, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        hourLabel,
        p10: percentile(sorted, 0.1),
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        samples: sorted.length,
      };
    })
    .sort((a, b) => a.hourLabel.localeCompare(b.hourLabel));
}

/** Where today's value sits inside the historical spread for the same hour. */
export type Standing = 'below' | 'typical' | 'above' | 'unknown';

export function standingFor(
  margin: number | null,
  distribution: HourDistribution | undefined
): Standing {
  if (margin === null || !distribution) return 'unknown';
  if (margin < distribution.p10) return 'below';
  if (margin > distribution.p90) return 'above';
  return 'typical';
}
