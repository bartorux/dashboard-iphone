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

  await context.route('**/api.raporty.pse.pl/**', (route) => {
    if (scenario.offline) return route.abort('failed');
    const requested = decodeURIComponent(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: requested.includes('business_date ge') ? history : forecast,
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
  await page.waitForTimeout(1800);

  if (scenario.dayIndex !== undefined) {
    await page.getByRole('tab').nth(scenario.dayIndex).click();
    await page.waitForTimeout(1200);
  }
  if (scenario.view) {
    await page.getByRole('tab', { name: scenario.view }).click();
    await page.waitForTimeout(scenario.view.includes('30') ? 2600 : 1400);
  }
  if (scenario.settings) {
    await page.getByRole('button', { name: 'Ustawienia' }).click();
    await page.waitForTimeout(900);
  }

  const shot = await page.screenshot({ fullPage: true });
  const baselinePath = resolve(baselineDir, `${scenario.name}.png`);

  if (update || !existsSync(baselinePath)) {
    writeFileSync(baselinePath, shot);
    written++;
    console.log(`${scenario.name}: baseline written`);
    await context.close();
    continue;
  }

  const expected = PNG.sync.read(readFileSync(baselinePath));
  const actual = PNG.sync.read(shot);

  if (expected.width !== actual.width || expected.height !== actual.height) {
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
