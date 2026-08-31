import { useCallback, useEffect, useState } from 'react';

/**
 * Recharts takes colours as prop values, not as CSS — `stroke="var(--x)"` is not
 * resolved for the SVG it generates. So we read the tokens off the document and
 * re-read them whenever the system flips between light and dark.
 */
const TOKENS = {
  reserve: '--series-reserve',
  required: '--series-required',
  grid: '--separator',
  axis: '--text-tertiary',
  surface: '--surface',
  text: '--text',
  textSecondary: '--text-secondary',
  warn: '--warn',
  alarm: '--alarm',
  accent: '--accent',
  bandAlarm: '--band-alarm',
  /** Far end of the alarm zone's gradient, at the axis. See --band-alarm. */
  bandAlarmFade: '--band-alarm-fade',
  bandWarn: '--band-warn',
  bandAlarmEdge: '--band-alarm-edge',
  bandWarnEdge: '--band-warn-edge',
  demand: '--series-demand',
  pv: '--series-pv',
  wind: '--series-wind',
  pvFill: '--series-pv-fill',
  windFill: '--series-wind-fill',
  exchange: '--series-exchange',
  other: '--series-other',
  /**
   * Not a colour — the opacity an area fill is washed to. It rides along here
   * because it has to be chosen per theme and this hook is already the one
   * place that reads a token, watches `data-theme` and the system setting, and
   * hands the result to Recharts as a prop. A separate hook would duplicate
   * that subscription to answer a question of the same kind: "what does this
   * token say right now". Read it with Number().
   */
  fillOpacity: '--series-fill-opacity',
  threshold: '--series-threshold',
  history: '--series-history',
  bandHistory: '--band-history',
} as const;

export type ChartColors = Record<keyof typeof TOKENS, string>;

/** Used in jsdom and before first paint, where computed styles are empty. */
const FALLBACK: ChartColors = {
  reserve: '#007aff',
  required: '#8e8e93',
  grid: 'rgba(60,60,67,0.18)',
  axis: '#8e8e93',
  surface: '#ffffff',
  text: '#000000',
  textSecondary: '#6c6c70',
  warn: '#ff9500',
  alarm: '#ff3b30',
  accent: '#007aff',
  bandAlarm: 'rgba(255,74,54,0.36)',
  bandAlarmFade: 'rgba(255,74,54,0.035)',
  bandWarn: 'rgba(255,196,0,0.34)',
  bandAlarmEdge: '#b3271c',
  bandWarnEdge: '#ab8200',
  demand: '#1c1c1e',
  pv: '#ffb020',
  pvFill: '#ffb020',
  windFill: '#32ade6',
  wind: '#32ade6',
  exchange: '#af52de',
  other: '#5b6470',
  fillOpacity: '0.18',
  threshold: '#5856d6',
  history: '#8e8e93',
  bandHistory: 'rgba(142,142,147,0.18)',
};

function readColors(): ChartColors {
  if (typeof window === 'undefined') return FALLBACK;

  const styles = window.getComputedStyle(document.documentElement);
  const entries = Object.entries(TOKENS).map(([key, token]) => {
    const value = styles.getPropertyValue(token).trim();
    return [key, value || FALLBACK[key as keyof ChartColors]];
  });

  return Object.fromEntries(entries) as ChartColors;
}

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readColors);

  const refresh = useCallback(() => setColors(readColors()), []);

  useEffect(() => {
    refresh();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', refresh);

    // The manual theme switch flips data-theme on <html>, which no media query
    // reports — watch the attribute so the chart repaints with it.
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      media.removeEventListener('change', refresh);
      observer.disconnect();
    };
  }, [refresh]);

  return colors;
}
