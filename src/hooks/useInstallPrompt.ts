import { useState, useEffect, useCallback } from 'react';
import { InstallableState } from '../types';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UseInstallPromptReturn {
  installableState: InstallableState;
  isInstalled: boolean;
  install: () => Promise<void>;
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [installableState, setInstallableState] =
    useState<InstallableState>(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Check if already installed
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches;
    const isIOSStandalone = (navigator as { standalone?: boolean }).standalone === true;

    if (isStandalone || isIOSStandalone) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setInstallableState(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallableState(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Detect iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari) {
      setInstallableState('ios');
    }

    // Fallback after timeout
    const timer = setTimeout(() => {
      setInstallableState((prev) => {
        if (prev === false) return 'manual';
        return prev;
      });
    }, 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeout(timer);
    };
  }, []);

  const install = useCallback(async () => {
    if (promptEvent && installableState === true) {
      promptEvent.prompt();
      const result = await promptEvent.userChoice;
      if (result.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setPromptEvent(null);
      setInstallableState(false);
    }
  }, [promptEvent, installableState]);

  return { installableState, isInstalled, install };
}
