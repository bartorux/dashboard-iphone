import { useState, useCallback, useRef } from 'react';
import { PSEDataPoint, AlertSet, AlertHistory } from '../types';
import { findAlerts } from '../utils/dataTransform';

interface UseAlertsReturn {
  alerts: AlertSet;
  newAlertsCount: number;
  updateAlerts: (
    dayData: PSEDataPoint[],
    orangeThreshold: number,
    redThreshold: number
  ) => void;
}

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<AlertSet>({ orange: [], red: [] });
  const [newAlertsCount, setNewAlertsCount] = useState(0);
  const historyRef = useRef<AlertHistory>({
    orange: [],
    red: [],
    lastResetDate: null,
  });
  const lastSeenTimeRef = useRef(Date.now());

  const updateAlerts = useCallback(
    (
      dayData: PSEDataPoint[],
      orangeThreshold: number,
      redThreshold: number
    ) => {
      const newAlerts = findAlerts(dayData, orangeThreshold, redThreshold);
      setAlerts(newAlerts);

      // Daily reset
      const today = new Date().toDateString();
      if (historyRef.current.lastResetDate !== today) {
        historyRef.current = {
          orange: [],
          red: [],
          lastResetDate: today,
        };
        lastSeenTimeRef.current = Date.now();
      }

      // Count new alerts not seen before
      let count = 0;
      const now = Date.now();

      for (const alert of newAlerts.orange) {
        if (!historyRef.current.orange.some((a) => a.time === alert.time)) {
          historyRef.current.orange.push({ ...alert, detectedAt: now });
          if (now - lastSeenTimeRef.current > 60000) count++;
        }
      }

      for (const alert of newAlerts.red) {
        if (!historyRef.current.red.some((a) => a.time === alert.time)) {
          historyRef.current.red.push({ ...alert, detectedAt: now });
          if (now - lastSeenTimeRef.current > 60000) count++;
        }
      }

      setNewAlertsCount(count);
      lastSeenTimeRef.current = now;
    },
    []
  );

  return { alerts, newAlertsCount, updateAlerts };
}
