import { PSERawItem, PSEDataPoint, Alert, AlertSet } from '../types';
import { HOURS_PER_DAY, TOTAL_HOURS } from './constants';
import { formatDateTime, getStartOfToday } from './dateHelpers';

/**
 * Extract available reserve from a raw API item.
 * Returns null if no valid value found (instead of 0 to avoid masking missing data).
 */
export function getAvailableReserve(item: PSERawItem): number | null {
  if (item.surplus_cap_avail_tso != null) {
    const val = parseFloat(String(item.surplus_cap_avail_tso));
    if (!isNaN(val)) return val;
  }
  if (item.avail_cap_gen_units_stor_prov != null) {
    const val = parseFloat(String(item.avail_cap_gen_units_stor_prov));
    if (!isNaN(val)) return val;
  }
  return null;
}

/**
 * Process raw API data into hour-by-hour data points.
 * FIX: Maps API data 1:1 by matching timestamps — no cyclic modulo repetition.
 * Missing hours get null values instead of fabricated data.
 */
export function processData(rawData: PSERawItem[]): PSEDataPoint[] {
  if (!rawData || rawData.length === 0) return [];

  const startOfToday = getStartOfToday();
  // PSE API uses end-of-period timestamps: period "00-01" → plan_dtime 01:00
  // A business day runs from 01:00 today to 00:00 next day (24 periods)
  // Start at 01:00 so each day slice contains a complete business day
  const startTime = new Date(startOfToday.getTime() + 1 * 60 * 60 * 1000);

  // Build a map of raw data by hour offset from start time
  const rawByHour = new Map<number, PSERawItem>();
  for (const item of rawData) {
    if (!item.plan_dtime || !item.req_pow_res) continue;
    const itemTime = new Date(item.plan_dtime);
    const diffMs = itemTime.getTime() - startTime.getTime();
    const hourOffset = Math.round(diffMs / (60 * 60 * 1000));
    if (hourOffset >= 0 && hourOffset < TOTAL_HOURS) {
      rawByHour.set(hourOffset, item);
    }
  }

  const processed: PSEDataPoint[] = [];

  for (let i = 0; i < TOTAL_HOURS; i++) {
    const timestamp = new Date(startTime.getTime() + i * 60 * 60 * 1000);
    const timeStr = formatDateTime(timestamp);
    const rawItem = rawByHour.get(i);

    if (rawItem) {
      const reserve = getAvailableReserve(rawItem);
      const required = parseFloat(String(rawItem.req_pow_res));
      processed.push({
        time: timestamp,
        timeStr,
        reserve: reserve !== null && !isNaN(reserve) ? reserve : null,
        required: !isNaN(required) ? required : null,
      });
    } else {
      // No data for this hour — keep null values
      processed.push({ time: timestamp, timeStr, reserve: null, required: null });
    }
  }

  return processed;
}

/**
 * Get data for a specific day (0=today, 1=tomorrow, 2=day after).
 * FIX: No padding with last-known values — returns actual data only.
 */
export function getDataForDay(
  allData: PSEDataPoint[],
  dayOffset: number
): PSEDataPoint[] {
  const startHour = dayOffset * HOURS_PER_DAY;
  const endHour = startHour + HOURS_PER_DAY;
  return allData.slice(startHour, endHour);
}

/**
 * Find alerts in data based on thresholds.
 * FIX: Filters out null/NaN values before comparison.
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

    if (difference <= redThreshold || item.reserve < item.required) {
      red.push({
        time: item.timeStr,
        reserve: item.reserve,
        required: item.required,
        difference,
      });
    } else if (difference <= orangeThreshold) {
      orange.push({
        time: item.timeStr,
        reserve: item.reserve,
        required: item.required,
        difference,
      });
    }
  }

  return { orange, red };
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
