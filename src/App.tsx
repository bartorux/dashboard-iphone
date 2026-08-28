import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Header, { ConnectionState } from './components/Header';
import CurrentStatusCard from './components/CurrentStatusCard';
import SummaryCard from './components/SummaryCard';
import EnergyDayCard from './components/EnergyDayCard';
import DayNavigation from './components/DayNavigation';
import ChartSection from './components/ChartSection';
import TrendsSection from './components/TrendsSection';
import RenewableMixCard from './components/RenewableMixCard';
import AlertsPanel from './components/AlertsPanel';
import SettingsPanel from './components/SettingsPanel';
import PullToRefresh from './components/PullToRefresh';
import NotificationBanner from './components/NotificationBanner';
import OfflineIndicator from './components/OfflineIndicator';
import InstallButton from './components/InstallButton';
import { RefreshIcon } from './components/icons';
import { usePSEData } from './hooks/usePSEData';
import { useKseDemand } from './hooks/useKseDemand';
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
  hasReadings,
} from './utils/dataTransform';
import { DayOffset } from './types';
import { formatDate } from './utils/dateHelpers';
import { dayLabel, visibleDayOffsets } from './utils/dayWindow';
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
    hasFreshData,
  } = usePSEData();

  /*
   * Fetched here rather than inside ChartSection, and unconditionally rather
   * than only once the Generacja view opens: RenewableMixCard needs this same
   * map for the ring it shows regardless of which chart tab is on screen, and
   * a second `useKseDemand` call scoped to the chart would fetch pdgobpkd
   * twice for the same business date. One hook, one fetch, two consumers —
   * ChartSection (which forwards it to GenerationChart) and the card below.
   * `enabled` is always true: this is one small response a day, and the
   * service worker already caches the GET for an hour.
   */
  const { byHour: kseDemand } = useKseDemand(true, todayData[0]?.businessDate ?? null);

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

  /*
   * The days on offer, recomputed only when the calendar day turns over rather
   * than on every clock tick. They are not contiguous — the window steps over
   * weekends and holidays — so both the tabs and the swipe walk this list.
   */
  const todayKey = formatDate(now);
  const dayOffsets = useMemo(() => visibleDayOffsets(new Date()), [todayKey]);

  /** One place along the list. Adding 1 to an offset would land on a skipped day. */
  const stepDay = useCallback(
    (direction: 1 | -1) => {
      const here = dayOffsets.indexOf(currentDayOffset);
      const from = here === -1 ? 0 : here;
      const next = dayOffsets[Math.min(dayOffsets.length - 1, Math.max(0, from + direction))];
      if (next !== undefined) switchDay(next);
    },
    [dayOffsets, currentDayOffset, switchDay]
  );

  const { pullDistance, isRefreshing, isPulling, isReady } = useTouchGestures({
    onRefresh: refreshAll,
    // Swiping left moves forward in time, matching the order of the day tabs
    onSwipeLeft: () => stepDay(1),
    onSwipeRight: () => stepDay(-1),
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

  /*
   * Showing cached figures while the first fetch of the session is still in
   * flight is "loading", not "cached" and not "online". Keyed on hasFreshData
   * rather than hasData: with a cache present hasData is true from the first
   * frame, so the header would otherwise announce "Zaktualizowano" over figures
   * it had not yet fetched.
   */
  const connection: ConnectionState = isLoading && !hasFreshData
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

      <main className="content-width relative flex-1 overflow-x-hidden pb-6">
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

        {/*
          One column up to 80rem, two above it.

          The split is not "top half, bottom half" but the line the reading order
          already draws: what does NOT follow the selected day (the current
          margin, the analysis) against what does (tabs, chart, alerts, trends).
          On a screen left open all day that matters more than reading order —
          the right-hand column never moves when someone switches to tomorrow,
          so the eye keeps finding the answer in the same place.

          Placement is explicit rather than by source order, because the source
          order is the phone's and must not change: every child keeps the
          position it has today, and only above 80rem is it sent to a column.
        */}
        {/*
          The chart column is as wide as the chart is tall, times 1.6.

          Not a fixed width, and that is the point. Measured across three
          screens, the chart came out at almost the same proportion everywhere —
          1.77, 1.91, 1.77 — so capping the PAGE only ever made a 24-inch monitor
          match a laptop that was already too wide. The complaint is the shape,
          not the screen.

          Deriving the width from `52vh`, which is the chart's own height at this
          breakpoint, holds the proportion at 1.5 on every size and lets it scale
          by itself: 618px wide at 1280x800, 701 at 1440x900, 851 at 1920x1080.
          A fixed cap cannot do that — 46rem read well on a laptop and left a
          24-inch monitor with a narrow, tall chart and empty glass beside it.

          The whole column narrows, not just the chart: the day tabs and the
          alerts sit in it too, and a chart narrower than the panel beneath it
          would read as a mistake.
        */}
        <div className="xl:grid xl:grid-cols-[minmax(0,calc(52vh*1.6))_28rem] xl:grid-rows-[auto_auto_1fr] xl:items-start xl:justify-center xl:gap-4">
          <div className="xl:col-start-2 xl:row-start-1">
            {/* The figure people open the app for comes first; the prose explains
                it afterwards. Both stay above the day tabs. */}
            <CurrentStatusCard
              point={currentPoint}
              status={currentStatus}
              isStale={isStale && hasData}
            />

            {/*
              Above the analysis, below the margin.
              *
              * The margin stays first because it is the answer to the question
              * this app is opened with. But once a year the greeting outranks
              * the analysis: the analysis is what this screen says every hour of
              * every day, and the greeting is the only thing on it that will not
              * be there tomorrow.
              */}
            {isEnergyDay(now) && <EnergyDayCard />}

            {summary && <SummaryCard summary={summary} now={now} />}
          </div>

          <div className="xl:col-start-1 xl:row-start-1 xl:row-span-3">
            <DayNavigation
              offsets={dayOffsets}
              currentDay={currentDayOffset}
              onSwitchDay={handleSwitchDay}
            />

            <ChartSection
              dayData={dayData}
              dayLabel={dayLabel(currentDayOffset)}
              orangeThreshold={orangeThreshold}
              redThreshold={redThreshold}
              currentHourLabel={
                currentDayOffset === 0 ? currentPoint?.hourLabel ?? null : null
              }
              isLoading={isLoading}
              kseDemand={kseDemand}
            />

            <AlertsPanel
              ranges={alertRanges}
              currentDayOffset={currentDayOffset}
              hasData={hasReadings(dayData)}
            />

          </div>

          {/* Its own cell rather than part of the chart column: the tiles are
              small, and on a monitor they fill the space under the analysis that
              would otherwise sit empty beside a tall chart. */}
          <div className="xl:col-start-2 xl:row-start-2">
            {/*
              Today only, always — never the selected day. pdgobpkd (the
              source behind kseDemand) is published for the current business
              date alone, and this card's whole premise is "right now", so it
              reads `todayData`/`now` directly rather than `dayData`, unlike
              everything else in this column. It renders nothing of its own
              accord once either input is missing — see the component.
            */}
            <RenewableMixCard points={todayData} kseDemand={kseDemand} now={now} />

            <TrendsSection
              dayData={dayData}
              todayData={todayData}
              currentDayOffset={currentDayOffset}
              orangeThreshold={orangeThreshold}
              redThreshold={redThreshold}
            />
          </div>

          {/* Under the right-hand column, where a full-width refresh button
              across a 24-inch monitor would be absurd. */}
          <div
            className="mx-3 mt-3 space-y-2 xl:col-start-2 xl:row-start-3 xl:self-start"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <button
              type="button"
              onClick={refreshAll}
              disabled={isLoading}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface px-4 text-[0.9375rem] font-medium text-accent-text shadow-sm active:opacity-70 disabled:opacity-50"
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
        </div>
      </main>

      <OfflineIndicator isOffline={!browserOnline} lastUpdate={lastUpdate} />
    </div>
  );
}

export default App;
