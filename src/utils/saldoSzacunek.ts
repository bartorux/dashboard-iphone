import type { PSEPwmRdnRawItem, PSERawItem } from '../types';
import { polishHolidays } from './callPeriod';
import { exchangePlanned } from './exchangePlan';
import { blockStartHour, isPlausibleBusinessDate } from './pk5lArchive';

/**
 * An estimate of PSE's planned cross-border exchange for the days PSE has not
 * planned yet — from the day after tomorrow on always, and tomorrow until
 * about 13:15. Until the plan arrives pk5l-wp carries a placeholder (−12, 0,
 * up to ±400 MW), so the reserve it reports has no import in it.
 *
 * Stage 2 of the owner's decision of 28.10.2026: the generator computes and
 * logs it, nothing on screen reads it, and saldoOcena.ts measures it against
 * the plan that arrives. Alarms, colours, the badge, the AI text and the study
 * stay on PSE's own figures — measured against the notice deadline, feeding
 * the estimate into the reserve traded false alarms for misses (12/2/3
 * against 14/4/1 days).
 *
 * The predictor is the best of the simple ones in a backtest on PSE's final
 * plans 01.2025–10.2026 (E5): half the same hour of the last planned day, half
 * that hour's mean over the last four weeks' days of the target's type. Mean
 * error in 2026, hours 7–21, one day ahead: 1.07 GW against 1.47 GW for the
 * placeholder. From three days out the four-week profile alone does better.
 */

export type ExchangeDayType = 'working' | 'saturday' | 'holiday';

/** Sunday and public holidays together, a holiday Saturday included — as in the backtest. */
export function exchangeDayType(businessDate: string): ExchangeDayType {
  const [year, month, day] = businessDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0 || polishHolidays(year).has(businessDate)) return 'holiday';
  return weekday === 6 ? 'saturday' : 'working';
}

/** Planned exchange per business date and block-start hour (0–23), MW, import positive. */
export type ExchangeByDay = Map<string, Map<number, number>>;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Later rows win, so the live forecast can follow the history it overlaps. */
export function exchangeByDay(rows: readonly PSERawItem[]): ExchangeByDay {
  const byDay: ExchangeByDay = new Map();
  for (const row of rows) {
    const hour = blockStartHour(row.period);
    const exchange = toNumber(row.planned_exchange);
    if (typeof row.business_date !== 'string' || hour === null || exchange === null) continue;
    const day = byDay.get(row.business_date) ?? new Map<number, number>();
    day.set(hour, exchange);
    byDay.set(row.business_date, day);
  }
  return byDay;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, '0');

function dayMs(businessDate: string): number {
  const [year, month, day] = businessDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function shiftDate(businessDate: string, days: number): string {
  const date = new Date(dayMs(businessDate) + days * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Days the profile looks back over, the last planned day included. */
export const PROFILE_DAYS = 28;
/** Fewer days of the target's type than this and an hour gets no estimate. */
export const MIN_SAME_TYPE_DAYS = 3;
/** Up to this many days past the last plan E5 wins; from there on the profile alone. */
export const E5_MAX_HORIZON = 2;

/**
 * P10 and P90 of (plan − estimate) per block-start hour, MW, for one, two and
 * three-or-more days past the last plan. From PSE's final plans for every
 * planned day 01.01–28.10.2026 (300 days), computed exactly as
 * `estimateExchange` computes; the band held 80.3% of them in that sample.
 * The 2025 band held only 73.9% of 2026, which is why it is not used.
 * saldoOcena.ts measures how much it holds from here on.
 */
const BAND: Record<1 | 2 | 3, ReadonlyArray<readonly [number, number]>> = {
  1: [
    [-1788, 1562], [-1847, 1701], [-1857, 1713], [-1816, 1631], [-1839, 1613], [-1659, 1500],
    [-1555, 1671], [-1808, 1870], [-1905, 1912], [-2006, 2052], [-2123, 1937], [-2108, 2131],
    [-1991, 1890], [-1860, 1722], [-1730, 1620], [-1554, 1495], [-1434, 1307], [-1434, 1368],
    [-1332, 1400], [-1501, 1421], [-1540, 1375], [-1571, 1457], [-1550, 1408], [-1583, 1396],
  ],
  2: [
    [-1976, 1723], [-2000, 1849], [-2128, 1779], [-1987, 1762], [-1833, 1705], [-1727, 1608],
    [-1725, 1545], [-1908, 1591], [-2035, 1919], [-2190, 1783], [-2288, 2012], [-2043, 2202],
    [-2040, 2032], [-2020, 1801], [-1771, 1655], [-1564, 1591], [-1564, 1515], [-1498, 1589],
    [-1632, 1575], [-1587, 1637], [-1741, 1524], [-1738, 1561], [-1774, 1613], [-1795, 1530],
  ],
  3: [
    [-1709, 1604], [-1803, 1684], [-1895, 1705], [-1907, 1594], [-1779, 1620], [-1652, 1489],
    [-1587, 1386], [-1900, 1644], [-1963, 2035], [-2219, 2063], [-2316, 2098], [-2288, 1952],
    [-2331, 2022], [-2237, 1868], [-2163, 1697], [-1940, 1622], [-1638, 1547], [-1559, 1519],
    [-1547, 1708], [-1674, 1715], [-1844, 1652], [-1897, 1595], [-1659, 1713], [-1653, 1613],
  ],
};

export type EstimateMethod = 'e5' | 'profile' | 'pwm-rdn';

export interface HourEstimate {
  hour: number;
  mw: number;
  /** Null for pwm-rdn: a market result, not a guess with a spread. */
  p10: number | null;
  p90: number | null;
}

export interface DayEstimate {
  businessDate: string;
  /** The last planned day the estimate rests on. */
  basedOn: string;
  /** Days from `basedOn` to `businessDate`. */
  h: number;
  method: EstimateMethod;
  hours: HourEstimate[];
}

/** To 100 MW: a figure with a 3 GW band does not get to look exact. */
const round100 = (value: number) => Math.round(value / 100) * 100;

function isPlanned(day: ReadonlyMap<number, number> | undefined): boolean {
  return day !== undefined && exchangePlanned([...day.values()].map((exchange) => ({ exchange })));
}

/**
 * One estimate per target date that is not planned yet and has a planned day
 * before it. Planned is decided the way the app decides it (`exchangePlanned`),
 * and only planned days feed the profile — a placeholder averaged in would
 * pull every hour toward zero.
 */
export function estimateExchange(
  byDay: ExchangeByDay,
  targetDates: readonly string[]
): DayEstimate[] {
  const planned = [...byDay.keys()].filter((date) => isPlanned(byDay.get(date))).sort();
  const plannedSet = new Set(planned);
  const estimates: DayEstimate[] = [];

  for (const target of targetDates) {
    if (plannedSet.has(target)) continue;
    const basedOn = planned.filter((date) => date < target).pop();
    if (!basedOn) continue;
    const h = Math.round((dayMs(target) - dayMs(basedOn)) / DAY_MS);
    const method: EstimateMethod = h <= E5_MAX_HORIZON ? 'e5' : 'profile';
    const band = BAND[Math.min(h, 3) as 1 | 2 | 3];

    const type = exchangeDayType(target);
    const sameType: Array<ReadonlyMap<number, number>> = [];
    for (let back = 0; back < PROFILE_DAYS; back++) {
      const date = shiftDate(basedOn, -back);
      if (plannedSet.has(date) && exchangeDayType(date) === type) sameType.push(byDay.get(date)!);
    }

    const hours: HourEstimate[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const values = sameType.map((day) => day.get(hour)).filter((value) => value !== undefined);
      if (values.length < MIN_SAME_TYPE_DAYS) continue;
      const profile = values.reduce((sum, value) => sum + value, 0) / values.length;

      let estimate = profile;
      if (method === 'e5') {
        const last = byDay.get(basedOn)!.get(hour);
        if (last === undefined) continue;
        estimate = (last + profile) / 2;
      }

      const [low, high] = band[hour];
      hours.push({
        hour,
        mw: round100(estimate),
        p10: round100(estimate + low),
        p90: round100(estimate + high),
      });
    }

    if (hours.length > 0) estimates.push({ businessDate: target, basedOn, h, method, hours });
  }

  return estimates;
}

/** The five synchronous borders plus LT and SE; null on any of them means no market result yet. */
const RDN_BORDERS = [
  'cz_pl', 'de_pl', 'lt_pl', 'se_pl', 'sk_pl',
  'pl_cz', 'pl_de', 'pl_lt', 'pl_se', 'pl_sk',
] as const;
/** Filled even before the market clears (D+2 carries UA alone), and null where a direction is closed. */
const RDN_UA = ['ua_pl', 'ua_dob_pl', 'pl_ua', 'pl_ua_dob'] as const;

/** A 23-hour day has 92 quarters; fewer and the day is not complete. */
const RDN_MIN_QUARTERS = 92;

/**
 * Hourly exchange from the day-ahead market result, MW, import positive: every
 * border summed per quarter, the quarters of an hour averaged. Null until the
 * market has cleared the day on every border.
 *
 * Checked live on 29.10.2026 against pk5l-wp's plan for the same day: the sign
 * agrees, nights within 8–45 MW, daytime within 300 MW of a plan PSE had by
 * then revised. The hour comes from the quarter's local END (`dtime`), because
 * `period` on the autumn fold reads "03:00 - 02a:15"; a quarter with "a" in
 * it is the repeated hour and stays out, as `blockStartHour` leaves it out.
 */
export function exchangeFromPwmRdn(
  rows: readonly PSEPwmRdnRawItem[],
  businessDate: string
): Map<number, number> | null {
  const quarters = rows.filter((row) => row.business_date === businessDate);
  if (quarters.length < RDN_MIN_QUARTERS) return null;

  const byHour = new Map<number, number[]>();
  for (const quarter of quarters) {
    // "02a:15:00" does not match, so the repeated hour drops out here.
    const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/.exec(quarter.dtime ?? '');
    if (!match) continue;

    let sum = 0;
    for (const field of RDN_BORDERS) {
      const value = toNumber(quarter[field]);
      if (value === null) return null;
      sum += value;
    }
    for (const field of RDN_UA) sum += toNumber(quarter[field]) ?? 0;

    // "2026-10-30 00:00:00" ends the 23:45 quarter of the 29th.
    const minutes =
      (match[1] === businessDate ? 0 : 24 * 60) + Number(match[2]) * 60 + Number(match[3]);
    const hour = Math.floor((minutes - 15) / 60);
    if (hour < 0 || hour > 23) continue;
    const bucket = byHour.get(hour) ?? [];
    bucket.push(sum);
    byHour.set(hour, bucket);
  }

  const hourly = new Map<number, number>();
  for (const [hour, sums] of byHour) {
    hourly.set(hour, Math.round(sums.reduce((total, value) => total + value, 0) / sums.length));
  }
  return hourly;
}

/**
 * The estimate for `businessDate` replaced by the market result, its base and
 * horizon kept; every other day untouched.
 */
export function withMarketResult(
  estimates: readonly DayEstimate[],
  businessDate: string,
  hourly: ReadonlyMap<number, number>
): DayEstimate[] {
  return estimates.map((day) =>
    day.businessDate !== businessDate
      ? day
      : {
          ...day,
          method: 'pwm-rdn' as const,
          hours: [...hourly]
            .sort((a, b) => a[0] - b[0])
            .map(([hour, mw]) => ({ hour, mw, p10: null, p90: null })),
        }
  );
}

/**
 * [businessDate, hour, h, method, mw, p10, p90, readAt] — one line whenever an
 * hour's estimate changes, so saldoOcena.ts can take the one that stood just
 * before the plan arrived, at every horizon it was made from.
 */
export type EstimateLogRow = readonly [
  businessDate: string,
  hour: number,
  h: number,
  method: EstimateMethod,
  mw: number,
  p10: number | null,
  p90: number | null,
  readAt: string,
];

type EstimateValue = readonly [h: number, method: EstimateMethod, mw: number, p10: number | null, p90: number | null];

const METHODS: readonly string[] = ['e5', 'profile', 'pwm-rdn'];
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const keyOf = (businessDate: string, hour: number) => `${businessDate}#${hour}`;
const isNumberOrNull = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

/** Every well-formed line, in file order; a broken one is skipped. */
export function parseEstimateLog(text: string): EstimateLogRow[] {
  const rows: EstimateLogRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as unknown;
      if (!Array.isArray(row) || row.length !== 8) continue;
      const [businessDate, hour, h, method, mw, p10, p90, readAt] = row as unknown[];
      if (typeof businessDate !== 'string' || !BUSINESS_DATE.test(businessDate)) continue;
      if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) continue;
      if (typeof h !== 'number' || !Number.isInteger(h) || h < 1) continue;
      if (typeof method !== 'string' || !METHODS.includes(method)) continue;
      if (typeof mw !== 'number' || !Number.isFinite(mw)) continue;
      if (!isNumberOrNull(p10) || !isNumberOrNull(p90)) continue;
      if (typeof readAt !== 'string' || Number.isNaN(Date.parse(readAt))) continue;
      rows.push([
        businessDate, hour, h, method as EstimateMethod, mw,
        p10 as number | null, p90 as number | null, readAt,
      ]);
    } catch {
      // One truncated line from an interrupted write must not cost the rest.
    }
  }
  return rows;
}

/** Several partitions folded into the last value per (businessDate, hour), LATER TEXTS WINNING. */
export function lastEstimatesFrom(texts: string[]): Map<string, EstimateValue> {
  const last = new Map<string, EstimateValue>();
  for (const text of texts) {
    for (const [businessDate, hour, h, method, mw, p10, p90] of parseEstimateLog(text)) {
      last.set(keyOf(businessDate, hour), [h, method, mw, p10, p90]);
    }
  }
  return last;
}

/**
 * The lines this run would append: one per hour whose horizon, method or
 * figures differ from the last on record. Dates far from the run are skipped,
 * as in the archives.
 */
export function newEstimateLines(
  estimates: readonly DayEstimate[],
  lastByKey: ReadonlyMap<string, EstimateValue>,
  nowIso: string
): string[] {
  const lines: string[] = [];
  for (const day of estimates) {
    if (!isPlausibleBusinessDate(day.businessDate, nowIso)) continue;
    for (const { hour, mw, p10, p90 } of day.hours) {
      const previous = lastByKey.get(keyOf(day.businessDate, hour));
      if (
        previous &&
        previous[0] === day.h &&
        previous[1] === day.method &&
        previous[2] === mw &&
        previous[3] === p10 &&
        previous[4] === p90
      ) {
        continue;
      }
      const line: EstimateLogRow = [day.businessDate, hour, day.h, day.method, mw, p10, p90, nowIso];
      lines.push(JSON.stringify(line));
    }
  }
  return lines;
}
