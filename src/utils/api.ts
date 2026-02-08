import { PSERawItem } from '../types';
import { API_URL, DAYS_TO_FETCH } from './constants';
import { formatDate, getStartOfToday } from './dateHelpers';

export async function fetchPSEData(): Promise<PSERawItem[]> {
  const startOfToday = getStartOfToday();
  const startDate = formatDate(startOfToday);
  const endDate = formatDate(
    new Date(startOfToday.getTime() + DAYS_TO_FETCH * 24 * 60 * 60 * 1000)
  );

  const url = `${API_URL}?$filter=plan_dtime ge '${startDate}' and plan_dtime le '${endDate}'&$orderby=plan_dtime&$first=200`;

  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.value && data.value.length > 0) {
        return data.value as PSERawItem[];
      }
    }
  } catch {
    // Filtered query failed, try simple fallback
  }

  // Fallback: simple query
  try {
    const response = await fetch(`${API_URL}?$first=200`);
    if (response.ok) {
      const data = await response.json();
      if (data.value && data.value.length > 0) {
        return data.value as PSERawItem[];
      }
    }
  } catch {
    // Both queries failed
  }

  return [];
}
