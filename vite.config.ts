import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/dashboard-iphone/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Written by a scheduled job, not by the build, and json falls
            // outside the default precache patterns — so without this the card
            // simply vanishes offline. Network first keeps it current when there
            // is a connection, and readable when there is not.
            urlPattern: /\/summary\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'summary-cache',
              expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^https:\/\/api\.raporty\.pse\.pl/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pse-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 3600 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      manifest: {
        name: 'PSE Dashboard - Monitoring Rezerw Mocy',
        short_name: 'PSE Dashboard',
        description: 'Monitoring prognozowanych rezerw mocy w Krajowym Systemie Elektroenergetycznym',
        start_url: './',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0a84ff',
        theme_color: '#0a84ff',
        lang: 'pl',
        categories: ['utilities', 'productivity', 'business'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // No `shortcuts`. Two used to sit here promising "Aktualne alerty" and
        // "Odśwież dane" through `./#alerts` and `./#refresh`, but nothing in
        // the app has ever read `location.hash` — both merely opened it as
        // usual. Safari does not render manifest shortcuts at all, so on the
        // phone this app is installed on they were invisible as well as inert.
        prefer_related_applications: false,
      },
    }),
  ],
});
