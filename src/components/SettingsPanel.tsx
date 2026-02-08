import React, { useState, useEffect } from 'react';
import { Settings } from '../types';

interface SettingsPanelProps {
  visible: boolean;
  settings: Settings;
  onSave: (settings: Partial<Settings>) => string | null;
  onReset: () => void;
  onNotification: (msg: string) => void;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  visible,
  settings,
  onSave,
  onReset,
  onNotification,
  onClose,
}) => {
  const [orange, setOrange] = useState(settings.orangeThreshold);
  const [red, setRed] = useState(settings.redThreshold);
  const [disableUpdates, setDisableUpdates] = useState(
    settings.disableUpdates
  );

  // Sync local state when settings change externally
  useEffect(() => {
    setOrange(settings.orangeThreshold);
    setRed(settings.redThreshold);
    setDisableUpdates(settings.disableUpdates);
  }, [settings]);

  const handleSave = () => {
    const error = onSave({
      orangeThreshold: orange,
      redThreshold: red,
      disableUpdates,
    });
    if (error) {
      onNotification(error);
    } else {
      onNotification('Ustawienia zapisane');
      onClose();
    }
  };

  const handleReset = () => {
    onReset();
    onNotification('Ustawienia zresetowane');
  };

  return (
    <div
      className={`bg-white border-b border-[#e5e5ea] overflow-hidden transition-all duration-300 ${
        visible ? 'max-h-[400px] overflow-y-auto' : 'max-h-0'
      }`}
    >
      <div className="p-4">
        <h4 className="m-0 mb-3 text-sm font-semibold">
          Ustawienia alertów
        </h4>

        <div className="my-3">
          <label className="block mb-1 font-medium text-[#333] text-sm leading-snug">
            Próg alertu pomarańczowego (MW):
          </label>
          <input
            type="number"
            value={orange}
            onChange={(e) => setOrange(parseInt(e.target.value) || 500)}
            min={100}
            max={1000}
            step={50}
            className="w-full px-3 py-2 border border-[#ddd] rounded-md text-sm"
          />
        </div>

        <div className="my-3">
          <label className="block mb-1 font-medium text-[#333] text-sm leading-snug">
            Próg alertu czerwonego (MW):
          </label>
          <input
            type="number"
            value={red}
            onChange={(e) => setRed(parseInt(e.target.value) || 300)}
            min={50}
            max={500}
            step={50}
            className="w-full px-3 py-2 border border-[#ddd] rounded-md text-sm"
          />
        </div>

        <div className="mt-4 p-3 bg-[#f8f9fa] rounded-lg border border-[#e9ecef] select-none">
          <label className="flex items-start cursor-pointer text-[13px] leading-relaxed text-[#495057] p-1 rounded transition-colors active:bg-[rgba(0,122,255,0.1)]">
            <input
              type="checkbox"
              checked={disableUpdates}
              onChange={(e) => setDisableUpdates(e.target.checked)}
              className="w-[18px] h-[18px] mr-2.5 mt-0.5 shrink-0 accent-[#007aff] cursor-pointer"
            />
            <span className="flex-1 font-medium">
              Wyłącz powiadomienia o aktualizacjach
            </span>
          </label>
          <div className="text-[11px] text-[#6c757d] mt-1 ml-7">
            Ukryje komunikaty o nowych wersjach aplikacji
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            className="flex-1 py-2 px-4 border-none rounded-md text-sm cursor-pointer transition-all bg-[#34c759] text-white"
          >
            Zapisz
          </button>
          <button
            onClick={handleReset}
            className="flex-1 py-2 px-4 border-none rounded-md text-sm cursor-pointer transition-all bg-[#8e8e93] text-white"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
