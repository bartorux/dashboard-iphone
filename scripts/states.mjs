/**
 * Captures the states that are awkward to reach by hand: no data at all, a stale
 * cache while offline, the settings panel, and a day other than today.
 *
 *   node scripts/states.mjs [outDir]
 */
import { chromium, devices } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ?? resolve(root, 'screenshots');
const url = process.env.PREVIEW_URL ?? 'http://localhost:5173/dashboard-iphone/';

const fixture = readFileSync(
  resolve(root, 'src/utils/__fixtures__/pse-72h.json'),
  'utf8'
);

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
let failures = 0;

async function capture(name, { colorScheme = 'light', body = fixture, status = 200, after } = {}) {
  const context = await browser.newContext({
    ...devices['iPhone 15 Pro'],
    colorScheme,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  });

  await context.route('**/api.raporty.pse.pl/**', (route) =>
    body === null
      ? route.abort('failed')
      : route.fulfill({ status, contentType: 'application/json', body })
  );

  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (after) await after(page);
  await page.waitForTimeout(600);

  await page.screenshot({ path: `${outDir}/state-${name}.png`, fullPage: true });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );

  const problems = [
    ...errors,
    ...(overflow > 0 ? [`horizontal overflow of ${overflow}px`] : []),
  ];
  if (problems.length) {
    failures++;
    console.error(`${name}: ${problems.join(' | ')}`);
  } else {
    console.log(`${name}: ok`);
  }

  await context.close();
}

await capture('no-data', { body: null });
await capture('settings', {
  after: (page) => page.getByRole('button', { name: 'Ustawienia' }).click(),
});
await capture('day-after-tomorrow', {
  after: (page) => page.getByRole('tab', { name: /Pojutrze/ }).click(),
});
await capture('tomorrow-dark', {
  colorScheme: 'dark',
  after: (page) => page.getByRole('tab', { name: /Jutro/ }).click(),
});

await browser.close();
process.exit(failures > 0 ? 1 : 0);
