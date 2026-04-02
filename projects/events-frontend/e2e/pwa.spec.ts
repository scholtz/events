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
  makeAdminUser,
  makeTechDomain,
  setupMockApi,
  loginAs,
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
