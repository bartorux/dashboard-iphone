import React, { useEffect, useState } from 'react';
import { Settings } from '../types';
import { ThemePreference } from '../hooks/useTheme';
import SegmentedControl from './SegmentedControl';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Systemowy' },
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
];

interface SettingsPanelProps {
  visible: boolean;
  settings: Settings;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onSave: (settings: Partial<Settings>) => string | null;
  onReset: () => void;
  onNotification: (msg: string) => void;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  visible,
  settings,
  theme,
  onThemeChange,
  onSave,
  onReset,
  onNotification,
  onClose,
}) => {
  // Kept as strings so clearing a field stays cleared instead of snapping back
  // to the default on every keystroke.
  const [orange, setOrange] = useState(String(settings.orangeThreshold));
  const [red, setRed] = useState(String(settings.redThreshold));
  const [disableUpdates, setDisableUpdates] = useState(settings.disableUpdates);

  useEffect(() => {
    setOrange(String(settings.orangeThreshold));
    setRed(String(settings.redThreshold));
    setDisableUpdates(settings.disableUpdates);
  }, [settings]);

  const handleSave = () => {
    const orangeValue = Number(orange);
    const redValue = Number(red);

    if (!orange.trim() || !red.trim() || isNaN(orangeValue) || isNaN(redValue)) {
      onNotification('Podaj obie wartości progów');
      return;
    }

    const error = onSave({
      orangeThreshold: orangeValue,
      redThreshold: redValue,
      disableUpdates,
    });

    if (error) {
      onNotification(error);
      return;
    }

    onNotification('Ustawienia zapisane');
    onClose();
  };

  const handleReset = () => {
    onReset();
    onNotification('Ustawienia zresetowane');
  };

  return (
    <div className="collapsible mx-3" data-collapsed={!visible}>
      <div>
        <div className="mt-3 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="mb-2 text-[15px] font-semibold text-text">Wygląd</h2>

          <SegmentedControl
            ariaLabel="Motyw"
            role="radiogroup"
            value={theme}
            onChange={onThemeChange}
            segments={THEME_OPTIONS.map(({ value, label }) => ({ value, label }))}
            className="mb-4"
          />

          <h2 className="mb-3 text-[15px] font-semibold text-text">
            Ustawienia alertów
          </h2>

          <label className="mb-3 block">
            <span className="mb-1 block text-[13px] text-text-secondary">
              Próg alertu „Uwaga" (MW)
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={orange}
              onChange={(event) => setOrange(event.target.value)}
              min={100}
              max={1000}
              step={50}
              className="tnum w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text outline-none focus:border-accent"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-[13px] text-text-secondary">
              Próg alertu „Alarm" (MW)
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={red}
              onChange={(event) => setRed(event.target.value)}
              min={50}
              max={500}
              step={50}
              className="tnum w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text outline-none focus:border-accent"
            />
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface-2 p-3">
            <input
              type="checkbox"
              checked={disableUpdates}
              onChange={(event) => setDisableUpdates(event.target.checked)}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-accent"
            />
            <span className="flex-1">
              <span className="block text-[13px] font-medium text-text">
                Wycisz komunikaty o aktualizacjach
              </span>
              <span className="block text-[11px] text-text-tertiary">
                Ukryje informacje o nowych wersjach aplikacji
              </span>
            </span>
          </label>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="min-h-11 flex-1 rounded-xl bg-accent px-4 text-[15px] font-semibold text-white active:opacity-80"
            >
              Zapisz
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="min-h-11 flex-1 rounded-xl bg-surface-3 px-4 text-[15px] font-medium text-text active:opacity-80"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
