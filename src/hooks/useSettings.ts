import { useState, useCallback } from 'react';
import { Settings } from '../types';
import {
  DEFAULT_ORANGE_THRESHOLD,
  DEFAULT_RED_THRESHOLD,
  STORAGE_PREFIX,
  SETTINGS_VERSION,
} from '../utils/constants';

const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;

const DEFAULT_SETTINGS: Settings = {
  orangeThreshold: DEFAULT_ORANGE_THRESHOLD,
  redThreshold: DEFAULT_RED_THRESHOLD,
  version: SETTINGS_VERSION,
};

/**
 * Older entries may still carry a `disableUpdates` key from when the update
 * banner existed. Spreading over the defaults ignores it, so no migration is
 * needed — the extra field simply never reaches the app.
 */
function loadFromStorage(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: add version if missing
      if (!parsed.version) {
        parsed.version = SETTINGS_VERSION;
      }
      // Only known keys: spreading the whole parsed object carried forward
      // fields from settings that no longer exist, so the object disagreed
      // with its own type.
      return {
        ...DEFAULT_SETTINGS,
        orangeThreshold:
          typeof parsed.orangeThreshold === 'number'
            ? parsed.orangeThreshold
            : DEFAULT_SETTINGS.orangeThreshold,
        redThreshold:
          typeof parsed.redThreshold === 'number'
            ? parsed.redThreshold
            : DEFAULT_SETTINGS.redThreshold,
      };
    }
  } catch {
    // Corrupted data, use defaults
  }
  return { ...DEFAULT_SETTINGS };
}

function saveToStorage(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable
  }
}

interface UseSettingsReturn {
  settings: Settings;
  saveSettings: (newSettings: Partial<Settings>) => string | null;
  resetSettings: () => void;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(loadFromStorage);

  const saveSettings = useCallback(
    (newSettings: Partial<Settings>): string | null => {
      const merged = { ...settings, ...newSettings };

      // Validate: red threshold must be less than orange
      if (merged.redThreshold >= merged.orangeThreshold) {
        return 'Próg czerwony musi być mniejszy niż pomarańczowy';
      }

      setSettings(merged);
      saveToStorage(merged);
      return null; // no error
    },
    [settings]
  );

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    saveToStorage({ ...DEFAULT_SETTINGS });
  }, []);

  return { settings, saveSettings, resetSettings };
}
