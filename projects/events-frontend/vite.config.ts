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
            // injectManifest mode: we supply a custom src/sw.ts that workbox
            // compiles and injects the precache manifest into.  This is
            // required because our GraphQL caching strategy uses IDB (POST
            // responses cannot be stored in the Cache Storage API, which only
            // supports GET responses).
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectManifest: {
              // Glob patterns for assets to precache (app shell).
              globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
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
