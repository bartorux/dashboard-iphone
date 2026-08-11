import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PSEDataPoint, DayOffset } from '../types';
import { fetchPSEData } from '../utils/api';
import { processData, getDataForDay,
  hasReadings,
} from '../utils/dataTransform';
import { REFRESH_INTERVAL_MS, STORAGE_PREFIX, HOUR_MS } from '../utils/constants';
import { addDays, formatDate, getStartOfToday } from '../utils/dateHelpers';

/**
 * How stale data may be before returning to the app triggers a fetch. Short
 * enough that reopening shows current figures, long enough that flicking
 * between apps does not hammer the endpoint.
 */
const STALE_ON_RESUME_MS = 2 * 60 * 1000;

/** Milliseconds until the next local midnight. */
function msUntilMidnight(): number {
  return addDays(getStartOfToday(), 1).getTime() - Date.now();
}

const DATA_CACHE_KEY = `${STORAGE_PREFIX}data-cache`;
/** Beyond this the cache describes business days we no longer display. */
const CACHE_MAX_AGE_MS = 12 * HOUR_MS;

interface CachedPayload {
  data: PSEDataPoint[];
  timestamp: string;
}

function saveDataCache(data: PSEDataPoint[], timestamp: string): void {
  try {
    localStorage.setItem(
      DATA_CACHE_KEY,
      JSON.stringify({
        data: data.map((point) => ({ ...point, time: point.time.toISOString() })),
        timestamp,
        savedAt: Date.now(),
      })
    );
  } catch {
    /* storage full or unavailable */
  }
}

function loadDataCache(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.data)) return null;
    if (
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS
    ) {
      return null;
    }

    return {
      data: parsed.data.map((point: PSEDataPoint & { time: string }) => ({
        ...point,
        time: new Date(point.time),
      })),
      timestamp: String(parsed.timestamp ?? ''),
    };
  } catch {
    return null;
  }
}

interface UsePSEDataReturn {
  allData: PSEDataPoint[];
  dayData: PSEDataPoint[];
  /** Today's slice, so consumers never have to read the clock themselves. */
  todayData: PSEDataPoint[];
  currentDayOffset: DayOffset;
  switchDay: (offset: DayOffset) => void;
  refreshData: () => Promise<void>;
  isLoading: boolean;
  /** True while the newest fetch failed but cached data is still on screen. */
  isStale: boolean;
  /** True once this session has fetched successfully at least once. */
  hasFreshData: boolean;
  lastUpdate: string | null;
  hasData: boolean;
}

export function usePSEData(): UsePSEDataReturn {
  const cached = useRef(loadDataCache()).current;

  const [allData, setAllData] = useState<PSEDataPoint[]>(cached?.data ?? []);
  const [currentDayOffset, setCurrentDayOffset] = useState<DayOffset>(0);
  const [isLoading, setIsLoading] = useState(true);
  /*
   * "The newest fetch failed, so this is cache" — not "we have a cache".
   *
   * It used to start true whenever anything was cached, which is every reload,
   * so the card warned that the data might be out of date for the half second
   * before the fetch landed. Measured on the live page: visible at 51ms, gone at
   * 533ms, every single time. A warning that fires on the normal path teaches
   * people to ignore it on the path that matters.
   */
  const [isStale, setIsStale] = useState(false);

  /** Whether a fetch has succeeded this session, as opposed to ever. */
  const [hasFreshData, setHasFreshData] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(
    cached?.timestamp || null
  );

  /**
   * The business date currently on screen. getDataForDay reads the clock, so
   * without this in the dependency list the day slice kept describing yesterday
   * after midnight while the tabs already showed the new date.
   */
  const [todayKey, setTodayKey] = useState(() => formatDate(new Date()));

  // Guards against overlapping fetches (interval + pull-to-refresh + mount).
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);

  const refreshData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    lastFetchRef.current = Date.now();

    try {
      const processed = processData(await fetchPSEData());

      if (processed.some((point) => point.reserve !== null)) {
        const timestamp = new Date().toLocaleTimeString('pl-PL', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setAllData(processed);
        setLastUpdate(timestamp);
        setIsStale(false);
        setHasFreshData(true);
        saveDataCache(processed, timestamp);
      } else {
        // A 200 that carries no usable values is a failure, not fresh data.
        setIsStale(true);
      }
    } catch {
      setIsStale(true);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const switchDay = useCallback((offset: DayOffset) => {
    setCurrentDayOffset(offset);
  }, []);

  useEffect(() => {
    refreshData();

    let intervalId: ReturnType<typeof setInterval> | undefined;

    // No point waking every 15 minutes for data nobody is looking at; becoming
    // visible refreshes anyway.
    const startPolling = () => {
      if (intervalId === undefined) {
        intervalId = setInterval(refreshData, REFRESH_INTERVAL_MS);
      }
    };
    const stopPolling = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      startPolling();
      // Backgrounded timers are throttled hard on iOS, so returning to the app
      // would otherwise show whatever was fetched before it was hidden — and
      // PSE revises the forecast every hour or two.
      if (Date.now() - lastFetchRef.current > STALE_ON_RESUME_MS) refreshData();
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshData]);

  /**
   * Roll the business date over at midnight. Scheduled to the next midnight
   * rather than every 24h: DST days are 23 or 25 hours long, so a fixed period
   * would drift twice a year.
   */
  useEffect(() => {
    const id = setTimeout(() => {
      setTodayKey(formatDate(new Date()));
      // The three-day horizon just moved
      refreshData();
    }, msUntilMidnight() + 1000);

    return () => clearTimeout(id);
  }, [todayKey, refreshData]);

  const dayData = useMemo(
    () => getDataForDay(allData, currentDayOffset),
    [allData, currentDayOffset, todayKey]
  );

  const todayData = useMemo(
    () => getDataForDay(allData, 0),
    [allData, todayKey]
  );

  const hasData = useMemo(
    () => hasReadings(allData),
    [allData]
  );

  return {
    allData,
    dayData,
    todayData,
    currentDayOffset,
    switchDay,
    refreshData,
    isLoading,
    isStale,
    hasFreshData,
    lastUpdate,
    hasData,
  };
}
