/**
 * Internationalization (i18n) / Language switching tests.
 *
 * Covers:
 * - Language switcher visibility and interaction
 * - Switching between all supported languages (EN, SK, DE)
 * - Persistence across navigation and page reload
 * - Localized content on key views: home/discovery, event detail, login, filters, empty states, footer
 * - Fallback behavior when English is the default
 * - Document `lang` attribute updates
 */
import { expect, test } from '@playwright/test'
import {
  loginAs,
  makeAdminUser,
  makeApprovedEvent,
  makeTechDomain,
  setupMockApi,
} from './helpers/mock-api'

test.describe('Language switcher', () => {
  test('language switcher is visible in the header', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    const switcher = page.locator('#language-select')
    await expect(switcher).toBeVisible()
  })

  test('language switcher has all supported languages', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    const switcher = page.locator('#language-select')
    await expect(switcher).toBeVisible()
    await expect(switcher.locator('option')).toHaveCount(3)
    const values = await switcher.locator('option').evaluateAll((opts) =>
      (opts as HTMLOptionElement[]).map((o) => o.value),
    )
    expect(values).toEqual(expect.arrayContaining(['en', 'sk', 'de']))
  })

  test('language switcher updates document lang attribute', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.locator('#language-select').selectOption('sk')
    await expect(page.locator('html')).toHaveAttribute('lang', 'sk')

    await page.locator('#language-select').selectOption('de')
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  })
})

test.describe('English default', () => {
  test('defaults to English with correct hero and navigation', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover Events')
    await expect(page.getByRole('link', { name: 'Browse' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Submit Event' })).toBeVisible()
    await expect(page.locator('.app-footer')).toContainText('All rights reserved')
  })
})

test.describe('Slovak translations', () => {
  test('switching to Slovak updates hero, navigation, and footer', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    await page.locator('#language-select').selectOption('sk')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Objavte udalosti')
    await expect(page.getByRole('link', { name: 'Prehľadávať' }).first()).toBeVisible()
    await expect(page.locator('.app-footer')).toContainText('Všetky práva vyhradené')
  })

  test('filter labels are localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/')

    await page.locator('#language-select').selectOption('sk')

    await expect(page.getByLabel('Kľúčové slovo')).toBeVisible()
    await expect(page.getByLabel('Tag')).toBeVisible()
  })

  test('active filter chips and results summary are localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ name: 'Crypto Summit', slug: 'crypto-summit' }),
        makeApprovedEvent({ name: 'AI Meetup', slug: 'ai-meetup' }),
      ],
    })
    await page.goto('/?q=crypto')

    await page.locator('#language-select').selectOption('sk')

    await expect(page.locator('.filter-chip')).toContainText('Kľúčové slovo: crypto')
    await expect(page.locator('.results-summary')).toContainText(
      'Našla sa 1 udalosť pre Kľúčové slovo: crypto',
    )
  })

  test('empty state is localized in Slovak', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await page.locator('#language-select').selectOption('sk')

    await expect(page.getByText('Zatiaľ nie sú k dispozícii žiadne udalosti')).toBeVisible()
  })

  test('login view is localized in Slovak', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await page.locator('#language-select').selectOption('sk')
    await page.getByRole('link', { name: 'Prihlásenie' }).click()
    await page.waitForURL(/\/login/)

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Vitajte späť')
    await expect(page.getByLabel('E-mail')).toBeVisible()
    await expect(page.getByLabel('Heslo')).toBeVisible()
  })
})

test.describe('German translations', () => {
  test('switching to German updates hero, navigation, and footer', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    await page.locator('#language-select').selectOption('de')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Entdecken Sie Veranstaltungen',
    )
    await expect(page.getByRole('link', { name: 'Durchsuchen' }).first()).toBeVisible()
    await expect(page.locator('.app-footer')).toContainText('Alle Rechte vorbehalten')
  })

  test('empty state is localized in German', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await page.locator('#language-select').selectOption('de')

    await expect(page.getByText('Keine Veranstaltungen gefunden')).toBeVisible()
  })

  test('login view is localized in German', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await page.locator('#language-select').selectOption('de')
    await page.getByRole('link', { name: 'Anmelden' }).first().click()
    await page.waitForURL(/\/login/)

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Willkommen zurück')
    await expect(page.getByLabel('E-Mail')).toBeVisible()
    await expect(page.getByLabel('Passwort')).toBeVisible()
  })
})

test.describe('Language persistence', () => {
  test('language preference persists after navigation', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    await page.locator('#language-select').selectOption('sk')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Objavte udalosti')

    await page.getByRole('link', { name: 'Prihlásenie' }).click()
    await page.waitForURL(/\/login/)

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Vitajte späť')
  })

  test('language preference persists after page reload', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event' })],
    })
    await page.goto('/')

    await page.locator('#language-select').selectOption('de')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Entdecken Sie Veranstaltungen',
    )

    await page.reload()

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Entdecken Sie Veranstaltungen',
    )
  })

  test('switching back to English restores original text', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await page.locator('#language-select').selectOption('sk')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Objavte udalosti')

    await page.locator('#language-select').selectOption('en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover Events')
    await expect(page.locator('.app-footer')).toContainText('All rights reserved')
  })
})

test.describe('Localized event detail', () => {
  test('event detail view shows localized section headings in German', async ({ page }) => {
    const event = makeApprovedEvent({
      name: 'Localized Detail Event',
      slug: 'localized-detail',
      venueName: 'Test Venue',
      city: 'Bratislava',
      description: 'A great test event.',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto('/')
    await page.locator('#language-select').selectOption('de')

    await page.goto('/event/localized-detail')
    await expect(page.getByRole('heading', { name: 'Localized Detail Event' })).toBeVisible()

    await expect(page.getByText('Datum & Uhrzeit')).toBeVisible()
    await expect(page.getByText('Veranstaltungsort & Standort')).toBeVisible()
    await expect(page.getByText('Community-Interesse')).toBeVisible()
  })

  test('back link uses localized text in Slovak', async ({ page }) => {
    const event = makeApprovedEvent({
      name: 'Back Link Test',
      slug: 'back-link-test',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })

    await page.goto('/')
    await page.locator('#language-select').selectOption('sk')

    await page.goto('/event/back-link-test')

    await expect(page.getByRole('link', { name: /Späť na udalosti/ })).toBeVisible()
  })

  test('event not found page is localized in German', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')
    await page.locator('#language-select').selectOption('de')

    await page.goto('/event/nonexistent-slug')

    await expect(
      page.getByRole('heading', { name: 'Veranstaltung nicht gefunden' }),
    ).toBeVisible()
  })
})

test.describe('Localized dashboard', () => {
  test('unauthenticated dashboard shows localized sign-in prompt in German', async ({
    page,
  }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')
    await page.locator('#language-select').selectOption('de')

    await page.goto('/dashboard')

    await expect(
      page.getByRole('heading', { name: 'Anmeldung erforderlich' }),
    ).toBeVisible()
    // The login-prompt section should have the localized Log In button
    await expect(page.locator('.login-prompt').getByRole('link', { name: 'Anmelden' })).toBeVisible()
  })

  test('authenticated dashboard shows localized welcome in Slovak', async ({ page }) => {
    const user = makeAdminUser()
    setupMockApi(page, { users: [user], domains: [makeTechDomain()] })

    // Log in first (in English), then switch language
    await loginAs(page, user)
    await page.locator('#language-select').selectOption('sk')

    await expect(page.getByText('Vitajte späť')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Prehľad' })).toBeVisible()
  })
})

test.describe('Localized submit event', () => {
  test('submit event form shows localized labels in German', async ({ page }) => {
    const user = makeAdminUser()
    setupMockApi(page, { users: [user], domains: [makeTechDomain()] })

    // Log in first (in English), then switch language
    await loginAs(page, user)
    await page.locator('#language-select').selectOption('de')

    await page.goto('/submit')
    await expect(
      page.getByRole('heading', { name: 'Veranstaltung einreichen' }),
    ).toBeVisible()
    await expect(page.getByLabel('Veranstaltungstitel')).toBeVisible()
    await expect(page.getByLabel('Beschreibung')).toBeVisible()
  })
})

test.describe('Localized favorites', () => {
  test('favorites page shows localized sign-in prompt in Slovak', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')
    await page.locator('#language-select').selectOption('sk')

    await page.goto('/favorites')

    await expect(
      page.getByRole('heading', {
        name: 'Prihláste sa pre zobrazenie uložených udalostí',
      }),
    ).toBeVisible()
  })
})

test.describe('Localized category landing page', () => {
  test('category breadcrumb uses English "All Events" label by default', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('link', { name: 'All Events' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()
  })

  test('category page breadcrumb is localized in Slovak', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    // Switch to Slovak
    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')

    await expect(page.getByRole('link', { name: 'Všetky udalosti' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Udalosti/ })).toBeVisible()
  })

  test('category page breadcrumb is localized in German', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    // Switch to German
    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')

    await expect(page.getByRole('link', { name: 'Alle Veranstaltungen' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Veranstaltungen/ })).toBeVisible()
  })
})
