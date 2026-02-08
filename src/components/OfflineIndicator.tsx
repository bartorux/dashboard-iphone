import React from 'react';

interface OfflineIndicatorProps {
  isOffline: boolean;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ isOffline }) => (
  <div
    className={`fixed bottom-[env(safe-area-inset-bottom,0px)] left-0 right-0 bg-[#8e8e93] text-white py-2 text-center text-[13px] z-50 transition-transform duration-300 ${
      isOffline ? 'translate-y-0' : 'translate-y-full'
    }`}
  >
    Tryb offline - Dane mogą być nieaktualne
  </div>
);

export default OfflineIndicator;
