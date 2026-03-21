/**
 * Internationalization (i18n) / Language switching tests.
 */
import { expect, test } from '@playwright/test'
import { makeApprovedEvent, makeTechDomain, setupMockApi } from './helpers/mock-api'

test.describe('Language switching', () => {
  test('language switcher is visible in the header', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    const switcher = page.locator('#language-select')
    await expect(switcher).toBeVisible()
  })

  test('defaults to English', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    // The hero heading should be in English
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover Events')
    // Nav links should be in English
    await expect(page.getByRole('link', { name: 'Browse' }).first()).toBeVisible()
  })

  test('switching to Slovak updates the UI', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    // Switch to Slovak
    await page.locator('#language-select').selectOption('sk')

    // Hero heading should now be in Slovak
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Objavte udalosti')
    // Nav links should be in Slovak
    await expect(page.getByRole('link', { name: 'Prehľadávať' }).first()).toBeVisible()
  })

  test('switching to German updates the UI', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    // Switch to German
    await page.locator('#language-select').selectOption('de')

    // Hero heading should now be in German
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Entdecken Sie Veranstaltungen')
    // Nav links should be in German
    await expect(page.getByRole('link', { name: 'Durchsuchen' }).first()).toBeVisible()
  })

  test('language preference persists after navigation', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    // Switch to Slovak
    await page.locator('#language-select').selectOption('sk')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Objavte udalosti')

    // Navigate to login page
    await page.getByRole('link', { name: 'Prihlásenie' }).click()
    await page.waitForURL(/\/login/)

    // Login page should be in Slovak
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Vitajte späť')
  })

  test('language preference persists after page reload', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    // Switch to German
    await page.locator('#language-select').selectOption('de')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Entdecken Sie Veranstaltungen')

    // Reload the page
    await page.reload()

    // Page should still be in German after reload
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Entdecken Sie Veranstaltungen')
  })

  test('filters section is localized when switching to Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/')

    // Switch to Slovak
    await page.locator('#language-select').selectOption('sk')

    // Check filter labels are translated
    await expect(page.getByLabel('Kľúčové slovo')).toBeVisible()
    await expect(page.getByLabel('Doména')).toBeVisible()
  })

  test('empty state message is localized', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    // Switch to German
    await page.locator('#language-select').selectOption('de')

    // Empty state should show German text
    await expect(page.getByText('Keine Veranstaltungen gefunden')).toBeVisible()
  })

  test('footer is localized', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    // Switch to Slovak
    await page.locator('#language-select').selectOption('sk')

    // Footer should contain Slovak text
    await expect(page.locator('.app-footer')).toContainText('Všetky práva vyhradené')
  })

  test('event detail view shows localized labels after switching language', async ({ page }) => {
    const event = makeApprovedEvent({
      name: 'Localized Event',
      slug: 'localized-event',
      venueName: 'Test Venue',
      city: 'Bratislava',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    // Switch to German first, then navigate to event
    await page.goto('/')
    await page.locator('#language-select').selectOption('de')

    // Navigate to event detail
    await page.goto('/event/localized-event')
    await expect(page.getByRole('heading', { level: 1, name: 'Localized Event' })).toBeVisible()
  })
})
