import { useCallback, useEffect, useState } from 'react';
import { PriceDay, PriceHour, PricesFile } from '../utils/cenyTypes';

/**
 * pradcast.pl generator writes public/ceny.json; this reads it. Same shape of
 * hook as useSummary.ts on purpose: a file written by a scheduled job, opening
 * the app never generates anything, and every failure resolves to "no prices"
 * rather than surfacing anywhere — the reserve chart above and everything else
 * on this page comes straight from PSE and owes the price strip nothing.
 */

function isFiniteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isHour(value: unknown): value is PriceHour {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.hour === 'number' &&
    record.hour >= 0 &&
    record.hour <= 23 &&
    typeof record.price === 'number' &&
    Number.isFinite(record.price) &&
    isFiniteOrNull(record.p10) &&
    isFiniteOrNull(record.p90)
  );
}

const SOURCES = new Set(['confirmed', 'forecast']);
const HORIZONS = new Set(['D+1', 'D+2', 'D+3']);
const CONFIDENCES = new Set(['high', 'medium', 'low']);

function isDay(value: unknown): value is PriceDay {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.date === 'string' &&
    record.date !== '' &&
    typeof record.source === 'string' &&
    SOURCES.has(record.source) &&
    (record.horizon === null || (typeof record.horizon === 'string' && HORIZONS.has(record.horizon))) &&
    (record.confidence === null ||
      (typeof record.confidence === 'string' && CONFIDENCES.has(record.confidence))) &&
    Array.isArray(record.hours) &&
    record.hours.every(isHour)
  );
}

function usable(value: unknown): value is PricesFile {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.changedAt === 'string' &&
    record.changedAt !== '' &&
    record.source === 'pradcast.pl' &&
    Array.isArray(record.days) &&
    record.days.every(isDay)
  );
}

/**
 * Reads public/ceny.json. A malformed file, a 404 or a dead network all
 * resolve to `null`: the price strip simply does not render, exactly like the
 * summary card and unlike the reserve chart, which does surface a "no data"
 * state — a chart absent because the market has not cleared yet is normal
 * (see cenyTypes.ts: only today through D+3 are ever present), not an error
 * worth a message on screen.
 */
export function usePrices(): {
  prices: PricesFile | null;
  refresh: () => void;
} {
  const [prices, setPrices] = useState<PricesFile | null>(null);

  const load = useCallback(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}ceny.json`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!cancelled) setPrices(usable(value) ? value : null);
      })
      .catch(() => {
        if (!cancelled) setPrices(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  /*
   * Same reasoning as useSummary's own visibilitychange handler: returning to
   * an already-open PWA does not remount the page, so a mount-only fetch would
   * leave the strip showing whatever price was current when the tab was last
   * opened. pradcast polls through the day, most sharply once the day-ahead
   * auction clears, so a reader who parked the app open before that would
   * otherwise never see the fixing land.
   */
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) load();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [load]);

  return { prices, refresh: load };
}
