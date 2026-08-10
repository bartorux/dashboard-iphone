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
   * The two instructional variants explain how to put the page on a home
   * screen. On a monitor left open as the main page that is advice nobody asked
   * for, so above 80rem they are hidden.
   *
   * Keyed to the state and not to width alone. `installableState === true` means
   * the browser is offering a real install and the button does something, so it
   * stays. `ios` stays too, because an iPad in landscape is wider than the
   * breakpoint and is exactly the device the instructions are written for. Only
   * `manual` — a desktop browser with no install prompt — actually disappears.
   */
  const adviceOnly = installableState !== true;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 text-[0.9375rem] font-medium text-accent-text active:opacity-70 ${
        adviceOnly ? 'xl:hidden' : ''
      }`}
    >
      <DownloadIcon className="h-4 w-4" />
      {LABELS[String(installableState)] ?? 'Zainstaluj aplikację'}
    </button>
  );
};

export default InstallButton;
