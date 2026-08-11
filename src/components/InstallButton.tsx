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

  /*
   * Nothing about installing belongs on a monitor.
   *
   * The first pass hid only the two instructional variants and kept a real
   * install prompt, on the reasoning that a button which does something has
   * earned its place. That was wrong for the screen this runs on: a dashboard
   * left open all day is not a thing anyone wants to install from, and the
   * offer reappearing on the desktop read as a regression.
   *
   * Hidden above 80rem whatever the state. Chrome still offers the install from
   * its own address bar, so nothing is actually taken away.
   */
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-[0.9375rem] font-medium text-accent-text active:opacity-70 xl:hidden"
    >
      <DownloadIcon className="h-4 w-4" />
      {LABELS[String(installableState)] ?? 'Zainstaluj aplikację'}
    </button>
  );
};

export default InstallButton;
