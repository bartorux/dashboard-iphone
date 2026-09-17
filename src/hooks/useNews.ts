import { useCallback, useEffect, useState } from 'react';
import { readNewsFile } from '../utils/news';
import type { NewsFile } from '../utils/newsTypes';

/**
 * Reads public/news.json, written every two hours by the summary job — the
 * browser cannot read the feeds itself (no CORS on almost any of them). Same
 * shape of hook as usePrices: a 404, a dead network or a malformed file all
 * resolve to `null`, and the card is simply not there. Age is judged by the
 * card against its own clock (see newsFreshness), not here.
 */
export function useNews(): { news: NewsFile | null; refresh: () => void } {
  const [news, setNews] = useState<NewsFile | null>(null);

  const load = useCallback(() => {
    let cancelled = false;

    fetch(`${import.meta.env.BASE_URL}news.json`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!cancelled) setNews(readNewsFile(value));
      })
      .catch(() => {
        if (!cancelled) setNews(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  // A dashboard left open all day would otherwise keep the morning's headlines.
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [load]);

  return { news, refresh: load };
}
