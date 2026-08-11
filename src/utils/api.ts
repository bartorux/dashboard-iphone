import { PSERawItem } from '../types';
import { API_URL, FORECAST_ROW_LIMIT } from './constants';
import { daysToFetch } from './dayWindow';
import { addDays, formatDateTimeApi, getStartOfToday } from './dateHelpers';

/**
 * Fields the app actually reads. The endpoint serves 16 per row; asking for
 * these cuts the response from ~55 KB to ~24 KB before compression.
 */
const FORECAST_FIELDS = [
  'business_date',
  'period',
  'plan_dtime',
  'plan_dtime_utc',
  'req_pow_res',
  'surplus_cap_avail_tso',
  'grid_demand_fcst',
  'fcst_pv_tot_gen',
  'fcst_wi_tot_gen',
  'sum_unav_oper_cond',
  'planned_exchange',
  'fcst_gen_unit_stor_prov',
  'fcst_gen_unit_stor_non_prov',
].join(',');

/**
 * History only needs enough to recompute the margin and label the hour. Still a
 * fraction of the full row - 30 days measure ~11 KB gzipped. plan_dtime and
 * period are included so history flows through the same processData as live
 * data, rather than a parallel path that could drift from it.
 */
const HISTORY_FIELDS = [
  'business_date',
  'period',
  'plan_dtime',
  'plan_dtime_utc',
  'req_pow_res',
  'surplus_cap_avail_tso',
].join(',');

async function query(params: string): Promise<PSERawItem[] | null> {
  try {
    const response = await fetch(`${API_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    return Array.isArray(data?.value) && data.value.length > 0
      ? (data.value as PSERawItem[])
      : null;
  } catch {
    return null;
  }
}

export async function fetchPSEData(): Promise<PSERawItem[]> {
  const startOfToday = getStartOfToday();

  // A PSE business day runs 01:00 -> 00:00 the next day. Both bounds need a full
  // timestamp: the filter compares strings, so a date-only upper bound sorts
  // *before* "…-06 00:00:00" and silently drops the last hour of the range.
  const from = formatDateTimeApi(new Date(startOfToday.getTime()));
  const to = formatDateTimeApi(addDays(startOfToday, daysToFetch(new Date())));

  const start = from.replace(' 00:00:00', ' 01:00:00');

  const filtered = await query(
    `$filter=${encodeURIComponent(
      `plan_dtime ge '${start}' and plan_dtime le '${to}'`
    )}&$select=${FORECAST_FIELDS}&$orderby=plan_dtime&$first=${FORECAST_ROW_LIMIT}`
  );
  if (filtered) return filtered;

  // Fallback: newest rows first. Without $orderby the API serves its oldest
  // records (June 2024), which all fall outside the window and render as an
  // empty chart.
  const latest = await query(
    `$select=${FORECAST_FIELDS}&$orderby=${encodeURIComponent(
      'plan_dtime desc'
    )}&$first=200`
  );
  return latest ?? [];
}

/**
 * Past business days, for judging whether today's profile is unusual.
 * Excludes today, whose figures are still a forecast being revised.
 */
export async function fetchPSEHistory(days = 30): Promise<PSERawItem[]> {
  const startOfToday = getStartOfToday();
  const from = formatDateTimeApi(addDays(startOfToday, -days)).slice(0, 10);
  const to = formatDateTimeApi(addDays(startOfToday, -1)).slice(0, 10);

  const rows = await query(
    `$filter=${encodeURIComponent(
      `business_date ge '${from}' and business_date le '${to}'`
    )}&$select=${HISTORY_FIELDS}&$orderby=plan_dtime&$first=1000`
  );
  return rows ?? [];
}
