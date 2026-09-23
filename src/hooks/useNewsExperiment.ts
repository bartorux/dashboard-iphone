import { useState } from 'react';
import { useMediaQuery } from './useMediaQuery';
import { STORAGE_PREFIX } from '../utils/constants';

/**
 * Three ways of putting "Z branży" on a phone, to be tried in daily use rather
 * than judged from mock-ups — twelve of those were turned down, and how an
 * entry wears over a day is not something a still picture shows:
 *
 *   ?z-branzy=pasek  an icon in the header, beside the gear, opening a sheet
 *   ?z-branzy=dol    a bar fixed to the bottom of the screen, opening a sheet
 *   ?z-branzy=gora   three headlines under the AI summary, nothing to open
 *   ?z-branzy=brak   back to the page as it is without any of them
 *
 * Temporary. The one kept will be finished properly and this hook removed with
 * the other two.
 */
export type NewsExperiment = 'pasek' | 'dol' | 'gora';

const PARAM = 'z-branzy';
const VARIANTS: readonly NewsExperiment[] = ['pasek', 'dol', 'gora'];

/**
 * Session, not local: the choice has to outlive a trip to an article and back
 * (and a reload by the browser meanwhile), but not the tab. A variant left on
 * for good would quietly become the product.
 */
export const NEWS_EXPERIMENT_KEY = `${STORAGE_PREFIX}z-branzy`;

/** Where the page stops being a phone — the same line SettingsPanel draws (SIDE_PANEL_QUERY). */
const WIDE_QUERY = '(min-width: 48rem)';

const isVariant = (value: string | null): value is NewsExperiment =>
  value !== null && (VARIANTS as readonly string[]).includes(value);

/**
 * The variant this page load asked for, or the one this tab chose earlier.
 *
 * Any value of the parameter that is not a variant — `brak` is the one written
 * down, but a typo counts the same — clears the choice: whoever typed it asked
 * for something other than what they had.
 */
export function readNewsExperiment(search: string): NewsExperiment | null {
  const asked = new URLSearchParams(search).get(PARAM);
  try {
    if (asked === null) {
      const stored = sessionStorage.getItem(NEWS_EXPERIMENT_KEY);
      return isVariant(stored) ? stored : null;
    }
    if (isVariant(asked)) {
      sessionStorage.setItem(NEWS_EXPERIMENT_KEY, asked);
      return asked;
    }
    sessionStorage.removeItem(NEWS_EXPERIMENT_KEY);
    return null;
  } catch {
    // No storage (a locked-down private tab): the address alone decides.
    return isVariant(asked) ? asked : null;
  }
}

/**
 * Which variant App shows, or `null` for the page as it has always been.
 *
 * Read once, when App mounts: a variant that changed under the reader's thumb
 * mid-session would say nothing about living with it. `null` from 48rem up
 * whatever was asked for — the computer already has its card and panel, and
 * the experiment must not touch them.
 */
export function useNewsExperiment(): NewsExperiment | null {
  const [chosen] = useState(() => (typeof window === 'undefined' ? null : readNewsExperiment(window.location.search)));
  const wide = useMediaQuery(WIDE_QUERY);
  return wide ? null : chosen;
}
