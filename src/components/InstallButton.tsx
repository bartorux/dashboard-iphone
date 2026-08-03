import React from 'react';
import { InstallableState } from '../types';
import { DownloadIcon } from './icons';

interface InstallButtonProps {
  installableState: InstallableState;
  isInstalled: boolean;
  onInstall: () => Promise<void>;
  onShowInstructions: () => void;
}

const LABELS: Record<string, string> = {
  true: 'Zainstaluj aplikację',
  ios: 'Jak dodać do ekranu głównego',
  manual: 'Jak zainstalować',
};

const InstallButton: React.FC<InstallButtonProps> = ({
  installableState,
  isInstalled,
  onInstall,
  onShowInstructions,
}) => {
  if (isInstalled || installableState === false) return null;

  const handleClick = () => {
    if (installableState === true) {
      onInstall();
    } else {
      onShowInstructions();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-[15px] font-medium text-accent-text active:opacity-70"
    >
      <DownloadIcon className="h-4 w-4" />
      {LABELS[String(installableState)] ?? 'Zainstaluj aplikację'}
    </button>
  );
};

export default InstallButton;
