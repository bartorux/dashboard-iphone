import { useEffect, useState } from 'react';

export interface Summary {
  headline: string;
  body: string;
  outlook: string;
  generatedAt: string;
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
  return (
    ['headline', 'body', 'outlook', 'generatedAt'].every(
      (key) => typeof record[key] === 'string' && record[key] !== ''
    ) && !Number.isNaN(Date.parse(record.generatedAt as string))
  );
}

/**
 * Reads a file written by a scheduled job. Opening the app never generates
 * anything, so the number of people looking has no bearing on the model's quota.
 *
 * Every failure resolves to null and the card simply does not appear: the chart,
 * the alerts and the analysis all come straight from PSE and owe this nothing.
 */
export function useSummary(now: Date): Summary | null {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}summary.json`)
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

  if (!summary) return null;

  const age = now.getTime() - Date.parse(summary.generatedAt);
  return age >= 0 && age < MAX_AGE_MS ? summary : null;
}
