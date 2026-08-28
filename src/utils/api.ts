import { PSECompassRawItem, PSEKseDemandRawItem, PSERawItem, PSERedispatchRawItem } from '../types';
import { API_BASE, API_URL, FORECAST_ROW_LIMIT } from './constants';
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
const HISTORY_FIELD_LIST = [
  'business_date',
  'period',
  'plan_dtime',
  'plan_dtime_utc',
  'req_pow_res',
  'surplus_cap_avail_tso',
];

export const HISTORY_FIELDS = HISTORY_FIELD_LIST.join(',');

/**
 * The same rows plus the mix, for working out WHY an hour is tight.
 *
 * Asked for only by `scripts/summary.ts`, which runs once an hour on a GitHub
 * runner. The browser keeps the narrow list: this is roughly twice the payload,
 * and it would be paid by every phone on every cold start to answer a question
 * the phone never asks — the reasoning happens before the summary is written,
 * not while someone is reading it.
 */
export const HISTORY_FIELDS_WITH_MIX = [
  ...HISTORY_FIELD_LIST,
  'grid_demand_fcst',
  'fcst_pv_tot_gen',
  'fcst_wi_tot_gen',
  'sum_unav_oper_cond',
].join(',');

/**
 * Generic over the endpoint because pk5l-wp is not the only PSE dataset this
 * app talks to: Kompas (pdgsz) and non-market redispatch (poze-redoze) live
 * under other paths of the same API and share this same fetch/parse shape.
 *
 * An empty `value` array maps to null same as a network/HTTP failure, so the
 * two are indistinguishable here. That is intentional — for pk5l-wp empty is
 * always wrong, but a future caller (poze-redoze with no redispatch that day)
 * may see empty as a perfectly valid state. It is up to the caller to decide
 * whether null means "error" or "nothing happened".
 */
async function query<T>(endpoint: string, params: string): Promise<T[] | null> {
  try {
    const response = await fetch(`${endpoint}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    return Array.isArray(data?.value) && data.value.length > 0
      ? (data.value as T[])
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

  const filtered = await query<PSERawItem>(
    API_URL,
    `$filter=${encodeURIComponent(
      `plan_dtime ge '${start}' and plan_dtime le '${to}'`
    )}&$select=${FORECAST_FIELDS}&$orderby=plan_dtime&$first=${FORECAST_ROW_LIMIT}`
  );
  if (filtered) return filtered;

  // Fallback: newest rows first. Without $orderby the API serves its oldest
  // records (June 2024), which all fall outside the window and render as an
  // empty chart.
  const latest = await query<PSERawItem>(
    API_URL,
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
export async function fetchPSEHistory(
  days = 30,
  fields = HISTORY_FIELDS
): Promise<PSERawItem[]> {
  const startOfToday = getStartOfToday();
  const from = formatDateTimeApi(addDays(startOfToday, -days)).slice(0, 10);
  const to = formatDateTimeApi(addDays(startOfToday, -1)).slice(0, 10);

  const rows = await query<PSERawItem>(
    API_URL,
    `$filter=${encodeURIComponent(
      `business_date ge '${from}' and business_date le '${to}'`
    )}&$select=${fields}&$orderby=plan_dtime&$first=1000`
  );
  return rows ?? [];
}

/**
 * Non-market redispatch of renewables (poze-redoze) for one business day: PSE
 * ordering PV/wind plants to curtail output, for reasons other than the
 * market clearing them off. 96 rows of 15-minute data when the day carries
 * any curtailment at all.
 *
 * Unlike pk5l-wp, an empty result here is the normal case — most days see no
 * redispatch whatsoever — so a null from `query` (no rows, or the request
 * failing outright) maps to `[]` rather than being treated as an error the
 * caller must react to.
 */
export async function fetchRedispatch(
  businessDate: string
): Promise<PSERedispatchRawItem[]> {
  const rows = await query<PSERedispatchRawItem>(
    `${API_BASE}/poze-redoze`,
    `$filter=${encodeURIComponent(`business_date eq '${businessDate}'`)}&$first=100`
  );
  return rows ?? [];
}

/**
 * Country-wide demand (kse_pow_dem) from the current day's coordination plan.
 * Selected down to the one field the chart needs; published for the current
 * business date only, so future days return [] and that is the normal state.
 */
export async function fetchKseDemand(
  businessDate: string
): Promise<PSEKseDemandRawItem[]> {
  const rows = await query<PSEKseDemandRawItem>(
    `${API_BASE}/pdgobpkd`,
    `$filter=${encodeURIComponent(`business_date eq '${businessDate}'`)}` +
      `&$select=business_date,dtime_utc,kse_pow_dem&$first=100`
  );
  return rows ?? [];
}

/**
 * PSE's Kompas Energetyczny (pdgsz) across a span of business days: the hourly
 * signal the operator publishes to consumers, telling them when saving is
 * recommended or a limitation required.
 *
 * Only PUBLISHED days come back. Today is always there; tomorrow appears around
 * 16:35, and days beyond that are simply absent — that is the endpoint's normal
 * state, not a failure, so like `fetchRedispatch` an empty result maps to `[]`.
 * The caller decides what silence means, and here it means "no signal to report"
 * rather than "something went wrong".
 *
 * `is_active` is asked for in the filter because pdgsz versions its records: a
 * republished period keeps the superseded row alongside the current one, and
 * without this the same hour arrives twice with two different levels.
 */
export async function fetchCompass(
  from: string,
  to: string
): Promise<PSECompassRawItem[]> {
  const rows = await query<PSECompassRawItem>(
    `${API_BASE}/pdgsz`,
    `$filter=${encodeURIComponent(
      `business_date ge '${from}' and business_date le '${to}' and is_active eq true`
    )}&$first=200`
  );
  return rows ?? [];
}
