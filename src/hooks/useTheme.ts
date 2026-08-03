import { useCallback, useEffect, useState } from 'react';
import { STORAGE_PREFIX } from '../utils/constants';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = `${STORAGE_PREFIX}theme`;

function loadPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

/**
 * Colour scheme preference. 'system' removes the attribute entirely so the
 * `prefers-color-scheme` rules in App.css take over; the other two pin it.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(loadPreference);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = preference;
    }

    try {
      localStorage.setItem(THEME_KEY, preference);
    } catch {
      /* storage unavailable */
    }
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
  }, []);

  return { preference, setTheme };
}
