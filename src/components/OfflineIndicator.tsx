import React from 'react';
import { CloudOffIcon } from './icons';

interface OfflineIndicatorProps {
  isOffline: boolean;
  lastUpdate: string | null;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isOffline,
  lastUpdate,
}) => {
  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 bg-text-tertiary px-4 py-2 text-[13px] text-white"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <CloudOffIcon className="h-4 w-4 shrink-0" />
      <span>
        Tryb offline
        {lastUpdate ? ` · dane z ${lastUpdate}` : ' · brak danych'}
      </span>
    </div>
  );
};

export default OfflineIndicator;
