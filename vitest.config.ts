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
  },
});
