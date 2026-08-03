import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Header, { ConnectionState } from './components/Header';
import CurrentStatusCard from './components/CurrentStatusCard';
import DayNavigation from './components/DayNavigation';
import ReserveChart from './components/ReserveChart';
import TrendsSection from './components/TrendsSection';
import AlertsPanel from './components/AlertsPanel';
import SettingsPanel from './components/SettingsPanel';
import PullToRefresh from './components/PullToRefresh';
import NotificationBanner from './components/NotificationBanner';
import OfflineIndicator from './components/OfflineIndicator';
import InstallButton from './components/InstallButton';
import { RefreshIcon } from './components/icons';
import { usePSEData } from './hooks/usePSEData';
import { useSettings } from './hooks/useSettings';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useThemeColorMeta } from './hooks/useThemeColorMeta';
import { useTheme } from './hooks/useTheme';
import {
  buildAlertRanges,
  classifyMargin,
  findAlerts,
  findCurrentPoint,
  getUpcomingStatus,
} from './utils/dataTransform';
import { DayOffset } from './types';

/** Re-evaluate "now" this often so the current hour rolls over on its own. */
const CLOCK_TICK_MS = 30 * 1000;

function App() {
  const {
    allData,
    dayData,
    currentDayOffset,
    switchDay,
    refreshData,
    isLoading,
    isStale,
    lastUpdate,
    hasData,
  } = usePSEData();

  const { settings, saveSettings, resetSettings } = useSettings();
  const { preference: themePreference, setTheme } = useTheme();
  const browserOnline = useOnlineStatus();
  const { pullDistance, isRefreshing, isPulling, isReady } =
    usePullToRefresh(refreshData);
  const { installableState, isInstalled, install } = useInstallPrompt();

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [notificationsSilenced, setNotificationsSilenced] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationKey, setNotificationKey] = useState(0);
  const [clockTick, setClockTick] = useState(0);

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    const id = setInterval(() => setClockTick((tick) => tick + 1), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const { orangeThreshold, redThreshold } = settings;

  // Alerts for the selected day drive the panel...
  const dayAlerts = useMemo(
    () => findAlerts(dayData, orangeThreshold, redThreshold),
    [dayData, orangeThreshold, redThreshold]
  );
  const alertRanges = useMemo(
    () => buildAlertRanges(dayData, dayAlerts),
    [dayData, dayAlerts]
  );

  // ...while the app badge counts the whole 72-hour horizon, so it does not
  // change just because the user switched to a different day.
  const horizonAlertCount = useMemo(() => {
    const alerts = findAlerts(allData, orangeThreshold, redThreshold);
    return alerts.orange.length + alerts.red.length;
  }, [allData, orangeThreshold, redThreshold]);

  // clockTick is a dependency on purpose: both of these read the wall clock, so
  // they have to be recomputed as the hour rolls over, not only when data changes.
  const currentPoint = useMemo(
    () => findCurrentPoint(allData),
    [allData, clockTick]
  );

  const currentStatus = useMemo(
    () =>
      currentPoint && currentPoint.reserve !== null && currentPoint.required !== null
        ? classifyMargin(
            currentPoint.reserve - currentPoint.required,
            orangeThreshold,
            redThreshold
          )
        : 'unknown',
    [currentPoint, orangeThreshold, redThreshold]
  );

  const headerStatus = useMemo(
    () => getUpcomingStatus(allData, orangeThreshold, redThreshold),
    [allData, orangeThreshold, redThreshold, clockTick]
  );

  useThemeColorMeta(headerStatus);

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    if (horizonAlertCount > 0) {
      navigator.setAppBadge(horizonAlertCount);
    } else {
      navigator.clearAppBadge();
    }
  }, [horizonAlertCount]);

  const showNotification = useCallback(
    (message: string, force = false) => {
      if (notificationsSilenced && !force) return;
      setNotification(message);
      setNotificationKey((key) => key + 1);
    },
    [notificationsSilenced]
  );

  const handleSwitchDay = useCallback(
    (offset: DayOffset) => switchDay(offset),
    [switchDay]
  );

  const handleShowInstructions = useCallback(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    showNotification(
      isIOS
        ? 'Safari: Udostępnij → Dodaj do ekranu głównego'
        : 'Menu przeglądarki → Dodaj do ekranu głównego',
      true
    );
  }, [showNotification]);

  const connection: ConnectionState = isLoading && !hasData
    ? 'loading'
    : !hasData
    ? 'error'
    : isStale || !browserOnline
    ? 'cached'
    : 'online';

  const connectionText = {
    loading: 'Pobieranie danych…',
    error: 'Brak danych z PSE',
    cached: lastUpdate ? `Dane z ${lastUpdate}` : 'Dane z pamięci',
    online: lastUpdate
      ? `Zaktualizowano ${lastUpdate}`
      : 'Połączono',
  }[connection];

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-bg">
      <NotificationBanner key={notificationKey} message={notification} />

      <Header
        status={headerStatus}
        connection={connection}
        connectionText={connectionText}
        notificationsSilenced={notificationsSilenced}
        onToggleNotifications={() =>
          setNotificationsSilenced((silenced) => {
            const next = !silenced;
            if (!next) showNotification('Powiadomienia włączone', true);
            return next;
          })
        }
        onToggleSettings={() => setSettingsVisible((visible) => !visible)}
      />

      <main className="relative flex-1 overflow-x-hidden pb-6">
        <PullToRefresh
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          isPulling={isPulling}
          isReady={isReady}
        />

        <SettingsPanel
          visible={settingsVisible}
          settings={settings}
          theme={themePreference}
          onThemeChange={setTheme}
          onSave={saveSettings}
          onReset={resetSettings}
          onNotification={(message) => showNotification(message, true)}
          onClose={() => setSettingsVisible(false)}
        />

        <CurrentStatusCard
          point={currentPoint}
          status={currentStatus}
          isStale={isStale && hasData}
        />

        <DayNavigation
          currentDay={currentDayOffset}
          onSwitchDay={handleSwitchDay}
        />

        <ReserveChart
          data={dayData}
          orangeThreshold={orangeThreshold}
          redThreshold={redThreshold}
          currentTimeStr={
            currentDayOffset === 0 ? currentPoint?.timeStr ?? null : null
          }
          isLoading={isLoading}
        />

        <AlertsPanel
          ranges={alertRanges}
          currentDayOffset={currentDayOffset}
          hasData={dayData.some((point) => point.reserve !== null)}
        />

        <TrendsSection
          dayData={dayData}
          allData={allData}
          currentDayOffset={currentDayOffset}
          orangeThreshold={orangeThreshold}
          redThreshold={redThreshold}
        />

        <div
          className="mx-3 mt-3 space-y-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <button
            type="button"
            onClick={() => refreshData()}
            disabled={isLoading}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface px-4 text-[15px] font-medium text-accent-text shadow-sm active:opacity-70 disabled:opacity-50"
          >
            <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Odświeżanie…' : 'Odśwież'}
          </button>

          <InstallButton
            installableState={installableState}
            isInstalled={isInstalled}
            onInstall={install}
            onShowInstructions={handleShowInstructions}
          />

          {needRefresh && !settings.disableUpdates && (
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="min-h-11 w-full rounded-xl bg-accent px-4 text-[15px] font-semibold text-white active:opacity-80"
            >
              Zainstaluj aktualizację
            </button>
          )}
        </div>
      </main>

      <OfflineIndicator isOffline={!browserOnline} lastUpdate={lastUpdate} />
    </div>
  );
}

export default App;
