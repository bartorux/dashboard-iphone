import { PSERedispatchRawItem } from '../types';
import { HOUR_MS } from './constants';
import { parsePseUtc } from './dateHelpers';

export interface RedispatchHour {
  /** Epoch ms POCZATKU bloku godzinowego (UTC) — klucz laczenia z PSEDataPoint. */
  hourStartMs: number;
  businessDate: string;
  /** MW, <= 0. Suma network+balance, srednia z obecnych kwadransow. */
  pvRed: number;
  windRed: number;
}

function toNumber(value: string | number | null | undefined): number {
  // null means "nothing was curtailed this quarter", i.e. zero — not "no
  // reading". Treating it as missing would silently exclude quarters from the
  // average instead of counting them at zero.
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const BARE_UTC_STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/**
 * poze-redoze's `dtime_utc` is written WITHOUT seconds ("2026-08-26 22:15"),
 * unlike pk5l-wp's `plan_dtime_utc` ("2026-08-03 23:00:00") that
 * `parsePseUtc`'s regex was built for. Confirmed against a live response
 * fetched 2026-08-27: all 96 rows of the day omitted seconds. Padding the
 * stamp here — rather than loosening the shared regex — keeps pk5l-wp's
 * stricter contract untouched for every other caller of `parsePseUtc`.
 */
function parseRedispatchInstant(dtimeUtc: string | null | undefined): Date | null {
  if (!dtimeUtc) return null;
  const padded = BARE_UTC_STAMP.test(dtimeUtc) ? `${dtimeUtc}:00` : dtimeUtc;
  return parsePseUtc(padded);
}

/**
 * The hour block a 15-minute row belongs to, in UTC epoch ms.
 *
 * `dtime_utc` carries the END of the quarter (mirrors plan_dtime on pk5l-wp),
 * so the fourth quarter of every hour ends EXACTLY on the next hour mark —
 * e.g. 22:45-23:00 UTC reports dtime_utc "23:00". A plain
 * `Math.floor(ms / HOUR_MS) * HOUR_MS` would then file that quarter under
 * 23:00-24:00 instead of 22:00-23:00, silently shifting every hour of every
 * day by one quarter (verified on the live 2026-08-27 dump — this is not a
 * rare edge case, it happens 24 times a day). Flooring `ms - 1` instead
 * treats the timestamp as the exclusive end of the block it closes, which is
 * what it is.
 */
export function hourBucketOf(instantMs: number): number {
  return Math.floor((instantMs - 1) / HOUR_MS) * HOUR_MS;
}

interface Bucket {
  businessDate: string;
  pvSum: number;
  windSum: number;
  count: number;
}

/**
 * Groups 15-minute redispatch rows into hourly averages of MW curtailed.
 *
 * The bucket key is always the UTC hour, never a formatted local label: on
 * the autumn DST switch the local wall clock reads "02:00" twice for two
 * different hours, an hour apart in UTC. Bucketing by the local string would
 * collapse those two hours into one; bucketing by UTC epoch ms keeps them
 * apart, same as `parsePseUtc` is used everywhere else in this app for
 * exactly that reason.
 *
 * A row whose `dtime_utc` cannot be parsed is skipped rather than guessed at.
 */
export function processRedispatch(raw: PSERedispatchRawItem[]): RedispatchHour[] {
  const buckets = new Map<number, Bucket>();

  for (const item of raw) {
    const instant = parseRedispatchInstant(item.dtime_utc);
    if (!instant) continue;

    const hourStartMs = hourBucketOf(instant.getTime());
    const pv = toNumber(item.pv_red_network) + toNumber(item.pv_red_balance);
    const wind = toNumber(item.wi_red_network) + toNumber(item.wi_red_balance);

    const bucket = buckets.get(hourStartMs);
    if (bucket) {
      bucket.pvSum += pv;
      bucket.windSum += wind;
      bucket.count += 1;
    } else {
      buckets.set(hourStartMs, {
        businessDate: item.business_date,
        pvSum: pv,
        windSum: wind,
        count: 1,
      });
    }
  }

  return Array.from(buckets.entries())
    .map(([hourStartMs, bucket]) => ({
      hourStartMs,
      businessDate: bucket.businessDate,
      // Divided by however many quarters actually landed in this bucket, not
      // by 4 — the chart's unit is average hourly power (MW), and a partial
      // hour (a boundary row dropped, a day that starts mid-window) must not
      // read as a quieter hour than it was.
      pvRed: bucket.pvSum / bucket.count,
      windRed: bucket.windSum / bucket.count,
    }))
    .sort((a, b) => a.hourStartMs - b.hourStartMs);
}

export function redispatchByHour(hours: RedispatchHour[]): Map<number, RedispatchHour> {
  return new Map(hours.map((hour) => [hour.hourStartMs, hour]));
}

export function hasCurtailment(hours: RedispatchHour[]): boolean {
  return hours.some((hour) => hour.pvRed !== 0 || hour.windRed !== 0);
}
