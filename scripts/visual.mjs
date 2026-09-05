/**
 * Visual regression check.
 *
 * Twice in this project a visual defect reached production with every test
 * green: a Y axis clipped by a negative margin, and tooltip indentation that
 * silently never applied. Both were caught only by looking. This compares
 * rendered pages against committed baselines so that class of change fails
 * loudly instead.
 *
 *   node scripts/visual.mjs           compare against baselines
 *   node scripts/visual.mjs --update  rewrite the baselines
 *
 * Run the dev server first. Kept out of CI: it needs a downloaded browser,
 * which deploy.yml deliberately skips.
 */
import { chromium, devices } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselineDir = resolve(root, 'screenshots/baseline');
const diffDir = resolve(root, 'screenshots/diff');
const url = process.env.PREVIEW_URL ?? 'http://localhost:5173/dashboard-iphone/';
const update = process.argv.includes('--update');

const forecast = readFileSync(
  resolve(root, 'src/utils/__fixtures__/pse-okno.json'),
  'utf8'
);
const history = readFileSync(
  resolve(root, 'src/utils/__fixtures__/pse-30d.json'),
  'utf8'
);
// Curtailment for the frozen "today" (2026-08-04): a PV dip to about -1500 MW
// around midday, wind untouched — reshaped from a live poze-redoze response.
const redispatch = readFileSync(
  resolve(root, 'src/utils/__fixtures__/pse-redoze.json'),
  'utf8'
);
// Country-wide demand for the same frozen "today", behind RenewableMixCard's
// ring and day strip and the generation tooltip's OZE percentage. 96 quarters
// derived from pse-okno.json's own pv/wind/exchange/grid-demand for
// 2026-08-04 (kseDemand = grid_demand_fcst + ~30% of fcst_pv_tot_gen, a
// stand-in for the prosumer self-consumption grid_demand_fcst nets out) —
// 9-17% overnight, rising to 68% at noon, the same shape the honest share
// actually takes. Without this, both cards would be invisible in every
// baseline and nothing would guard their layout.
const kseDemand = readFileSync(
  resolve(root, 'src/utils/__fixtures__/pse-pdgobpkd.json'),
  'utf8'
);

/**
 * Antialiasing and font rendering wobble by a pixel between runs. This tolerance
 * absorbs that without hiding a moved element.
 */
const PIXEL_THRESHOLD = 0.15;
const MAX_DIFF_RATIO = 0.001; // 0.1% of pixels

const SCENARIOS = [
  { name: 'reserve-light', scheme: 'light' },
  { name: 'reserve-dark', scheme: 'dark' },
  { name: 'generation-light', scheme: 'light', view: 'Generacja' },
  { name: 'history-light', scheme: 'light', view: 'Na tle 30 dni' },
  { name: 'history-dark', scheme: 'dark', view: 'Na tle 30 dni' },
  // Selected by position, not by name: the labels are weekday names now, so a
  // literal would have to be recomputed whenever the frozen clock moves.
  { name: 'tomorrow-light', scheme: 'light', dayIndex: 1 },
  { name: 'settings-light', scheme: 'light', settings: true },
  { name: 'no-data-light', scheme: 'light', offline: true },
  // Sizes are in rem and the root is hooked to the system font, so raising the
  // reader's text size scales the whole app. This captures the largest setting,
  // because that is where a layout breaks — and a break there is invisible at
  // the default size, which every other scenario uses.
  { name: 'duzy-tekst-light', scheme: 'light', fontPx: 23 },
  // The office monitor this is meant to sit on all day. Above 80rem the page
  // splits into two columns, and nothing else in this list can see that — every
  // other scenario runs at 393px, where those rules do not exist.
  { name: 'monitor-light', scheme: 'light', monitor: true },
  { name: 'monitor-dark', scheme: 'dark', monitor: true },
  { name: 'monitor-settings', scheme: 'light', monitor: true, settings: true },
  // The current hour being itself an alert hour: the two vertical rules land on
  // one x, and the blue "teraz" line used to be painted over the red dash, so
  // the chart showed nothing at the one hour already happening. No other
  // scenario can see it — the shared clock sits at midday, where the fixture is
  // calm.
  { name: 'teraz-w-alercie', scheme: 'light', at: '2026-08-04T19:30:00+02:00' },
  // The skeleton language (Skeleton.tsx, and `firstLoad` in App.tsx): what the
  // status card, the alerts panel and the trends tiles look like for the one
  // window that matters, between mount and the first response landing. Every
  // other scenario's fetch resolves before the first paint anyone would look
  // at, so without a deliberately slow response this state is never captured.
  { name: 'pierwsze-ladowanie', scheme: 'light', slowFetch: true, waitAfterLoad: 500 },
];

/**
 * A 24-inch office monitor. Dropping `hasTouch` along with the phone profile is
 * the point rather than a side effect: it turns off the touch path of the chart
 * tooltip and the swipe gestures, which is exactly what a browser driven by a
 * mouse does.
 */
const MONITOR = {
  viewport: { width: 1920, height: 1080 },
  isMobile: false,
  hasTouch: false,
};

mkdirSync(baselineDir, { recursive: true });
if (existsSync(diffDir)) rmSync(diffDir, { recursive: true });
mkdirSync(diffDir, { recursive: true });

/**
 * Baselines must not go stale overnight. The app slices data by today's
 * business date, so without a frozen clock every capture would differ from the
 * day the baseline was written.
 */
const FROZEN_TIME = new Date('2026-08-04T12:00:00+02:00');

/** A scenario may pin its own moment; everything else shares the one above. */
const clockFor = (scenario) =>
  scenario.at ? new Date(scenario.at) : FROZEN_TIME;

const browser = await chromium.launch();
let failures = 0;
let written = 0;

for (const scenario of SCENARIOS) {
  const context = await browser.newContext({
    ...(scenario.monitor ? MONITOR : devices['iPhone 15 Pro']),
    // Baselines are stored at 1x: layout regressions show up identically while
    // the committed PNGs stay a fraction of the size of 3x captures.
    deviceScaleFactor: 1,
    colorScheme: scenario.scheme,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    // The app already honours this at both layers (the blanket rule in
    // App.css, and useChartAnimationMs for Recharts), so a capture no longer
    // depends on catching an element mid-transition or mid-draw. Without it,
    // the waitForTimeout values below would have to outlast the slowest
    // animation on the page rather than just the slowest fetch.
    reducedMotion: 'reduce',
  });

  /**
   * The summary is written by a scheduled job, so the file on disk carries a
   * real timestamp and would read as coming from the future against the frozen
   * clock — which the card correctly refuses to show. Served here with a stamp
   * relative to that clock, so the card is actually covered; `offline` drops it
   * to prove the rest of the screen stands without it.
   */
  await context.route('**/summary.json', (route) => {
    if (scenario.offline) return route.abort('failed');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Worded to match the fixture it sits above, where the evening margin
      // goes negative — a baseline that contradicts its own chart teaches the
      // eye to ignore exactly what these captures exist to catch.
      body: JSON.stringify({
        headline:
          'Wieczorem rezerwa nie pokrywa wymaganej wartości, są podstawy do przywołania.',
        body:
          'Od godziny 17:00 do 23:00 dostępna rezerwa spada poniżej wymaganej, ' +
          'najgłębiej o 19:00. Okno ogłoszenia dla części tych godzin jest już zamknięte.',
        // One sentence naming what matters and gathering the rest, which is what
        // the DALEJ line is asked for now that the window is five working days.
        outlook:
          'W pozostałych dniach nie ma podstaw do przywołania.',
        generatedAt: new Date(clockFor(scenario).getTime() - 30 * 60 * 1000).toISOString(),
        // The same five working days the tabs offer from the frozen Tuesday, so
        // the card's eyebrow on the baseline says what the app will really say.
        dates: ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-10'],
      }),
    });
  });

  await context.route('**/api.raporty.pse.pl/**', async (route) => {
    if (scenario.offline) return route.abort('failed');
    // Every other scenario's fixtures resolve before the first frame anyone
    // would screenshot, so the skeleton language never appears in any of them.
    // Held open for a fixed 5s here, behind its own flag, to capture that
    // window instead — see `pierwsze-ladowanie` above.
    if (scenario.slowFetch) await new Promise((r) => setTimeout(r, 5000));
    const requested = decodeURIComponent(route.request().url());
    // poze-redoze also filters with business_date, but with `eq` rather than
    // history's `ge` — checked first, or it would fall through to the `ge`
    // branch below and never match, then to the forecast fixture, which
    // carries none of the redispatch fields and would silently draw nothing.
    const body = requested.includes('poze-redoze')
      ? redispatch
      : requested.includes('pdgobpkd')
        ? kseDemand
        : requested.includes('business_date ge')
          ? history
          : forecast;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body,
    });
  });

  await context.clock.install({ time: clockFor(scenario) });

  const page = await context.newPage();

  // Stands in for the iOS text-size slider, which Playwright cannot move: the
  // root size is what that setting ultimately changes.
  if (scenario.fontPx) {
    await page.addInitScript((px) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `html { font-size: ${px}px !important; }`;
        document.head.appendChild(style);
      });
    }, scenario.fontPx);
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // These waits are for the fetch and the render, not for any animation —
  // reducedMotion above turns those off, so what is left to wait for is data
  // landing and React committing it. `pierwsze-ladowanie` overrides this to
  // ~500ms so the shot lands while its 5s-delayed fetch is still in flight,
  // rather than after the default wait has outlasted it.
  await page.waitForTimeout(scenario.waitAfterLoad ?? 700);

  if (scenario.dayIndex !== undefined) {
    await page.getByRole('tab').nth(scenario.dayIndex).click();
    await page.waitForTimeout(300);
  }
  if (scenario.view) {
    await page.getByRole('tab', { name: scenario.view }).click();
    await page.waitForTimeout(scenario.view.includes('30') ? 900 : 300);
  }
  if (scenario.settings) {
    await page.getByRole('button', { name: 'Ustawienia' }).click();
    await page.waitForTimeout(300);
  }

  const shot = await page.screenshot({ fullPage: true });
  const baselinePath = resolve(baselineDir, `${scenario.name}.png`);

  if (!existsSync(baselinePath)) {
    writeFileSync(baselinePath, shot);
    written++;
    console.log(`${scenario.name}: baseline written`);
    await context.close();
    continue;
  }

  const expected = PNG.sync.read(readFileSync(baselinePath));
  const actual = PNG.sync.read(shot);
  const sameSize = expected.width === actual.width && expected.height === actual.height;

  if (update) {
    // Chromium's screenshot encoder is not byte-stable between two runs of the
    // same scene: comparing two identical-looking captures of monitor-light
    // chunk-by-chunk showed the same IHDR and chunk layout, but a handful of
    // IDAT chunks with different CRCs, decoding to a few pixels off by 1-3 in
    // a channel — real antialiasing jitter, not stray metadata (there is no
    // pHYs/tEXt/tIME chunk to begin with). It is invisible and stays under
    // PIXEL_THRESHOLD, yet a plain byte compare treated it as a changed file
    // on every `--update`, however nothing had actually changed. Writing only
    // when pixelmatch finds a real difference keeps `--update` a no-op in
    // that case, whatever produced the byte wobble.
    const changed = sameSize
      ? pixelmatch(expected.data, actual.data, null, expected.width, expected.height, {
          threshold: PIXEL_THRESHOLD,
        })
      : Infinity;

    if (sameSize && changed === 0) {
      console.log(`${scenario.name}: unchanged, baseline kept`);
    } else {
      writeFileSync(baselinePath, shot);
      written++;
      console.log(`${scenario.name}: baseline written`);
    }
    await context.close();
    continue;
  }

  if (!sameSize) {
    failures++;
    console.error(
      `${scenario.name}: size changed ${expected.width}x${expected.height} -> ${actual.width}x${actual.height}`
    );
    writeFileSync(resolve(diffDir, `${scenario.name}-actual.png`), shot);
    await context.close();
    continue;
  }

  const diff = new PNG({ width: expected.width, height: expected.height });
  const changed = pixelmatch(
    expected.data,
    actual.data,
    diff.data,
    expected.width,
    expected.height,
    { threshold: PIXEL_THRESHOLD }
  );
  const ratio = changed / (expected.width * expected.height);

  if (ratio > MAX_DIFF_RATIO) {
    failures++;
    console.error(
      `${scenario.name}: ${changed} pixels differ (${(ratio * 100).toFixed(3)}%)`
    );
    writeFileSync(resolve(diffDir, `${scenario.name}-diff.png`), PNG.sync.write(diff));
    writeFileSync(resolve(diffDir, `${scenario.name}-actual.png`), shot);
  } else {
    console.log(`${scenario.name}: ok`);
  }

  await context.close();
}

await browser.close();

if (written > 0) {
  console.log(`\n${written} baseline(s) written — review them before committing.`);
}
if (failures > 0) {
  console.error(`\n${failures} scenario(s) changed. Diffs in screenshots/diff/.`);
  console.error('If the change is intended: node scripts/visual.mjs --update');
}
process.exit(failures > 0 ? 1 : 0);
