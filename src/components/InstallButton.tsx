import React from 'react';
import { InstallableState } from '../types';

interface InstallButtonProps {
  installableState: InstallableState;
  isInstalled: boolean;
  onInstall: () => Promise<void>;
  onShowInstructions: () => void;
}

const InstallButton: React.FC<InstallButtonProps> = ({
  installableState,
  isInstalled,
  onInstall,
  onShowInstructions,
}) => {
  if (isInstalled) return null;

  const handleClick = () => {
    if (installableState === true) {
      onInstall();
    } else {
      onShowInstructions();
    }
  };

  const getLabel = () => {
    if (installableState === true) return 'Zainstaluj automatycznie';
    if (installableState === 'ios') return 'Instrukcje dla iOS';
    if (installableState === 'manual') return 'Instrukcje instalacji';
    return 'Zainstaluj aplikację';
  };

  const isAuto = installableState === true;

  return (
    <button
      onClick={handleClick}
      className={`w-full py-2.5 border-none rounded-lg text-sm font-medium cursor-pointer transition-all mt-2 mb-2 text-white shadow-md ${
        isAuto
          ? 'bg-gradient-to-br from-[#00d4aa] to-[#00b894]'
          : 'bg-gradient-to-br from-[#34c759] to-[#30d158]'
      }`}
    >
      {getLabel()}
    </button>
  );
};

export default InstallButton;
