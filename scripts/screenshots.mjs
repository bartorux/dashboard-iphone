/**
 * Visual check on an iPhone-sized viewport, in both colour schemes, against a
 * fixed API response. Run the dev server first, then:
 *
 *   node scripts/screenshots.mjs [outDir]
 *
 * Reports console errors and any horizontal overflow, which is the failure mode
 * that is easiest to introduce and hardest to spot in a narrow layout.
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

for (const colorScheme of ['light', 'dark']) {
  const context = await browser.newContext({
    ...devices['iPhone 15 Pro'],
    colorScheme,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  });

  await context.route('**/api.raporty.pse.pl/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: fixture,
    })
  );

  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await page.screenshot({ path: `${outDir}/${colorScheme}-full.png`, fullPage: true });
  await page.screenshot({ path: `${outDir}/${colorScheme}-fold.png` });

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );

  if (errors.length) {
    failures++;
    console.error(`${colorScheme}: ${errors.length} console error(s)`);
    errors.forEach((error) => console.error(`  ${error}`));
  } else {
    console.log(`${colorScheme}: no console errors`);
  }

  if (overflow > 0) {
    failures++;
    console.error(`${colorScheme}: horizontal overflow of ${overflow}px`);
  } else {
    console.log(`${colorScheme}: no horizontal overflow`);
  }

  await context.close();
}

await browser.close();
process.exit(failures > 0 ? 1 : 0);
