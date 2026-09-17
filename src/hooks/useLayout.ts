import { useCallback, useEffect, useState } from 'react';
import { STORAGE_PREFIX } from '../utils/constants';
import { CardId, DEFAULT_LAYOUT, Layout, readLayout, toggleCard } from '../utils/layout';

const KEY = `${STORAGE_PREFIX}layout`;

function save(layout: Layout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Private browsing or a full quota: the layout then lasts this session only.
  }
}

/**
 * The desktop layout, remembered in this browser.
 *
 * Its own key, not part of `settings`: a hand-edited or corrupt layout must not
 * be able to take the margin thresholds down with it, and "Przywróć układ"
 * names exactly what it restores. Saved whole on every change — a switch is a
 * decision, not typing, so there is nothing to debounce (unlike the threshold
 * field and its idle timer).
 */
export function useLayout(): {
  layout: Layout;
  toggle: (id: CardId) => void;
  setChart: (chart: Layout['chart']) => void;
  reset: () => void;
} {
  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return readLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    } catch {
      return DEFAULT_LAYOUT;
    }
  });

  // The chart's height drives the width of its column too (see --chart-vh in
  // App.css), so it is written where both rules can read it.
  useEffect(() => {
    document.documentElement.dataset.chart = layout.chart;
    return () => {
      delete document.documentElement.dataset.chart;
    };
  }, [layout.chart]);

  const commit = useCallback((next: Layout) => {
    setLayout(next);
    save(next);
  }, []);

  return {
    layout,
    toggle: useCallback((id: CardId) => commit(toggleCard(layout, id)), [commit, layout]),
    setChart: useCallback((chart: Layout['chart']) => commit({ ...layout, chart }), [commit, layout]),
    reset: useCallback(() => commit(DEFAULT_LAYOUT), [commit]),
  };
}
