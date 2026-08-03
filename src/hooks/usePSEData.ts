import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PSEDataPoint, DayOffset } from '../types';
import { fetchPSEData } from '../utils/api';
import { processData, getDataForDay } from '../utils/dataTransform';
import { REFRESH_INTERVAL_MS, STORAGE_PREFIX, HOUR_MS } from '../utils/constants';

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
  currentDayOffset: DayOffset;
  switchDay: (offset: DayOffset) => void;
  refreshData: () => Promise<void>;
  isLoading: boolean;
  /** True while the newest fetch failed but cached data is still on screen. */
  isStale: boolean;
  lastUpdate: string | null;
  hasData: boolean;
}

export function usePSEData(): UsePSEDataReturn {
  const cached = useRef(loadDataCache()).current;

  const [allData, setAllData] = useState<PSEDataPoint[]>(cached?.data ?? []);
  const [currentDayOffset, setCurrentDayOffset] = useState<DayOffset>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(cached != null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(
    cached?.timestamp || null
  );

  // Guards against overlapping fetches (interval + pull-to-refresh + mount).
  const isFetchingRef = useRef(false);

  const refreshData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);

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
    const intervalId = setInterval(refreshData, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [refreshData]);

  const dayData = useMemo(
    () => getDataForDay(allData, currentDayOffset),
    [allData, currentDayOffset]
  );

  const hasData = useMemo(
    () => allData.some((point) => point.reserve !== null),
    [allData]
  );

  return {
    allData,
    dayData,
    currentDayOffset,
    switchDay,
    refreshData,
    isLoading,
    isStale,
    lastUpdate,
    hasData,
  };
}
