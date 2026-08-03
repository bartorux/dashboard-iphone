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
        shortcuts: [
          {
            name: 'Aktualne alerty',
            short_name: 'Alerty',
            description: 'Zobacz aktualne alerty rezerw mocy',
            url: './#alerts',
          },
          {
            name: 'Odśwież dane',
            short_name: 'Odśwież',
            description: 'Ręczne odświeżenie danych z PSE',
            url: './#refresh',
          },
        ],
        prefer_related_applications: false,
      },
    }),
  ],
});
