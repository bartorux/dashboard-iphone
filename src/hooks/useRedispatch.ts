import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchRedispatch } from '../utils/api';
import { STORAGE_PREFIX } from '../utils/constants';
import { visibleBusinessDates } from '../utils/dayWindow';
import { processRedispatch, redispatchByHour, RedispatchHour } from '../utils/redispatch';
import {
  parseRedispatchCache,
  readCachedRedispatch,
  withRedispatchEntry,
} from '../utils/redispatchCache';

const REDISPATCH_KEY = `${STORAGE_PREFIX}redispatch-cache`;

const EMPTY_MAP = new Map<number, RedispatchHour>();

function loadCache() {
  try {
    return parseRedispatchCache(localStorage.getItem(REDISPATCH_KEY));
  } catch {
    return {};
  }
}

function saveCache(
  businessDate: string,
  rows: RedispatchHour[]
): void {
  try {
    const next = withRedispatchEntry(
      loadCache(),
      businessDate,
      rows,
      Date.now(),
      visibleBusinessDates(new Date())
    );
    localStorage.setItem(REDISPATCH_KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable */
  }
}

/**
 * Non-market redispatch (curtailment) of PV/wind, keyed by hour for one
 * business day at a time.
 *
 * Fetched lazily, only once the generation view is actually on screen, and
 * only once per business date per session — `requestedRef` is a Map rather
 * than the single boolean `useHistory` uses because the user has up to five
 * day tabs to switch between, each its own request. `byDate` accumulates
 * results across tabs so flipping back to a day already loaded this session
 * shows it instantly instead of re-fetching.
 *
 * A network failure or a row that fails to parse never surfaces as an error
 * state — the chart simply draws without the curtailment layer, same as a day
 * that genuinely had none.
 */
export function useRedispatch(enabled: boolean, businessDate: string | null) {
  const [byDate, setByDate] = useState<Map<string, Map<number, RedispatchHour>>>(
    () => new Map()
  );
  const requestedRef = useRef<Map<string, boolean>>(new Map());

  const load = useCallback(async (date: string) => {
    const cached = readCachedRedispatch(loadCache(), date, Date.now());
    if (cached) {
      // Already served synchronously by the memo below; kept in state so the
      // memo stops re-parsing localStorage on every render of this day.
      setByDate((prev) => new Map(prev).set(date, redispatchByHour(cached)));
      return;
    }

    try {
      const raw = await fetchRedispatch(date);
      const rows = processRedispatch(raw);
      setByDate((prev) => new Map(prev).set(date, redispatchByHour(rows)));
      saveCache(date, rows);
    } catch {
      setByDate((prev) => new Map(prev).set(date, EMPTY_MAP));
    }
  }, []);

  /*
   * Every visible day at once, not just the one on screen. A reader who opened
   * the generation view is a reader who will tab across days, and each tab
   * used to be its own fetch landing a beat after the chart had already drawn
   * the new day — a second render, a restarted animation, a y-axis that
   * dipped below zero once the curtailment arrived. Warming the other days now
   * means the switch finds them in the cache.
   */
  useEffect(() => {
    if (!enabled) return;
    const wanted = new Set(visibleBusinessDates(new Date()));
    if (businessDate) wanted.add(businessDate);
    for (const date of wanted) {
      if (requestedRef.current.get(date)) continue;
      requestedRef.current.set(date, true);
      load(date);
    }
  }, [enabled, businessDate, load]);

  /*
   * Read synchronously, in the same render as the day change. `load` above
   * still writes the cached day into state, but only from an effect — one
   * render later — and that gap is exactly the double draw the reader saw:
   * a chart without curtailment, then the same chart with it. A day the
   * cache already knows must arrive complete the first time it is drawn.
   */
  const byHour = useMemo(() => {
    if (!businessDate) return EMPTY_MAP;
    const loaded = byDate.get(businessDate);
    if (loaded) return loaded;
    const cached = readCachedRedispatch(loadCache(), businessDate, Date.now());
    return cached ? redispatchByHour(cached) : EMPTY_MAP;
  }, [businessDate, byDate]);

  return { byHour };
}
