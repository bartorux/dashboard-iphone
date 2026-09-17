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
import NewsCard from './components/news/NewsCard';
import NewsSheet from './components/news/NewsSheet';
import PullToRefresh from './components/PullToRefresh';
import OfflineIndicator from './components/OfflineIndicator';
import { RefreshIcon } from './components/icons';
import { useRefreshButton } from './hooks/useRefreshButton';
import { usePSEData } from './hooks/usePSEData';
import { useKseDemand } from './hooks/useKseDemand';
import { useCompass } from './hooks/useCompass';
import { useSettings } from './hooks/useSettings';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useTouchGestures } from './hooks/useTouchGestures';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useThemeColorMeta } from './hooks/useThemeColorMeta';
import { useTheme } from './hooks/useTheme';
import { useSummary } from './hooks/useSummary';
import { useNews } from './hooks/useNews';
import { useNewsSeen } from './hooks/useNewsSeen';
import { useMediaQuery } from './hooks/useMediaQuery';
import { newsFreshness } from './utils/news';
import {
  buildAlertRanges,
  classifyMargin,
  findAlerts,
  findCurrentPoint,
  getUpcomingStatus,
  hasReadings,
} from './utils/dataTransform';
import { compassRanges } from './utils/compass';
import { version as appVersion } from '../package.json';
import { DayOffset } from './types';
import { addDays, formatDate } from './utils/dateHelpers';
import { dayLabel, visibleDayOffsets } from './utils/dayWindow';
import { isEnergyDay } from './utils/energyDay';
import { exchangePlanned } from './utils/exchangePlan';

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

  /*
   * Fetched here for the same reason as `useKseDemand` above — one fetch, not
   * one per consumer, currently AlertsPanel's CompassRows block via
   * `compassHoursFor` below. `refresh` is wired into `refreshAll` below so a
   * manual/pull-to-refresh re-asks for tomorrow's compass, which pdgsz does
   * not publish until roughly 16:35.
   */
  const { hoursFor: compassHoursFor, refresh: refreshCompass } = useCompass(
    true,
    todayData[0]?.businessDate ?? null
  );

  const { settings, saveSettings, resetSettings } = useSettings();
  const { preference: themePreference, setTheme } = useTheme();
  const browserOnline = useOnlineStatus();

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  // Recomputed on the tick so the summary ages out on its own, without a reload.
  const now = useMemo(() => new Date(), [clockTick]);
  const { summary, refresh: refreshSummary } = useSummary(now);

  /*
   * "Z branży": industry headlines, desktop only. The card lists two (four
   * from 110rem) and opens the side panel with the rest; the panel and the
   * settings share one place on screen, so opening either closes the other.
   * Closing the panel is what marks headlines as seen — see useNewsSeen.
   */
  const { news, refresh: refreshNews } = useNews();
  const { isNew: isNewsNew, markRead: markNewsRead, markSeen: markNewsSeen } = useNewsSeen();
  const newsWide = useMediaQuery('(min-width: 110rem)');
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsHighlight, setNewsHighlight] = useState<string | null>(null);
  const newsState = news ? newsFreshness(news, now) : 'expired';

  /** Asking for fresh data means all of it, not only the figures. */
  // Hidden in a plain desktop browser, where F5 does the same — see the hook.
  const showRefreshButton = useRefreshButton();

  const refreshAll = useCallback(async () => {
    refreshSummary();
    refreshNews();
    refreshCompass();
    await refreshData();
  }, [refreshData, refreshSummary, refreshNews, refreshCompass]);

  /*
   * The days on offer, recomputed only when the calendar day turns over rather
   * than on every clock tick. They are not contiguous — the window steps over
   * weekends and holidays — so both the tabs and the swipe walk this list.
   */
  const todayKey = formatDate(now);
  const dayOffsets = useMemo(() => visibleDayOffsets(new Date()), [todayKey]);
  // The tab's own date, known before a single row of its plan has arrived —
  // unlike dayData[0].businessDate, which is absent until PSE publishes.
  const selectedBusinessDate = useMemo(
    () => formatDate(addDays(new Date(), currentDayOffset)),
    // todayKey rolls it over at midnight, like dayOffsets above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey, currentDayOffset]
  );

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

  // Kompas Energetyczny PSE for the day ON SCREEN — deliberately dayData's own
  // businessDate, not todayData's (the fixed date useCompass is fetched with):
  // a reader looking at tomorrow's tab must see tomorrow's compass, not
  // today's. Independent of dayAlerts/alertRanges above by design — see the
  // AlertsPanel comment on why the two are never merged.
  /*
   * Today's ranges, separate from the selected day's: the status card is about
   * "now" regardless of which tab is open, so it must not read a flag from a
   * day the reader merely happens to be looking at.
   */
  const todayCompassRanges = useMemo(
    () => compassRanges(compassHoursFor(todayData[0]?.businessDate ?? null), now),
    [compassHoursFor, todayData, now]
  );


  const dayCompassRanges = useMemo(
    () => compassRanges(compassHoursFor(dayData[0]?.businessDate ?? null), now),
    [compassHoursFor, dayData, now]
  );

  /*
   * Whether the day on screen still carries PSE's flat placeholder exchange
   * rather than a cleared day-ahead plan — see exchangePlan.ts. Gated on
   * `hasReadings` so an empty day (nothing fetched yet) never reads as
   * "unplanned" merely for having nothing to check; today and tomorrow always
   * carry a real, hour-varying plan on the live feed, so this only ever fires
   * a few days out. Changes no status and no threshold — see AlertsPanel.
   */
  const exchangeMissing = useMemo(
    () => hasReadings(dayData) && !exchangePlanned(dayData),
    [dayData]
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

  /*
   * Walked from `from` for `hours` blocks, not from `from` to `to`: `to` is the
   * label AFTER the last flagged hour, so a range ending at 21:00 does not
   * cover 21:00 itself.
   */
  const compassNow = useMemo(() => {
    const hour = currentPoint?.hourLabel;
    if (!hour) return null;
    const keys = todayData.map((point) => point.hourLabel);
    for (const range of todayCompassRanges) {
      const start = keys.indexOf(range.from);
      if (start < 0) continue;
      for (let step = 0; step < range.hours; step++) {
        if (keys[start + step] === hour) return range;
      }
    }
    return null;
  }, [todayCompassRanges, currentPoint, todayData]);

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

  /* The scale in the settings marks the same figure the status card shows. */
  const currentMargin =
    currentPoint && currentPoint.reserve !== null && currentPoint.required !== null
      ? currentPoint.reserve - currentPoint.required
      : null;

  const closeSettings = useCallback(() => setSettingsVisible(false), []);

  const openNews = useCallback((itemId: string | null) => {
    setSettingsVisible(false);
    setNewsHighlight(itemId);
    setNewsOpen(true);
  }, []);

  const closeNews = useCallback(() => {
    setNewsOpen(false);
    setNewsHighlight(null);
    markNewsSeen();
  }, [markNewsSeen]);

  // The gear opens the settings over an open news panel: the news panel goes.
  useEffect(() => {
    if (settingsVisible && newsOpen) closeNews();
  }, [settingsVisible, newsOpen, closeNews]);

  const headerStatus = useMemo(
    () => getUpcomingStatus(allData, orangeThreshold, redThreshold),
    [allData, orangeThreshold, redThreshold, clockTick]
  );

  // The bar's surface, not its status: see the hook.
  useThemeColorMeta(themePreference);

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    if (horizonAlertCount > 0) {
      navigator.setAppBadge(horizonAlertCount);
    } else {
      navigator.clearAppBadge();
    }
  }, [horizonAlertCount]);

  const handleSwitchDay = useCallback(
    (offset: DayOffset) => switchDay(offset),
    [switchDay]
  );

  /*
   * Showing cached figures while the first fetch of the session is still in
   * flight is "loading", not "cached" and not "online". Keyed on hasFreshData
   * rather than hasData: with a cache present hasData is true from the first
   * frame, so the header would otherwise announce "Zaktualizowano" over figures
   * it had not yet fetched.
   */
  const firstLoad = isLoading && !hasFreshData;

  const connection: ConnectionState = firstLoad
    ? 'loading'
    : !hasData
    ? 'error'
    : isStale || !browserOnline
    ? 'cached'
    : 'online';

  /*
   * One flag, three cards. `firstLoad` above is the whole of the loading
   * language: it drives the header's own 'loading' state and is handed down to
   * the status card, the alerts panel and the trends tiles so all four agree on
   * what "not yet" means. Each of the three still checks that its OWN data is
   * empty before drawing a placeholder — a refetch leaves the figures in state,
   * and blanking them mid-read is the anti-pattern this exists to avoid.
   */

  /*
   * The header's second line only: when the figures on screen were fetched.
   * What is happening (loading, offline) is the first line's job — Header
   * words it once — so this never repeats it, and stays empty rather than
   * restating "no data" when there is no time to give.
   */
  const lastFetched = lastUpdate ? `Ostatnie dane z ${lastUpdate}` : '';
  const connectionText = {
    loading: lastFetched,
    error: lastFetched,
    cached: lastFetched || 'Dane z pamięci',
    online: lastUpdate ? `Zaktualizowano ${lastUpdate}` : '',
  }[connection];

  /*
   * `clip`, not `hidden`, on both boxes. `overflow-x: hidden` with the other
   * axis left `visible` computes that axis to `auto`, which turns the box into
   * a scroll container — and a sticky child sticks to its nearest scroll
   * container, not to the viewport. The header then scrolled away with the
   * page (measured: 2091px above the glass at the bottom). `clip` cuts the
   * same overflow without creating a scroll container. Browsers without it
   * (Safari < 16) keep `hidden`: no sticky bar there, but no sideways scroll.
   */
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden supports-[overflow:clip]:overflow-x-clip bg-bg">
      <Header
        status={headerStatus}
        connection={connection}
        connectionText={connectionText}
        onToggleSettings={() => setSettingsVisible((visible) => !visible)}
        onRetry={refreshAll}
      />

      <main className="content-width relative flex-1 overflow-x-hidden supports-[overflow:clip]:overflow-x-clip pb-6">
        <PullToRefresh
          pullDistance={pullDistance}
          isRefreshing={isRefreshing}
          isPulling={isPulling}
          isReady={isReady}
        />

        {/*
          A sheet on a phone, a side panel from 48rem — rendered into <body>,
          so where it sits in this tree does not matter. Every valid change
          saves as it is made, so closing it confirms nothing and discards
          nothing. The install offer and the version live in it now, which is
          why the foot of the page keeps only the refresh button.
        */}
        <SettingsPanel
          open={settingsVisible}
          onClose={closeSettings}
          settings={settings}
          onSave={saveSettings}
          onReset={resetSettings}
          theme={themePreference}
          onThemeChange={setTheme}
          currentMargin={currentMargin}
          installableState={installableState}
          isInstalled={isInstalled}
          onInstall={install}
          version={appVersion}
        />

        {news && (
          <NewsSheet
            open={newsOpen}
            news={news}
            now={now}
            isNew={isNewsNew}
            highlightId={newsHighlight}
            onClose={closeNews}
            onArticleOpen={markNewsRead}
          />
        )}

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

          The expression itself now lives in `.dash-grid` in App.css, next to
          .chart-box-h and reading the same `--chart-vh`, so the two can no
          longer drift: the height is `calc(var(--chart-vh)*1dvh)` and the
          column `calc(var(--chart-vh)*1.6vh)`. It stayed `vh` there, not dvh,
          deliberately — the risk in `grid-template-columns` is a TYPO or an
          unsupported unit, which invalidates the whole declaration (not just
          that value) and collapses the layout to a single column with no
          visible error.
        */}
        {/*
          And a third column above 110rem (1760px).

          The two-column split above is the line between what follows the
          selected day and what does not. On a 24-inch monitor the right-hand
          column then had to carry five things at once — the margin, the
          analysis, the OZE ring, the trends and the buttons — in 28rem, while
          the space beside them stayed empty. Splitting it again keeps the same
          rule and adds one: column 2 is the ANSWER (what is the margin, and
          what does it mean), column 3 is the READINGS (the mix, the day's
          spread, and the controls). Nothing crosses between columns, so a
          reader who has learned where a figure lives keeps finding it there.

          Below 110rem not a single class here applies — the two-column layout
          is untouched, and no laptop reaches this breakpoint. A 96rem trial on
          09.09.2026 was rejected by the owner ("od 24 cali w górę"); see the
          matching .content-width block in App.css for why 110/120rem.
        */}
        <div className="dash-grid">
          <div className="xl:col-start-2 xl:row-start-1">
            {/* The figure people open the app for comes first; the prose explains
                it afterwards. Both stay above the day tabs. */}
            <CurrentStatusCard
              point={currentPoint}
              status={currentStatus}
              isStale={isStale && hasData}
              isLoading={firstLoad}
              todayData={todayData}
              compassNow={compassNow}
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

            {/*
              Under the analysis, in the same cell, from 80rem only (the card
              hides itself below). On a laptop this column is full, so the
              card pushes the renewables and trends down by its own height;
              from 110rem it fills the empty glass the third column left here.
            */}
            {news && newsState !== 'expired' && (
              <NewsCard
                news={news}
                now={now}
                variant={newsWide ? 'monitor' : 'laptop'}
                stale={newsState === 'stale'}
                isNew={isNewsNew}
                activeId={newsOpen ? newsHighlight : null}
                onOpen={openNews}
              />
            )}
          </div>

          <div className="xl:col-start-1 xl:row-start-1 xl:row-span-3">
            <DayNavigation
              offsets={dayOffsets}
              currentDay={currentDayOffset}
              onSwitchDay={handleSwitchDay}
            />

            <ChartSection
              dayData={dayData}
              businessDate={selectedBusinessDate}
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
              isLoading={firstLoad}
              compassRanges={dayCompassRanges}
              exchangeMissing={exchangeMissing}
            />

          </div>

          {/* Its own cell rather than part of the chart column: the tiles are
              small, and on a monitor they fill the space under the analysis that
              would otherwise sit empty beside a tall chart. */}
          <div className="xl:col-start-2 xl:row-start-2 min-[110rem]:col-start-3 min-[110rem]:row-start-1">
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
              isLoading={firstLoad}
            />
          </div>

          {/* Under the right-hand column, where a full-width refresh button
              across a 24-inch monitor would be absurd. */}
          <div
            className="mx-3 mt-3 space-y-2 xl:col-start-2 xl:row-start-3 xl:self-start min-[110rem]:col-start-3 min-[110rem]:row-start-2"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {showRefreshButton && (
              <button
                type="button"
                onClick={refreshAll}
                disabled={isLoading}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-surface px-4 text-[0.9375rem] font-medium text-accent-text shadow-sm active:opacity-70 disabled:opacity-50"
              >
                <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Odświeżanie…' : 'Odśwież'}
              </button>
            )}

          </div>
        </div>
      </main>

      <OfflineIndicator isOffline={!browserOnline} lastUpdate={lastUpdate} />
    </div>
  );
}

export default App;
