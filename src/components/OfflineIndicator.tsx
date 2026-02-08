import React from 'react';

interface OfflineIndicatorProps {
  isOffline: boolean;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ isOffline }) => {
  if (!isOffline) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#8e8e93] text-white py-2 text-center text-[13px] z-50 pb-[max(8px,env(safe-area-inset-bottom,8px))]">
      Tryb offline - Dane mogą być nieaktualne
    </div>
  );
};

export default OfflineIndicator;
