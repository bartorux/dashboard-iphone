import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PSEDataPoint, DayOffset } from '../types';
import { fetchPSEData } from '../utils/api';
import { processData, getDataForDay } from '../utils/dataTransform';
import { REFRESH_INTERVAL_MS, STORAGE_PREFIX } from '../utils/constants';

const DATA_CACHE_KEY = `${STORAGE_PREFIX}data-cache`;

function saveDataCache(data: PSEDataPoint[], timestamp: string): void {
  try {
    const serializable = data.map(d => ({
      ...d,
      time: d.time.toISOString(),
    }));
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({
      data: serializable,
      timestamp,
      savedAt: Date.now(),
    }));
  } catch { /* storage full */ }
}

function loadDataCache(): { data: PSEDataPoint[]; timestamp: string } | null {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const data = parsed.data.map((d: any) => ({
      ...d,
      time: new Date(d.time),
    }));
    return { data, timestamp: parsed.timestamp };
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
  isOnline: boolean;
  lastUpdate: string | null;
  dataError: boolean;
}

export function usePSEData(): UsePSEDataReturn {
  const cached = loadDataCache();
  const [allData, setAllData] = useState<PSEDataPoint[]>(cached?.data ?? []);
  const [currentDayOffset, setCurrentDayOffset] = useState<DayOffset>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string | null>(
    cached ? `${cached.timestamp} (cache)` : null
  );
  const [dataError, setDataError] = useState(false);

  // FIX: useRef guard against race condition — prevents concurrent fetches
  const isFetchingRef = useRef(false);

  const refreshData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const rawData = await fetchPSEData();

      if (rawData.length > 0) {
        const processed = processData(rawData);
        setAllData(processed);
        setIsOnline(true);
        setDataError(false);
        const timeStr = new Date().toLocaleTimeString('pl-PL', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setLastUpdate(timeStr);
        saveDataCache(processed, timeStr);
      } else {
        setIsOnline(false);
        setDataError(true);
      }
    } catch {
      setIsOnline(false);
      setDataError(true);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const switchDay = useCallback((offset: DayOffset) => {
    setCurrentDayOffset(offset);
  }, []);

  // Initial fetch
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Auto-refresh interval with cleanup
  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshData();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [refreshData]);

  const dayData = useMemo(
    () => getDataForDay(allData, currentDayOffset),
    [allData, currentDayOffset]
  );

  return {
    allData,
    dayData,
    currentDayOffset,
    switchDay,
    refreshData,
    isLoading,
    isOnline,
    lastUpdate,
    dataError,
  };
}
