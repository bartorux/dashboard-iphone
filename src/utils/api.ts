import { PSERawItem } from '../types';
import { API_URL, DAYS_TO_FETCH } from './constants';
import { addDays, formatDateTimeApi, getStartOfToday } from './dateHelpers';

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
  const to = formatDateTimeApi(addDays(startOfToday, DAYS_TO_FETCH));

  const start = from.replace(' 00:00:00', ' 01:00:00');

  const filtered = await query(
    `$filter=${encodeURIComponent(
      `plan_dtime ge '${start}' and plan_dtime le '${to}'`
    )}&$orderby=plan_dtime&$first=200`
  );
  if (filtered) return filtered;

  // Fallback: newest rows first. Without $orderby the API serves its oldest
  // records (June 2024), which all fall outside the window and render as an
  // empty chart.
  const latest = await query(
    `$orderby=${encodeURIComponent('plan_dtime desc')}&$first=200`
  );
  return latest ?? [];
}
