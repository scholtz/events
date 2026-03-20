/**
 * usePwa – composable for PWA-related state and behaviour.
 *
 * Responsibilities:
 *  - Track whether the browser is currently online or offline.
 *  - Expose an `updateAvailable` flag that becomes true when a new service
 *    worker version is waiting to activate.
 *  - Provide an `acceptUpdate()` action that sends SKIP_WAITING to the waiting
 *    SW and reloads the page so users always get the latest build.
 *
 * Registration strategy:
 *  - vite-plugin-pwa generates the service-worker and manifest at build time.
 *  - This composable manually registers the SW via workbox-window (a real npm
 *    package rather than a Vite virtual module) so it is safe in SSR builds.
 *  - Registration only runs inside onMounted and only in production browser
 *    environments, so SSR rendering is never affected.
 *  - In environments where service workers are not supported (SSR, test, old
 *    browsers) the composable degrades gracefully.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import type { Workbox } from 'workbox-window'

export function usePwa() {
  // ---------------------------------------------------------------------------
  // Online / offline tracking
  // ---------------------------------------------------------------------------
  const isOffline = ref(false)

  function onOnline() {
    isOffline.value = false
  }
  function onOffline() {
    isOffline.value = true
  }

  // ---------------------------------------------------------------------------
  // Service-worker update detection
  // ---------------------------------------------------------------------------
  const updateAvailable = ref(false)
  let wb: Workbox | null = null

  onMounted(async () => {
    if (typeof window === 'undefined') return

    isOffline.value = !window.navigator.onLine
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Only register the service worker in production browser builds.
    // During development (import.meta.env.DEV) the SW is not generated, so
    // attempting to register it would silently fail or serve stale assets.
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      const { Workbox: WorkboxCtor } = await import('workbox-window')
      wb = new WorkboxCtor('/sw.js')

      // A new SW has installed and is waiting to take over.
      wb.addEventListener('waiting', () => {
        updateAvailable.value = true
      })

      wb.register().catch(() => {
        // Registration failures are non-critical (e.g. unsupported context).
      })

      // Check for SW updates every hour so long-lived sessions pick up new
      // builds without requiring the user to hard-refresh.
      setInterval(
        () => {
          wb?.update().catch(() => {
            // Ignore update-check failures (e.g. offline).
          })
        },
        60 * 60 * 1000,
      )
    }
  })

  onUnmounted(() => {
    if (typeof window === 'undefined') return
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })

  /**
   * Accept the pending service-worker update and reload the page to activate
   * the new version.  Safe to call even when no update is available.
   */
  async function acceptUpdate() {
    if (wb) {
      // Once the SW takes control the page will reload to use the new build.
      wb.addEventListener('controlling', () => {
        window.location.reload()
      })
      // Tell the waiting SW to skip its waiting phase and become active.
      wb.messageSW({ type: 'SKIP_WAITING' })
    }
  }

  return {
    /** True when the browser has lost network connectivity. */
    isOffline,
    /** True when a new service-worker version is waiting to activate. */
    updateAvailable,
    /** Activate the waiting SW and reload the page. */
    acceptUpdate,
  }
}
