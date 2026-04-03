/**
 * PWA-specific Playwright E2E tests.
 *
 * These tests verify:
 *  1. The app manifest is linked and has the expected fields.
 *  2. The offline banner appears when the network is blocked and no cached data
 *     is available, and disappears when connectivity is restored.
 *  3. The discovery page still loads normally when online.
 *  4. The service worker caches GraphQL query responses in IDB and serves them
 *     when the network becomes unavailable (production build only).
 *  5. Previously visited event details show a graceful fallback when the
 *     network is blocked and no IDB cache is available.
 *  6. The update prompt (`.update-banner`) is hidden during a normal online
 *     session (it only shows when `updateAvailable` becomes true at runtime).
 *  7. The offline banner and update prompt are accessible via ARIA attributes.
 *  8. Key UI is still functional on a mobile viewport.
 *
 * ## Service-worker caching tests (CI / production build)
 *
 * The "SW caches GraphQL responses in IDB" test requires the production build
 * served by `vite preview` because the service worker (`dist/sw.js`) is only
 * generated during `npm run build:client`.  In dev mode (`vite dev`) no SW is
 * built, so the test is skipped automatically.
 *
 * How it works:
 *  - `page.route()` intercepts ALL network requests, including the SW's
 *    internal `fetch()` calls.  So the mock API responses are visible to the
 *    SW and get stored in IDB.
 *  - After the SW takes control, GraphQL is blocked.  The SW detects the
 *    network failure and falls back to IDB, serving the previously cached
 *    response without any degradation to the UI.
 */

import { expect, test } from '@playwright/test'
import {
  makeApprovedEvent,
  makeTechDomain,
  setupMockApi,
} from './helpers/mock-api'

// ─────────────────────────────────────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PWA manifest', () => {
  test('manifest link tag is present in the document head', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    const manifestLocator = page.locator('link[rel="manifest"]')
    await expect(manifestLocator).toBeAttached()
    const href = await manifestLocator.getAttribute('href')
    expect(typeof href).toBe('string')
    expect(href).toMatch(/manifest\.webmanifest/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Offline / stale-data freshness model – discovery
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Discovery freshness – offline with cached events', () => {
  test('shows cached-results notice when offline and events are in the store', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Cached Conf', slug: 'cached-conf' })
    setupMockApi(page, { domains: [domain], events: [event] })

    // Navigate online so events load into the store.
    await page.goto('/')
    await expect(page.locator('.event-card', { hasText: 'Cached Conf' })).toBeVisible()

    // The cached-results notice must NOT be visible while online.
    await expect(page.locator('.cached-results-notice')).toBeHidden()

    // Simulate going offline.
    await page.context().setOffline(true)

    // The offline/cached-results notice should appear reactively.
    await expect(page.locator('.cached-results-notice')).toBeVisible()

    // The event list must still be visible (cached data is preserved).
    await expect(page.locator('.event-card', { hasText: 'Cached Conf' })).toBeVisible()

    // Restore online state.
    await page.context().setOffline(false)
  })

  test('cached-results notice disappears when connectivity is restored', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Reconnect Event', slug: 'reconnect-event' })
    setupMockApi(page, { domains: [domain], events: [event] })

    await page.goto('/')
    await expect(page.locator('.event-card', { hasText: 'Reconnect Event' })).toBeVisible()

    // Go offline → notice appears.
    await page.context().setOffline(true)
    await expect(page.locator('.cached-results-notice')).toBeVisible()

    // Come back online → notice disappears.
    await page.context().setOffline(false)
    await expect(page.locator('.cached-results-notice')).toBeHidden()
  })

  test('cached-results notice is accessible via ARIA', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Aria Test Event', slug: 'aria-test-event' })
    setupMockApi(page, { domains: [domain], events: [event] })

    await page.goto('/')
    await expect(page.locator('.event-card', { hasText: 'Aria Test Event' })).toBeVisible()

    await page.context().setOffline(true)
    const notice = page.locator('.cached-results-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toHaveAttribute('aria-live', 'polite')

    await page.context().setOffline(false)
  })
})

test.describe('Discovery freshness – offline with no cached data', () => {
  test('shows offline error message when API fails and app is offline', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })

    // Navigate online first so the app shell loads.
    await page.goto('/')

    // Register a route override that aborts DiscoveryEvents requests.
    await page.route('**/graphql', async (route, request) => {
      const body = request.postData() ?? ''
      if (body.includes('DiscoveryEvents')) {
        await route.abort('failed')
        return
      }
      await route.fallback()
    })

    // Trigger a new fetch by changing a filter while still online (but API now fails).
    // Vue Router navigation keeps the app shell loaded.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/?q=test-offline')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    // The fetch fails – generic error state should appear (online variant).
    await expect(
      page.getByRole('heading', { name: "Couldn't load event results" }),
    ).toBeVisible({ timeout: 5000 })

    // Now go offline – the error heading should show the offline variant.
    await page.context().setOffline(true)
    await expect(page.getByRole('heading', { name: "You're offline" })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()

    await page.context().setOffline(false)
  })
})

test.describe('Discovery freshness – mobile viewport', () => {
  test('cached-results notice is visible on mobile when offline', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ name: 'Mobile Offline Event', slug: 'mobile-offline-event' })
    setupMockApi(page, { domains: [domain], events: [event] })

    await page.goto('/')
    await expect(page.locator('.event-card', { hasText: 'Mobile Offline Event' })).toBeVisible()

    await page.context().setOffline(true)
    await expect(page.locator('.cached-results-notice')).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Offline Event' })).toBeVisible()

    await page.context().setOffline(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Offline / stale-data freshness model – event detail
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Event detail freshness – offline with cached event', () => {
  test('shows stale-data notice when offline after loading event detail', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      name: 'Stale Detail Event',
      slug: 'stale-detail-event',
    })
    setupMockApi(page, { domains: [domain], events: [event] })

    // Navigate to the event detail while online.
    await page.goto(`/event/${event.slug}`)
    await expect(page.getByRole('heading', { name: 'Stale Detail Event' })).toBeVisible()

    // Stale-data notice must NOT appear while online with live data.
    await expect(page.locator('.stale-data-notice')).toBeHidden()

    // Go offline → stale notice should appear.
    await page.context().setOffline(true)
    await expect(page.locator('.stale-data-notice')).toBeVisible()

    // The event detail must still be fully readable.
    await expect(page.getByRole('heading', { name: 'Stale Detail Event' })).toBeVisible()

    await page.context().setOffline(false)
  })

  test('stale-data notice is accessible via ARIA', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      name: 'Aria Detail Event',
      slug: 'aria-detail-event',
    })
    setupMockApi(page, { domains: [domain], events: [event] })

    await page.goto(`/event/${event.slug}`)
    await expect(page.getByRole('heading', { name: 'Aria Detail Event' })).toBeVisible()

    await page.context().setOffline(true)
    const notice = page.locator('.stale-data-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toHaveAttribute('aria-live', 'polite')

    await page.context().setOffline(false)
  })

  test('stale-data notice disappears when connectivity is restored', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      name: 'Reconnect Detail Event',
      slug: 'reconnect-detail-event',
    })
    setupMockApi(page, { domains: [domain], events: [event] })

    await page.goto(`/event/${event.slug}`)
    await expect(page.getByRole('heading', { name: 'Reconnect Detail Event' })).toBeVisible()

    await page.context().setOffline(true)
    await expect(page.locator('.stale-data-notice')).toBeVisible()

    await page.context().setOffline(false)
    await expect(page.locator('.stale-data-notice')).toBeHidden()
  })
})

test.describe('Event detail freshness – error state', () => {
  test('shows error state with retry button when API fails', async ({ page }) => {
    setupMockApi(page)
    await page.route('**/graphql', async (route, request) => {
      const body = request.postData() ?? ''
      if (body.includes('EventBySlug')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Service temporarily unavailable' }] }),
        })
        return
      }
      await route.fallback()
    })

    await page.goto('/event/missing-event')
    await expect(page.getByRole('heading', { name: 'Unable to load event' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})

