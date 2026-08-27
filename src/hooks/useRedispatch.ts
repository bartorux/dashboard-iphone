import { useCallback, useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    if (!enabled || !businessDate) return;
    if (requestedRef.current.get(businessDate)) return;
    requestedRef.current.set(businessDate, true);
    load(businessDate);
  }, [enabled, businessDate, load]);

  const byHour = (businessDate && byDate.get(businessDate)) || EMPTY_MAP;
  return { byHour };
}
