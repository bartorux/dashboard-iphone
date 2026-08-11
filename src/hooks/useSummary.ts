import { useCallback, useEffect, useState } from 'react';

export interface Summary {
  headline: string;
  body: string;
  outlook: string;
  generatedAt: string;
  /** Business dates covered, so the card can name its own span. */
  dates: string[];
}

/**
 * Past this age the text is hidden rather than shown stale. A summary names
 * particular hours, and once those are behind us it describes a different day
 * from the chart beneath it — which is worse than saying nothing.
 */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function usable(value: unknown): value is Summary {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;

  const textFields = ['headline', 'generatedAt'].every(
    (key) => typeof record[key] === 'string' && record[key] !== ''
  );

  /*
   * body and outlook are checked for type but not for content, because either
   * one is empty by design depending on the shape the prompt asked for: a quiet
   * period with nothing to explain drops TREŚĆ, and a quiet period WITH a cause
   * drops DALEJ, since there the verdict belongs in the headline.
   *
   * This guard is the third and last layer to know that, after the parser and
   * the validator, and it is the one that got missed the first time: the
   * generator wrote a valid two-line summary, the file published, and this
   * check — written when three fields were always present — read the empty one
   * as a broken file and refused the lot. Nothing errored; the card simply was
   * not there, and it was found by accident. Both fields are now typed here and
   * required to be non-empty in pairs, never individually.
   */
  const linesPresent =
    typeof record.body === 'string' &&
    typeof record.outlook === 'string' &&
    (record.body !== '' || record.outlook !== '');

  // A card that cannot say which days it covers is the very thing this field
  // exists to prevent, so a file without it is refused rather than shown bare.
  const dates =
    Array.isArray(record.dates) &&
    record.dates.length > 0 &&
    record.dates.every((entry) => typeof entry === 'string' && entry !== '');

  return (
      textFields &&
      linesPresent &&
      dates &&
      !Number.isNaN(Date.parse(record.generatedAt as string))
  );
}

/**
 * Reads a file written by a scheduled job. Opening the app never generates
 * anything, so the number of people looking has no bearing on the model's quota.
 *
 * Every failure resolves to null and the card simply does not appear: the chart,
 * the alerts and the analysis all come straight from PSE and owe this nothing.
 */
export function useSummary(now: Date): {
  summary: Summary | null;
  refresh: () => void;
} {
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}summary.json`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!cancelled) setSummary(usable(value) ? value : null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  /**
   * Fetched once on mount was not enough. Returning to a PWA does not remount
   * the page, so the chart refreshed itself on resume while the text above it
   * stayed as it was — the two then described different moments, which is worse
   * than either being briefly absent. The generator writes a new text every hour
   * or so, and this is the only chance to pick it up short of killing the app.
   */
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) load();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [load]);

  if (!summary) return { summary: null, refresh: load };

  const age = now.getTime() - Date.parse(summary.generatedAt);
  return {
    summary: age >= 0 && age < MAX_AGE_MS ? summary : null,
    refresh: load,
  };
}
