/// <reference lib="webworker" />
/**
 * Custom service worker for the Events Platform PWA.
 *
 * Caching strategy summary:
 *
 * | Layer                        | Strategy                  | TTL      | Cap         |
 * |------------------------------|---------------------------|----------|-------------|
 * | App shell (JS/CSS/HTML/SVG)  | Precache (install-time)   | ∞ (hash) | all bundles |
 * | GraphQL POST read queries    | NetworkFirst + IDB        | 1 hour   | 50 entries  |
 * | GraphQL POST mutations       | Network only (no cache)   | —        | —           |
 * | Google Fonts stylesheets     | StaleWhileRevalidate      | 7 days   | 4 entries   |
 * | Google Fonts woff2 files     | CacheFirst                | 365 days | 10 entries  |
 *
 * GraphQL notes:
 *  - The browser Cache API does NOT support caching POST responses.  We
 *    therefore use IndexedDB for GraphQL response caching.
 *  - Mutation operations are detected via the `isMutationOperation` helper
 *    and are ALWAYS passed directly to the network without caching.
 *  - Read queries use NetworkFirst with a 5-second network timeout.  If the
 *    network fails or times out we fall back to the IDB cache (max 1 hour
 *    old).  If neither succeeds the original network error is re-thrown so
 *    the app can show its own error/offline state.
 */

import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import {
  isMutationOperation,
  makeGraphQlCacheKey,
  openGqlDb,
  idbGet,
  idbPut,
  GQL_MAX_AGE_MS,
} from './lib/graphqlSw'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// ---------------------------------------------------------------------------
// Lifecycle: take control immediately so new installs start caching on the
// very first visit rather than waiting for the next page load.
// ---------------------------------------------------------------------------
self.addEventListener('install', () => {
  self.skipWaiting()
})
clientsClaim()

// ---------------------------------------------------------------------------
// App shell precaching (injected by vite-plugin-pwa at build time)
// ---------------------------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST ?? [])
cleanupOutdatedCaches()

// ---------------------------------------------------------------------------
// Update prompt: the app sends SKIP_WAITING when the user clicks
// "Refresh to update" so the new SW version activates immediately.
// ---------------------------------------------------------------------------
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ---------------------------------------------------------------------------
// Push notifications: show a notification when a push event is received.
// The payload is expected to be a JSON object with title, body, and url fields.
// ---------------------------------------------------------------------------
self.addEventListener('push', (event: PushEvent) => {
  let title = 'Events Platform'
  let body = 'You have a new notification.'
  let url = '/'
  let icon = '/pwa-192x192.png'

  if (event.data) {
    try {
      const data = event.data.json()
      title = data.title ?? title
      body = data.body ?? body
      url = data.url ?? url
      icon = data.icon ?? icon
    } catch {
      // Malformed payload — use defaults
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      data: { url },
      badge: '/pwa-192x192.png',
      tag: url, // Deduplicate notifications for the same event
    }),
  )
})

// ---------------------------------------------------------------------------
// Notification click: open (or focus) the relevant event page in the app.
// ---------------------------------------------------------------------------
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  const targetUrl: string = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus an already-open window at the target URL
        for (const client of clientList) {
          if (client.url.endsWith(targetUrl) && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new window
        for (const client of clientList) {
          if ('navigate' in client) {
            return (client as WindowClient).navigate(targetUrl).then((c) => c?.focus())
          }
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})

// ---------------------------------------------------------------------------
// Google Fonts stylesheets – StaleWhileRevalidate
// ---------------------------------------------------------------------------
registerRoute(
  /^https:\/\/fonts\.googleapis\.com/,
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 4,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
    ],
  }),
)

// ---------------------------------------------------------------------------
// Google Fonts webfonts – CacheFirst (content-addressed URLs never change)
// ---------------------------------------------------------------------------
registerRoute(
  /^https:\/\/fonts\.gstatic\.com/,
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 365 days
      }),
    ],
  }),
)

// ---------------------------------------------------------------------------
// GraphQL POST caching via IndexedDB
//
// POST responses cannot be stored in the Cache Storage API (browser spec
// only allows GET responses).  We use IndexedDB as a bounded response store
// with a NetworkFirst strategy: try the network with a 5-second timeout, and
// fall back to IDB when the network fails or is unavailable.
//
// The IDB helper functions (openGqlDb, idbGet, idbPut) live in graphqlSw.ts
// so they can be unit-tested in isolation.  The SW calls openGqlDb() with
// self.indexedDB to bind the factory to the service-worker global.
// ---------------------------------------------------------------------------

const GQL_NETWORK_TIMEOUT_MS = 5000

// Lazily-opened IDB connection, reused across requests.
let _db: IDBDatabase | null = null

function getOrOpenDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return openGqlDb(self.indexedDB).then((db) => {
    _db = db
    return db
  })
}

async function fetchWithTimeout(request: Request, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    // Clone the request to pass the signal without consuming the original
    const cloned = new Request(request, { signal: controller.signal })
    return await fetch(cloned)
  } finally {
    clearTimeout(timer)
  }
}

async function handleGraphQLPost(request: Request): Promise<Response> {
  // Read the body from a clone so the original request is not consumed.
  // We need the original to pass to fetch().
  const bodyText = await request.clone().text()

  let parsed: { query?: string; variables?: unknown }
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    // Malformed body – pass through to network without caching
    return fetch(request)
  }

  const query = parsed.query ?? ''
  const variables = parsed.variables ?? {}

  // Never cache mutations – they have side effects on the server.
  if (isMutationOperation(query)) {
    return fetch(request)
  }

  const cacheKey = makeGraphQlCacheKey(request.url, query, variables)

  // NetworkFirst: attempt network with timeout, fall back to IDB.
  try {
    const networkResponse = await fetchWithTimeout(request, GQL_NETWORK_TIMEOUT_MS)

    if (networkResponse.ok) {
      // Cache the response body in IDB (fire-and-forget; don't block the response)
      networkResponse
        .clone()
        .text()
        .then(async (body) => {
          try {
            const db = await getOrOpenDb()
            await idbPut(db, { cacheKey, body, timestamp: Date.now() })
          } catch {
            // IDB write failures are non-critical
          }
        })
        .catch(() => {
          // Ignore
        })
    }

    return networkResponse
  } catch {
    // Network failed or timed out – try IDB cache
    try {
      const db = await getOrOpenDb()
      const cached = await idbGet(db, cacheKey)

      if (cached && Date.now() - cached.timestamp < GQL_MAX_AGE_MS) {
        return new Response(cached.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            // Custom header so tests and debugging tools can identify cached responses
            'X-PWA-Cache': 'HIT',
          },
        })
      }
    } catch {
      // IDB read also failed – fall through to network error
    }

    // Nothing available – re-throw so the app can show its error/offline state
    throw new Error('Network request failed and no cached response available')
  }
}

// Register the fetch handler for GraphQL POST requests.
// We use a raw addEventListener instead of registerRoute because workbox's
// router only handles GET requests via its RouteMatchCallback.
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event
  if (
    request.method === 'POST' &&
    // Match any URL ending with /graphql (covers localhost dev, staging, and prod)
    request.url.endsWith('/graphql')
  ) {
    event.respondWith(handleGraphQLPost(request))
  }
})
