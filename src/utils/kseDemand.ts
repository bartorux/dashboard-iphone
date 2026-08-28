import { PSEKseDemandRawItem } from '../types';
import { parsePseUtc } from './dateHelpers';
import { hourBucketOf } from './redispatch';

/**
 * Country-wide demand per hour, averaged from pdgobpkd's 15-minute rows.
 *
 * Exists for one sentence in the generation tooltip: "OZE covers X% of the
 * country's demand". The percentage this app used to print divided total OZE
 * (prosumers included) by GRID generation (prosumers excluded) and reached 93%
 * on an ordinary noon; kse_pow_dem is the denominator that actually contains
 * everything the numerator does. Published for the current day only — on
 * future days the map is empty and the tooltip simply omits the line.
 *
 * Same conventions as processRedispatch, for the same reasons: dtime_utc
 * stamps the END of each quarter (hourBucketOf handles the boundary), the
 * hour's value is the average of the quarters actually present.
 */
export function processKseDemand(
  raw: PSEKseDemandRawItem[]
): Map<number, number> {
  const buckets = new Map<number, { sum: number; count: number }>();

  for (const row of raw) {
    const instant = parsePseUtc(row.dtime_utc ?? '');
    if (!instant) continue;

    const value =
      typeof row.kse_pow_dem === 'number'
        ? row.kse_pow_dem
        : parseFloat(String(row.kse_pow_dem));
    if (!Number.isFinite(value)) continue;

    const key = hourBucketOf(instant.getTime());
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sum += value;
      bucket.count += 1;
    } else {
      buckets.set(key, { sum: value, count: 1 });
    }
  }

  const hours = new Map<number, number>();
  for (const [key, { sum, count }] of buckets) {
    hours.set(key, sum / count);
  }
  return hours;
}
