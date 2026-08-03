import { useCallback, useEffect, useRef, useState } from 'react';
import { PSEDataPoint } from '../types';
import { fetchPSEHistory } from '../utils/api';
import { processData } from '../utils/dataTransform';
import { STORAGE_PREFIX } from '../utils/constants';
import { addDays, getStartOfToday } from '../utils/dateHelpers';

const HISTORY_KEY = `${STORAGE_PREFIX}history-cache`;

export type HistoryState = 'idle' | 'loading' | 'ready' | 'error';

/** Past days never change, so the cache only has to survive until midnight. */
function nextMidnight(): number {
  return addDays(getStartOfToday(), 1).getTime();
}

function loadCache(): PSEDataPoint[] | null {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (typeof parsed?.validUntil !== 'number' || Date.now() >= parsed.validUntil) {
      return null;
    }
    if (!Array.isArray(parsed.data)) return null;

    return parsed.data.map((point: PSEDataPoint & { time: string }) => ({
      ...point,
      time: new Date(point.time),
    }));
  } catch {
    return null;
  }
}

function saveCache(data: PSEDataPoint[]): void {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({
        data: data.map((point) => ({ ...point, time: point.time.toISOString() })),
        validUntil: nextMidnight(),
      })
    );
  } catch {
    /* storage full or unavailable */
  }
}

/**
 * Past business days, fetched only once the user actually asks for them.
 * Whoever never opens the comparison view never pays for the transfer.
 */
export function useHistory(enabled: boolean, days = 30) {
  const [points, setPoints] = useState<PSEDataPoint[]>([]);
  const [state, setState] = useState<HistoryState>('idle');
  const requestedRef = useRef(false);

  const load = useCallback(async () => {
    const cached = loadCache();
    if (cached && cached.length > 0) {
      setPoints(cached);
      setState('ready');
      return;
    }

    setState('loading');
    try {
      const processed = processData(await fetchPSEHistory(days));
      if (processed.length === 0) {
        setState('error');
        return;
      }
      setPoints(processed);
      saveCache(processed);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [days]);

  useEffect(() => {
    if (!enabled || requestedRef.current) return;
    requestedRef.current = true;
    load();
  }, [enabled, load]);

  const retry = useCallback(() => {
    requestedRef.current = true;
    load();
  }, [load]);

  return { points, state, retry };
}
