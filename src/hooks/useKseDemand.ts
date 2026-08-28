import { useEffect, useRef, useState } from 'react';
import { fetchKseDemand } from '../utils/api';
import { processKseDemand } from '../utils/kseDemand';

const EMPTY = new Map<number, number>();

/**
 * Country-wide demand for one business day, keyed by hour start (UTC epoch ms).
 *
 * Deliberately lighter than useRedispatch: no localStorage layer. The service
 * worker already caches this GET for an hour (NetworkFirst on the PSE host),
 * which is the only persistence this figure deserves — it exists for one
 * tooltip line, it changes intraday, and pdgobpkd publishes the current day
 * only, so an empty result for a future day is the endpoint's normal state.
 * A session-scoped map still prevents a refetch on every tab switch.
 */
export function useKseDemand(
  enabled: boolean,
  businessDate: string | null
): { byHour: Map<number, number> } {
  const [byHour, setByHour] = useState<Map<number, number>>(EMPTY);
  const perDate = useRef(new Map<string, Map<number, number>>());
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !businessDate) return;

    const cached = perDate.current.get(businessDate);
    if (cached) {
      setByHour(cached);
      return;
    }
    setByHour(EMPTY);
    if (requested.current.has(businessDate)) return;
    requested.current.add(businessDate);

    let cancelled = false;
    fetchKseDemand(businessDate)
      .then((rows) => {
        const hours = processKseDemand(rows);
        perDate.current.set(businessDate, hours);
        if (!cancelled) setByHour(hours);
      })
      .catch(() => {
        // Context, not product: a failed fetch means the tooltip omits one
        // line. Allow a retry on the next visit to this date.
        requested.current.delete(businessDate);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, businessDate]);

  return { byHour };
}
