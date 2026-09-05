import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts on purpose: the PWA and Tailwind plugins have
// nothing to do in a test run and only slow it down / emit service workers.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // The app implicitly works in Polish local time (PSE business days).
    // Pin it so tests don't depend on the machine's timezone.
    env: { TZ: 'Europe/Warsaw' },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // The API contract test hits the real PSE endpoint — run it explicitly
    // with `npm run test:api`, never in CI.
    exclude: ['**/node_modules/**', '**/*.api.test.ts'],
    // `css: false` (the default) stubs out every *.css import, `?raw` query
    // included — Vitest's own mock plugin matches on the .css extension
    // before Vite's `?raw` plugin gets a turn. designTokens.test.ts reads
    // App.css's literal token values via `?raw` (the only way to check an
    // exact hex value without giving `src` a dependency on Node's `fs`,
    // which tsconfig.json deliberately keeps out — see its comment). This
    // carve-out lets that one query pattern through to the real pipeline
    // without turning on full CSS processing for every other test.
    css: { include: [/\?raw$/] },
  },
});
