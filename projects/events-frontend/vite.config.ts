import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    vue(),
    ...(isSsrBuild ? [] : [vueDevTools()]),
    // PWA plugin is only needed for the client (browser) build.
    ...(isSsrBuild
      ? []
      : [
          VitePWA({
            // We manage service-worker registration ourselves via workbox-window
            // in src/composables/usePwa.ts, so disable auto-injection here.
            registerType: 'prompt',
            injectRegister: null,
            // Use workbox for proven, bounded caching strategies.
            workbox: {
              // Cache the app shell (HTML entry, JS/CSS bundles, fonts).
              globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
              // Limit runtime cache sizes to avoid unbounded storage growth.
              runtimeCaching: [
                {
                  // GraphQL API: network-first so users always get fresh data;
                  // fall back to cache when offline. TTL is 1 hour so cached
                  // discovery results are clearly bounded and not stale forever.
                  urlPattern: ({ url }) => url.pathname === '/graphql',
                  handler: 'NetworkFirst',
                  options: {
                    cacheName: 'graphql-cache',
                    networkTimeoutSeconds: 5,
                    expiration: {
                      maxEntries: 50,
                      maxAgeSeconds: 60 * 60, // 1 hour
                    },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
                {
                  // Google Fonts stylesheets – stale-while-revalidate so the
                  // page loads even offline after the first visit.
                  urlPattern: /^https:\/\/fonts\.googleapis\.com/,
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'google-fonts-stylesheets',
                    expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 7 },
                  },
                },
                {
                  // Google Fonts files (woff2) – cache-first because font
                  // binaries are content-addressed and never change for a URL.
                  urlPattern: /^https:\/\/fonts\.gstatic\.com/,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'google-fonts-webfonts',
                    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
            manifest: {
              name: 'Events Platform',
              short_name: 'Events',
              description: 'Discover and explore events in your community.',
              theme_color: '#137fec',
              background_color: '#0d0f14',
              display: 'standalone',
              start_url: '/',
              scope: '/',
              lang: 'en',
              icons: [
                {
                  src: '/pwa-192x192.svg',
                  sizes: '192x192',
                  type: 'image/svg+xml',
                  purpose: 'any',
                },
                {
                  src: '/pwa-512x512.svg',
                  sizes: '512x512',
                  type: 'image/svg+xml',
                  purpose: 'any maskable',
                },
              ],
            },
          }),
        ]),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: isSsrBuild ? 'dist/server' : 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
}))
