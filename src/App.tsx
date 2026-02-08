import { useState, useCallback, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Header from './components/Header';
import StatusBar from './components/StatusBar';
import DayNavigation from './components/DayNavigation';
import ReserveChart from './components/ReserveChart';
import TrendsSection from './components/TrendsSection';
import AlertsPanel from './components/AlertsPanel';
import SettingsPanel from './components/SettingsPanel';
import PullToRefresh from './components/PullToRefresh';
import NotificationBanner from './components/NotificationBanner';
import OfflineIndicator from './components/OfflineIndicator';
import InstallButton from './components/InstallButton';
import { usePSEData } from './hooks/usePSEData';
import { useSettings } from './hooks/useSettings';
import { useAlerts } from './hooks/useAlerts';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { DayOffset } from './types';
import { STORAGE_PREFIX } from './utils/constants';

function App() {
  const {
    allData,
    dayData,
    currentDayOffset,
    switchDay,
    refreshData,
    isLoading,
    isOnline: dataOnline,
    lastUpdate,
    dataError,
  } = usePSEData();

  const { settings, saveSettings, resetSettings } = useSettings();
  const { alerts, updateAlerts } = useAlerts();
  const browserOnline = useOnlineStatus();
  const { pullDistance, isRefreshing, isPulling, isReady } =
    usePullToRefresh(refreshData);
  const { installableState, isInstalled, install } = useInstallPrompt();

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [notificationsSilenced, setNotificationsSilenced] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationKey, setNotificationKey] = useState(0);

  // PWA update prompt via Workbox
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // Update alerts when data or settings change
  useEffect(() => {
    if (dayData.length > 0) {
      updateAlerts(dayData, settings.orangeThreshold, settings.redThreshold);
    }
  }, [dayData, settings.orangeThreshold, settings.redThreshold, updateAlerts]);

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setNotificationKey((k) => k + 1);
  }, []);

  const handleSwitchDay = useCallback(
    (offset: DayOffset) => {
      switchDay(offset);
    },
    [switchDay]
  );

  // Show offline only when we actually failed to fetch data (not during loading)
  const isOffline = !dataOnline && !isLoading;

  const statusText = isLoading
    ? 'Pobieranie danych...'
    : dataError
    ? 'Brak danych'
    : `Połączono | ${allData.filter((d) => d.reserve !== null).length} punktów`;

  const handleShowInstructions = useCallback(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      showNotification(
        'iOS Safari: Udostępnij -> Dodaj do ekranu głównego'
      );
    } else {
      showNotification('Menu przeglądarki -> Dodaj do ekranu głównego');
    }
  }, [showNotification]);

  // FIX: Hard reset clears only PSE-prefixed localStorage keys
  const handleHardReset = useCallback(async () => {
    if (
      !window.confirm(
        'Czy na pewno chcesz wyczyścić wszystkie dane aplikacji?'
      )
    )
      return;

    // Clear only PSE-related keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // Clear caches
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }

    // Unregister service workers with await
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }

    window.location.reload();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#f2f2f7] overflow-x-hidden" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif" }}>
      <NotificationBanner key={notificationKey} message={notification} />
      <OfflineIndicator isOffline={isOffline} />

      <Header />

      <div className="relative overflow-x-hidden">
        <PullToRefresh
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          isPulling={isPulling}
          isReady={isReady}
        />

        <StatusBar
          isOnline={dataOnline}
          statusText={statusText}
          lastUpdate={lastUpdate}
          notificationsSilenced={notificationsSilenced}
          onToggleNotifications={() =>
            setNotificationsSilenced((s) => {
              const next = !s;
              showNotification(
                `Powiadomienia ${next ? 'wyłączone' : 'włączone'}`
              );
              return next;
            })
          }
          onToggleSettings={() => setSettingsVisible((v) => !v)}
        />

        <SettingsPanel
          visible={settingsVisible}
          settings={settings}
          onSave={saveSettings}
          onReset={resetSettings}
          onNotification={showNotification}
          onClose={() => setSettingsVisible(false)}
        />

        <DayNavigation
          currentDay={currentDayOffset}
          onSwitchDay={handleSwitchDay}
        />

        <ReserveChart
          data={dayData}
          alerts={alerts}
          currentDayOffset={currentDayOffset}
        />

        <TrendsSection
          dayData={dayData}
          allData={allData}
          currentDayOffset={currentDayOffset}
          orangeThreshold={settings.orangeThreshold}
          redThreshold={settings.redThreshold}
        />

        <AlertsPanel alerts={alerts} currentDayOffset={currentDayOffset} />

        {/* Actions */}
        <div className="bg-white p-3 border-t border-[#e5e5ea]">
          <button
            onClick={() => refreshData()}
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-br from-[#c0392b] to-[#e74c3c] text-white border-none rounded-[10px] text-base font-semibold cursor-pointer transition-all shadow-[0_2px_8px_rgba(192,57,43,0.3)] disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-px"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <span className="inline-block w-4 h-4 border-2 border-white/30 rounded-full border-t-white animate-spin mr-2" />
                Odświeżanie...
              </span>
            ) : (
              'Odśwież'
            )}
          </button>

          <InstallButton
            installableState={installableState}
            isInstalled={isInstalled}
            onInstall={install}
            onShowInstructions={handleShowInstructions}
          />

          {needRefresh && !settings.disableUpdates && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="w-full py-2.5 border-none rounded-lg text-sm font-medium cursor-pointer transition-all mt-2 text-white bg-gradient-to-br from-[#007aff] to-[#5856d6] shadow-md"
            >
              Aktualizuj aplikację
            </button>
          )}

          <button
            onClick={handleHardReset}
            className="w-full py-2.5 border-none rounded-lg text-sm font-medium cursor-pointer transition-all mt-2 text-white bg-gradient-to-br from-[#dc3545] to-[#c82333] shadow-md"
          >
            Hard Reset
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
