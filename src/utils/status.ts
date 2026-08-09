import { SystemStatus } from '../types';

export const STATUS_LABEL: Record<SystemStatus, string> = {
  ok: 'OK',
  warn: 'UWAGA',
  alarm: 'ALARM',
  unknown: 'Brak danych',
};

/**
 * Each one names its own horizon, because the bar reports only the next few
 * hours (`getUpcomingStatus` weighs three blocks) while the card beneath it
 * covers three days. Unqualified, a green "reserve is fine" read as a promise
 * about the whole day and appeared to contradict a card warning about the
 * evening — both true, but only one of them said what it was talking about.
 *
 * The horizon is worded rather than counted: the window is a detail of the
 * implementation, and a figure there would invite reading it as a guarantee.
 */
export const STATUS_DESCRIPTION: Record<SystemStatus, string> = {
  ok: 'Najbliższe godziny w normie',
  warn: 'Najbliższe godziny przy progu',
  alarm: 'Najbliższe godziny poniżej progu',
  unknown: 'Brak danych do oceny',
};

/**
 * Class maps are written out in full so Tailwind's scanner sees every literal.
 * Composing them (`bg-${status}`) would silently drop the utilities at build time.
 */
export const STATUS_HEADER_BG: Record<SystemStatus, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  alarm: 'bg-alarm',
  unknown: 'bg-text-tertiary',
};

export const STATUS_TEXT: Record<SystemStatus, string> = {
  ok: 'text-ok-text',
  warn: 'text-warn-text',
  alarm: 'text-alarm-text',
  unknown: 'text-text-tertiary',
};

export const STATUS_SOFT_BG: Record<SystemStatus, string> = {
  ok: 'bg-ok-soft',
  warn: 'bg-warn-soft',
  alarm: 'bg-alarm-soft',
  unknown: 'bg-surface-2',
};

export const STATUS_DOT: Record<SystemStatus, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  alarm: 'bg-alarm',
  unknown: 'bg-text-tertiary',
};

/** Raw values for `<meta name="theme-color">`, which cannot take a CSS variable. */
export const STATUS_THEME_COLOR: Record<SystemStatus, string> = {
  ok: '#34c759',
  warn: '#ff9500',
  alarm: '#ff3b30',
  unknown: '#8e8e93',
};
