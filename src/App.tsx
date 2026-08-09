import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Header, { ConnectionState } from './components/Header';
import CurrentStatusCard from './components/CurrentStatusCard';
import SummaryCard from './components/SummaryCard';
import EnergyDayCard from './components/EnergyDayCard';
import DayNavigation from './components/DayNavigation';
import ChartSection from './components/ChartSection';
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
import { useTouchGestures } from './hooks/useTouchGestures';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useThemeColorMeta } from './hooks/useThemeColorMeta';
import { useTheme } from './hooks/useTheme';
import { useSummary } from './hooks/useSummary';
import {
  buildAlertRanges,
  classifyMargin,
  findAlerts,
  findCurrentPoint,
  getUpcomingStatus,
} from './utils/dataTransform';
import { DayOffset } from './types';
import { DAY_NAMES } from './utils/constants';
import { isEnergyDay } from './utils/energyDay';

/** Re-evaluate "now" this often so the current hour rolls over on its own. */
const CLOCK_TICK_MS = 30 * 1000;

function App() {
  const {
    allData,
    dayData,
    todayData,
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

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationKey, setNotificationKey] = useState(0);
  const [clockTick, setClockTick] = useState(0);

  // Recomputed on the tick so the summary ages out on its own, without a reload.
  const now = useMemo(() => new Date(), [clockTick]);
  const { summary, refresh: refreshSummary } = useSummary(now);

  /** Asking for fresh data means all of it, not only the figures. */
  const refreshAll = useCallback(async () => {
    refreshSummary();
    await refreshData();
  }, [refreshData, refreshSummary]);

  const { pullDistance, isRefreshing, isPulling, isReady } = useTouchGestures({
    onRefresh: refreshAll,
    // Swiping left moves forward in time, matching the order of the day tabs
    onSwipeLeft: () => switchDay(Math.min(2, currentDayOffset + 1) as DayOffset),
    onSwipeRight: () => switchDay(Math.max(0, currentDayOffset - 1) as DayOffset),
  });
  const { installableState, isInstalled, install } = useInstallPrompt();

  // Kept for its side effect: this call is what registers the service worker.
  // vite.config.ts sets no injectRegister, so nothing else does it — dropping
  // the hook would silently end offline support and auto-updates, the very
  // channel every later fix reaches the phone through.
  useRegisterSW();

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

  const showNotification = useCallback((message: string) => {
    setNotification(message);
    setNotificationKey((key) => key + 1);
  }, []);

  const handleSwitchDay = useCallback(
    (offset: DayOffset) => switchDay(offset),
    [switchDay]
  );

  const handleShowInstructions = useCallback(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    showNotification(
      isIOS
        ? 'Safari: Udostępnij → Dodaj do ekranu głównego'
        : 'Menu przeglądarki → Dodaj do ekranu głównego'
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
          onNotification={showNotification}
          onClose={() => setSettingsVisible(false)}
        />

        {/* The figure people open the app for comes first; the prose explains it
            afterwards. Both stay above the day tabs, which is the line that
            separates what does not follow the selected day from what does. */}
        <CurrentStatusCard
          point={currentPoint}
          status={currentStatus}
          isStale={isStale && hasData}
        />

        {summary && <SummaryCard summary={summary} now={now} />}

        {isEnergyDay(now) && <EnergyDayCard />}

        <DayNavigation
          currentDay={currentDayOffset}
          onSwitchDay={handleSwitchDay}
        />

        <ChartSection
          dayData={dayData}
          dayLabel={DAY_NAMES[currentDayOffset]}
          orangeThreshold={orangeThreshold}
          redThreshold={redThreshold}
          currentHourLabel={
            currentDayOffset === 0 ? currentPoint?.hourLabel ?? null : null
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
          todayData={todayData}
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
            onClick={refreshAll}
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

        </div>
      </main>

      <OfflineIndicator isOffline={!browserOnline} lastUpdate={lastUpdate} />
    </div>
  );
}

export default App;
