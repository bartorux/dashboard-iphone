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

/** Raw values for `<meta name="theme-color">`, which cannot take a CSS variable. */
export const STATUS_THEME_COLOR: Record<SystemStatus, string> = {
  ok: '#34c759',
  warn: '#ff9500',
  alarm: '#ff3b30',
  unknown: '#8e8e93',
};

/**
 * Word printed directly BESIDE a signed margin figure — AlertsPanel's row
 * label, ReserveTooltip's per-hour badge. Deliberately not STATUS_LABEL: that
 * one names the red/orange THRESHOLD BAND ("ALARM"/"UWAGA") and is correct
 * there — the header bar and the chart legend both name a band, with no
 * number sitting next to the word, so "ALARM" is what the band is called.
 *
 * Next to a number it reads differently. `findAlerts` classifies red at
 * `difference <= redThreshold` (default 300 MW) as an early-warning line, not
 * a deficit — a range can carry "+227 MW" and still be red. "Alarm" beside a
 * positive margin then reads as a contradiction, so the word said next to the
 * figure is reworded to match what STATUS_DESCRIPTION already calls it
 * elsewhere in this file ("Najbliższe godziny poniżej progu" / "przy progu"):
 * "Poniżej progu" for red, "Blisko progu" for orange.
 *
 * A genuine deficit — reserve actually below what's required, margin < 0 —
 * is a real state, not a forward-looking warning, and gets its own plain
 * wording: "Niedobór rezerwy".
 *
 * One function so AlertsPanel and ReserveTooltip cannot drift into two
 * different sets of literals for the same number.
 */
export function marginLabel(status: SystemStatus, margin: number): string {
  if (status === 'alarm') return margin < 0 ? 'Niedobór rezerwy' : 'Poniżej progu';
  if (status === 'warn') return 'Blisko progu';
  return STATUS_LABEL[status];
}
