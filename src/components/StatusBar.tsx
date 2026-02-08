import React from 'react';

interface StatusBarProps {
  isOnline: boolean;
  statusText: string;
  lastUpdate: string | null;
  notificationsSilenced: boolean;
  onToggleNotifications: () => void;
  onToggleSettings: () => void;
}

const StatusBar: React.FC<StatusBarProps> = ({
  isOnline,
  statusText,
  lastUpdate,
  notificationsSilenced,
  onToggleNotifications,
  onToggleSettings,
}) => (
  <div className="bg-white border-b border-[#e5e5ea] px-3 py-2 text-[13px] flex items-center justify-between">
    <div className="flex items-center">
      <div
        className={`w-2 h-2 rounded-full mr-2 shrink-0 ${
          isOnline ? 'bg-[#34c759]' : 'bg-[#ff3b30]'
        }`}
      />
      <span>{statusText}</span>
    </div>
    <div className="flex items-center gap-3">
      <button
        onClick={onToggleNotifications}
        className={`bg-transparent border-none text-base cursor-pointer p-1 rounded transition-all ${
          notificationsSilenced ? 'opacity-30' : 'opacity-70'
        }`}
        title={
          notificationsSilenced
            ? 'Powiadomienia wyłączone'
            : 'Powiadomienia włączone'
        }
      >
        {notificationsSilenced ? '\uD83D\uDD15' : '\uD83D\uDD14'}
      </button>
      <button
        onClick={onToggleSettings}
        className="bg-transparent border-none text-base cursor-pointer p-1 rounded transition-all opacity-70"
        title="Ustawienia"
      >
        \u2699\uFE0F
      </button>
      {lastUpdate && (
        <div className="text-xs text-[#8e8e93]">{lastUpdate}</div>
      )}
    </div>
  </div>
);

export default StatusBar;
