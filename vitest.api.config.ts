import { defineConfig } from 'vitest/config';

// Contract test against the live PSE API. Catches upstream changes before they
// show up as an empty chart on the phone. Deliberately excluded from `npm test`
// and from CI — it needs network and PSE availability.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.api.test.ts'],
    testTimeout: 30000,
  },
});
