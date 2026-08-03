import {
  PSERawItem,
  PSEDataPoint,
  Alert,
  AlertSet,
  AlertRange,
  SystemStatus,
} from '../types';
import { HOUR_MS } from './constants';
import {
  formatDate,
  formatDateTimeApi,
  localHourLabel,
  parsePseUtc,
  addDays,
  periodStart,
  periodEnd,
} from './dateHelpers';

/**
 * Hour labels for a point. Prefers the `period` field, which is the only source
 * that states where the block begins and that preserves the "03a" marker on the
 * autumn DST switch. Falls back to clock arithmetic for synthesised gap points,
 * which carry no period.
 */
function hourLabels(
  period: string,
  endInstant: Date
): { hourLabel: string; endLabel: string } {
  const start = periodStart(period);
  const end = periodEnd(period);
  if (start && end) {
    return { hourLabel: `${start}:00`, endLabel: `${end}:00` };
  }
  return {
    hourLabel: localHourLabel(new Date(endInstant.getTime() - HOUR_MS)),
    endLabel: localHourLabel(endInstant),
  };
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? null : parsed;
}

/**
 * Extract available reserve from a raw API item.
 * Returns null if no valid value found (instead of 0 to avoid masking missing data).
 */
export function getAvailableReserve(item: PSERawItem): number | null {
  return (
    toNumber(item.surplus_cap_avail_tso) ??
    toNumber(item.avail_cap_gen_units_stor_prov)
  );
}

/**
 * Business day an instant belongs to. PSE periods are end-labelled, so the one
 * ending at local midnight still belongs to the previous day.
 */
function businessDateOf(instant: Date): string {
  return formatDate(instant.getHours() === 0 ? addDays(instant, -1) : instant);
}

/**
 * Turn raw API rows into an hour-by-hour series.
 *
 * Ordering and gap detection run on `plan_dtime_utc`, never on `plan_dtime`:
 * the latter carries a literal "03a" hour on the autumn DST switch, which
 * `new Date()` reports as NaN — silently dropping that hour. Working in UTC
 * also means 23- and 25-hour days need no special casing, because the UTC
 * sequence stays a plain one-hour step throughout.
 *
 * Hours the API skipped become null points rather than fabricated values, so a
 * gap stays visible on the chart.
 */
export function processData(rawData: PSERawItem[]): PSEDataPoint[] {
  if (!rawData || rawData.length === 0) return [];

  const parsed = rawData
    .map((item) => {
      const time = parsePseUtc(item.plan_dtime_utc);
      if (!time || !item.business_date) return null;
      const period = item.period ?? '';
      return {
        time,
        timeStr: item.plan_dtime,
        businessDate: item.business_date,
        period,
        ...hourLabels(period, time),
        reserve: getAvailableReserve(item),
        required: toNumber(item.req_pow_res),
        demand: toNumber(item.grid_demand_fcst),
        pv: toNumber(item.fcst_pv_tot_gen),
        wind: toNumber(item.fcst_wi_tot_gen),
        outages: toNumber(item.sum_unav_oper_cond),
        exchange: toNumber(item.planned_exchange),
      } satisfies PSEDataPoint;
    })
    .filter((p): p is PSEDataPoint => p !== null)
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  if (parsed.length === 0) return [];

  // Fill gaps so a missing hour shows as a break in the line instead of
  // disappearing into a straight segment between its neighbours.
  const filled: PSEDataPoint[] = [];
  for (const point of parsed) {
    const previous = filled[filled.length - 1];

    if (previous) {
      const gapHours = Math.round(
        (point.time.getTime() - previous.time.getTime()) / HOUR_MS
      );
      if (gapHours === 0) continue; // duplicate row from the API
      for (let i = 1; i < gapHours; i++) {
        const instant = new Date(previous.time.getTime() + i * HOUR_MS);
        filled.push({
          time: instant,
          timeStr: formatDateTimeApi(instant),
          businessDate: businessDateOf(instant),
          period: '',
          ...hourLabels('', instant),
          reserve: null,
          required: null,
          demand: null,
          pv: null,
          wind: null,
          outages: null,
          exchange: null,
        });
      }
    }

    filled.push(point);
  }

  return filled;
}

/**
 * Data for one PSE business day (0 = today, 1 = tomorrow, 2 = the day after).
 * Selects by business date rather than by a fixed 24-point offset, so DST days
 * correctly yield 23 or 25 points.
 */
export function getDataForDay(
  allData: PSEDataPoint[],
  dayOffset: number
): PSEDataPoint[] {
  const target = formatDate(addDays(new Date(), dayOffset));
  return allData.filter((point) => point.businessDate === target);
}

/**
 * Find alerts in data based on thresholds.
 * Points with missing values are skipped rather than compared as null.
 */
export function findAlerts(
  data: PSEDataPoint[],
  orangeThreshold: number,
  redThreshold: number
): AlertSet {
  const orange: Alert[] = [];
  const red: Alert[] = [];

  for (const item of data) {
    if (item.reserve === null || item.required === null) continue;
    if (isNaN(item.reserve) || isNaN(item.required)) continue;

    const difference = item.reserve - item.required;
    const alert: Alert = {
      time: item.timeStr,
      reserve: item.reserve,
      required: item.required,
      difference,
    };

    if (difference <= redThreshold || item.reserve < item.required) {
      red.push(alert);
    } else if (difference <= orangeThreshold) {
      orange.push(alert);
    }
  }

  return { orange, red };
}

/**
 * Collapse consecutive alert hours into ranges: four separate 17:00/18:00/19:00/
 * 20:00 entries read far worse than a single "17:00-20:00".
 *
 * `data` supplies the hour ordering, so ranges never merge across a gap.
 */
export function buildAlertRanges(
  data: PSEDataPoint[],
  alerts: AlertSet
): AlertRange[] {
  const severityByTime = new Map<string, 'red' | 'orange'>();
  alerts.red.forEach((a) => severityByTime.set(a.time, 'red'));
  alerts.orange.forEach((a) => severityByTime.set(a.time, 'orange'));
  if (severityByTime.size === 0) return [];

  const ranges: AlertRange[] = [];
  let current: (AlertRange & { lastIndex: number }) | null = null;

  data.forEach((point, index) => {
    const severity = severityByTime.get(point.timeStr);

    if (
      !severity ||
      point.reserve === null ||
      point.required === null ||
      !current ||
      current.severity !== severity ||
      current.lastIndex !== index - 1
    ) {
      if (current) {
        ranges.push(stripIndex(current));
        current = null;
      }
      if (!severity || point.reserve === null || point.required === null) return;
    }

    const difference = point.reserve - point.required;
    // Both edges come from the point itself: the block covering 19:00-20:00
    // spans exactly those hours. Reading the *next* point's stamp shifted the
    // whole window an hour forward.
    const to = point.endLabel;

    if (current) {
      current.to = to;
      current.hours += 1;
      current.lastIndex = index;
      if (difference < current.worstDifference) {
        current.worstDifference = difference;
        current.reserve = point.reserve;
        current.required = point.required;
      }
    } else {
      current = {
        severity,
        from: point.hourLabel,
        to,
        worstDifference: difference,
        reserve: point.reserve,
        required: point.required,
        hours: 1,
        lastIndex: index,
      };
    }
  });

  if (current) ranges.push(stripIndex(current));

  return ranges;
}

function stripIndex(range: AlertRange & { lastIndex: number }): AlertRange {
  const { lastIndex: _lastIndex, ...rest } = range;
  return rest;
}

/**
 * Severity of a single margin (reserve - required).
 * Thresholds are inclusive, matching findAlerts.
 */
export function classifyMargin(
  difference: number | null,
  orangeThreshold: number,
  redThreshold: number
): SystemStatus {
  if (difference === null || isNaN(difference)) return 'unknown';
  if (difference <= redThreshold) return 'alarm';
  if (difference <= orangeThreshold) return 'warn';
  return 'ok';
}

/**
 * The period covering right now — the first one that has not ended yet.
 * PSE stamps periods with their end, so this is a plain "first future instant"
 * lookup and needs no hour arithmetic (which would break on DST days).
 */
export function findCurrentPoint(
  data: PSEDataPoint[]
): PSEDataPoint | undefined {
  const now = Date.now();
  return data.find((point) => point.time.getTime() > now);
}

/** Worst status over the next `hours` periods, starting from now. */
export function getUpcomingStatus(
  data: PSEDataPoint[],
  orangeThreshold: number,
  redThreshold: number,
  hours = 3
): SystemStatus {
  const now = Date.now();
  const upcoming = data
    .filter((point) => point.time.getTime() > now)
    .slice(0, hours)
    .filter((point) => point.reserve !== null && point.required !== null);

  if (upcoming.length === 0) return 'unknown';

  const worst = Math.min(
    ...upcoming.map((point) => point.reserve! - point.required!)
  );
  return classifyMargin(worst, orangeThreshold, redThreshold);
}

/**
 * Get valid (non-null, non-NaN) reserve values from data.
 */
export function getValidReserves(data: PSEDataPoint[]): number[] {
  return data
    .map((d) => d.reserve)
    .filter((r): r is number => r !== null && !isNaN(r));
}

/**
 * Calculate average of numbers. Returns null if empty to avoid division by zero.
 */
export function safeAvg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
