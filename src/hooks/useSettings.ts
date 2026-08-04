import { useState, useCallback } from 'react';
import { Settings } from '../types';
import {
  DEFAULT_ORANGE_THRESHOLD,
  DEFAULT_RED_THRESHOLD,
  ORANGE_THRESHOLD_MAX,
  RED_THRESHOLD_MAX,
  RED_THRESHOLD_MIN,
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
/** Values written before the bounds existed still sit in storage. */
function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

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
      const red = clamp(
        parsed.redThreshold,
        RED_THRESHOLD_MIN,
        RED_THRESHOLD_MAX,
        DEFAULT_SETTINGS.redThreshold
      );
      return {
        ...DEFAULT_SETTINGS,
        redThreshold: red,
        // Clamped on read, not rejected: refusing to load would leave the app
        // with no settings at all, and anything saved before the bounds existed
        // would otherwise keep breaking the chart on every visit.
        orangeThreshold: Math.max(
          red + 1,
          clamp(
            parsed.orangeThreshold,
            RED_THRESHOLD_MIN + 1,
            ORANGE_THRESHOLD_MAX,
            DEFAULT_SETTINGS.orangeThreshold
          )
        ),
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

      // Rejected rather than clamped: silently replacing what someone typed is
      // worse than declining it. Names match the form fields — the message used
      // to speak of colours that the interface has not shown since the redesign.
      if (
        merged.redThreshold < RED_THRESHOLD_MIN ||
        merged.redThreshold > RED_THRESHOLD_MAX
      ) {
        return `Próg Alarm: od ${RED_THRESHOLD_MIN} do ${RED_THRESHOLD_MAX} MW`;
      }
      if (
        merged.orangeThreshold < RED_THRESHOLD_MIN + 1 ||
        merged.orangeThreshold > ORANGE_THRESHOLD_MAX
      ) {
        return `Próg Uwaga: od ${RED_THRESHOLD_MIN + 1} do ${ORANGE_THRESHOLD_MAX} MW`;
      }
      if (merged.redThreshold >= merged.orangeThreshold) {
        return 'Próg Alarm musi być niższy niż Uwaga';
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
