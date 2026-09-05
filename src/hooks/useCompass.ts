import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCompass } from '../utils/api';
import { CompassHour, parseCompass } from '../utils/compass';
import { visibleBusinessDates } from '../utils/dayWindow';

const EMPTY: CompassHour[] = [];

/** Groups parsed hours by their own `business_date`, never a caller's. A date
 *  with no rows in the response simply gets no entry — `useCompass` reads that
 *  as "nothing published for that day" rather than falling back to another
 *  date's hours. */
function byBusinessDate(hours: CompassHour[]): Map<string, CompassHour[]> {
  const map = new Map<string, CompassHour[]>();
  for (const hour of hours) {
    const list = map.get(hour.businessDate);
    if (list) list.push(hour);
    else map.set(hour.businessDate, [hour]);
  }
  return map;
}

/**
 * PSE's Kompas Energetyczny (pdgsz), keyed by business_date.
 *
 * One request per session, deliberately not one per visible day tab: measured
 * live against the endpoint, a 7-day filter and a today+tomorrow filter came
 * back with the identical 48 rows — pdgsz never holds more than two published
 * business days regardless of how wide the window asked for is. So the whole
 * visible window (`visibleBusinessDates`, first day to last) is asked for in
 * one call, and nothing about switching between the five day tabs triggers
 * another.
 *
 * No localStorage, for the same reason `useKseDemand` gives: the service
 * worker's NetworkFirst cache already holds this GET for an hour on
 * api.raporty.pse.pl, which is exactly as much persistence as a forward-looking
 * flag deserves.
 *
 * `businessDate` is the actual current business date (mirrors how App.tsx
 * feeds `useKseDemand` from `todayData`, not the selected day), not the tab the
 * user is looking at. That keeps the "one request per session" promise while
 * still refetching when the day itself rolls over at midnight: pdgsz shifts
 * its whole two-day window forward at that point, and the earlier fetch no
 * longer describes it.
 *
 * `refresh()` is separate from that automatic path and exists for
 * `refreshAll`: pdgsz publishes tomorrow's compass around 16:35, well after
 * most first opens of the day, so a purely session-scoped, mount-time fetch
 * would leave the 22-25 hour lookahead this feature promises unrealized for
 * most of the afternoon unless a manual or pull-to-refresh re-asks.
 *
 * A network failure (fetchCompass already maps every failure to []) clears the
 * map and the request registry, so the next refresh — automatic on a day
 * rollover, or manual via `refresh()` — retries rather than being stuck empty
 * for the rest of the session.
 */
export function useCompass(
  enabled: boolean,
  businessDate: string | null
): { hours: CompassHour[]; refresh: () => void } {
  const [byDate, setByDate] = useState<Map<string, CompassHour[]>>(
    () => new Map()
  );
  const requestedFor = useRef<string | null>(null);

  const load = useCallback(() => {
    const dates = visibleBusinessDates(new Date());
    const from = dates[0];
    const to = dates[dates.length - 1];

    fetchCompass(from, to)
      .then((rows) => {
        setByDate(byBusinessDate(parseCompass(rows)));
      })
      .catch(() => {
        // Context, not product: a failed fetch means the compass says nothing
        // this session. Clearing the registry lets the next refresh retry
        // rather than being stuck empty until the day rolls over.
        setByDate(new Map());
        requestedFor.current = null;
      });
  }, []);

  useEffect(() => {
    if (!enabled || !businessDate) return;
    if (requestedFor.current === businessDate) return;
    requestedFor.current = businessDate;
    load();
  }, [enabled, businessDate, load]);

  const refresh = useCallback(() => {
    if (!enabled || !businessDate) return;
    load();
  }, [enabled, businessDate, load]);

  return {
    hours: (businessDate && byDate.get(businessDate)) || EMPTY,
    refresh,
  };
}
