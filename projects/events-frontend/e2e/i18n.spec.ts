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
  makePendingEvent,
  makeRejectedEvent,
  makeTechDomain,
  seedAuthAndLocale,
  setupMockApi,
} from './helpers/mock-api'
import type { MockScheduledFeaturedEvent } from './helpers/mock-api'

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

  test('all-time total label is localized in German', async ({ page }) => {
    const user = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'ev-de-alltime',
      slug: 'de-alltime-event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })
    setupMockApi(page, { users: [user], domains: [makeTechDomain()], events: [event] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('de')

    // German "All-time total" label should appear on KPI cards
    const savesCard = page.locator('.stat-card', {
      has: page.locator('.stat-label', { hasText: 'Gesamte Speicherungen' }),
    })
    await expect(savesCard.locator('.stat-timeframe')).toContainText('Gesamtzahl aller Zeiten')
  })

  test('per-event recommendation for rejected event is localized in Slovak', async ({ page }) => {
    const user = makeAdminUser()
    const event = makeRejectedEvent({
      id: 'ev-sk-rejected',
      slug: 'sk-rejected-event',
      name: 'Rejected SK Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
      adminNotes: 'Please improve the description.',
    })
    setupMockApi(page, { users: [user], domains: [makeTechDomain()], events: [event] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('sk')

    // Slovak rejection recommendation should be visible
    await expect(page.locator('.event-recommendation-row.rec--rejected')).toBeVisible()
    await expect(page.locator('.rec-admin-notes')).toBeVisible()
  })

  test('first-event welcome card is localized in German', async ({ page }) => {
    const user = makeAdminUser()
    const event = makePendingEvent({
      id: 'ev-de-first',
      slug: 'de-first-event',
      name: 'First DE Event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })
    setupMockApi(page, { users: [user], domains: [makeTechDomain()], events: [event] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('de')

    // German first-event welcome should be visible
    await expect(page.locator('.first-event-welcome')).toBeVisible()
    await expect(page.locator('.first-event-welcome')).toContainText(
      'Ihre erste Veranstaltung wurde eingereicht!',
    )
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

  test('submit event form country code placeholder is localized in Slovak', async ({ page }) => {
    const user = makeAdminUser()
    setupMockApi(page, { users: [user], domains: [makeTechDomain()] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('sk')

    await page.goto('/submit')
    // Slovak country code placeholder should say "napr. SK" not "CZ"
    await expect(page.locator('#event-country')).toHaveAttribute('placeholder', 'napr. SK')
  })

  test('submit event form event title placeholder is localized in German', async ({ page }) => {
    const user = makeAdminUser()
    setupMockApi(page, { users: [user], domains: [makeTechDomain()] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('de')

    await page.goto('/submit')
    // German event title placeholder visible on step 1 without navigation
    await expect(page.locator('#event-title')).toHaveAttribute(
      'placeholder',
      'z.B. Prague Crypto Summit 2026',
    )
    // Country code placeholder should also be localized
    await expect(page.locator('#event-country')).toHaveAttribute('placeholder', 'z.B. DE')
  })

  test('submit event language select label is localized in German', async ({ page }) => {
    const user = makeAdminUser()
    setupMockApi(page, { users: [user], domains: [makeTechDomain()] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('de')

    await page.goto('/submit')
    await expect(page.getByLabel('Veranstaltungssprache', { exact: false })).toBeVisible()
  })

  test('submit event language select label is localized in Slovak', async ({ page }) => {
    const user = makeAdminUser()
    setupMockApi(page, { users: [user], domains: [makeTechDomain()] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('sk')

    await page.goto('/submit')
    await expect(page.getByLabel('Jazyk udalosti', { exact: false })).toBeVisible()
  })
})

test.describe('Localized portfolio view', () => {
  test('portfolio filter controls have localized aria-labels in Slovak', async ({ page }) => {
    const user = makeAdminUser()
    const event = makeApprovedEvent({ submittedByUserId: user.id })
    setupMockApi(page, { users: [user], domains: [makeTechDomain()], events: [event] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('sk')

    await page.goto('/portfolio')

    // Filter controls only appear when the user has events
    await expect(page.locator('[aria-label="Filtrovať podľa stavu"]')).toBeVisible()
    await expect(page.locator('[aria-label="Filtrovať podľa kategórie"]')).toBeVisible()
    await expect(page.locator('[aria-label="Zoradiť udalosti"]')).toBeVisible()
  })

  test('portfolio filter controls have localized aria-labels in German', async ({ page }) => {
    const user = makeAdminUser()
    const event = makeApprovedEvent({ submittedByUserId: user.id })
    setupMockApi(page, { users: [user], domains: [makeTechDomain()], events: [event] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('de')

    await page.goto('/portfolio')

    // Filter controls only appear when the user has events
    await expect(page.locator('[aria-label="Nach Status filtern"]')).toBeVisible()
    await expect(page.locator('[aria-label="Nach Kategorie filtern"]')).toBeVisible()
    await expect(page.locator('[aria-label="Veranstaltungen sortieren"]')).toBeVisible()
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

    await expect(page.getByRole('link', { name: 'All Events', exact: true })).toBeVisible()
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

    await expect(page.getByRole('link', { name: 'Všetky udalosti', exact: true })).toBeVisible()
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

    await expect(page.getByRole('link', { name: 'Alle Veranstaltungen', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Veranstaltungen/ })).toBeVisible()
  })

  test('hub overview "About this hub" heading is localized in Slovak', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      overviewContent: 'A curated community for developer-focused technology events.',
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/category/technology')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')

    await expect(page.getByRole('heading', { name: 'O tomto hube' })).toBeVisible()
    await expect(
      page.getByText('A curated community for developer-focused technology events.'),
    ).toBeVisible()
  })

  test('hub overview "What belongs here" heading is localized in German', async ({ page }) => {
    const domain = {
      ...makeTechDomain(),
      whatBelongsHere: 'Developer meetups, hackathons, and engineering conferences.',
    }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/category/technology')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')

    await expect(page.getByRole('heading', { name: 'Was gehört hierher' })).toBeVisible()
    await expect(
      page.getByText('Developer meetups, hackathons, and engineering conferences.'),
    ).toBeVisible()
  })

  test('curator credit line is localized in Slovak', async ({ page }) => {
    const domain = { ...makeTechDomain(), curatorCredit: 'Prague Tech Community' }
    setupMockApi(page, { domains: [domain], events: [makeApprovedEvent()] })
    await page.goto('/category/technology')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')

    // Slovak: "Spravuje: {credit}"
    await expect(page.locator('.curator-credit')).toContainText('Prague Tech Community')
    await expect(page.locator('.curator-credit')).toContainText('Spravuje')
  })

  test('featured events section heading is localized in German', async ({ page }) => {
    const domain = { ...makeTechDomain(), id: 'domain-feat-de' }
    const event = makeApprovedEvent({ id: 'ev-feat-de', slug: 'ev-feat-de' })
    setupMockApi(page, {
      domains: [domain],
      events: [event],
      featuredEvents: [{ domainSlug: domain.slug, eventId: event.id, displayOrder: 0 }],
    })
    await page.goto('/category/technology')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')

    await expect(
      page.getByRole('heading', { name: 'Hervorgehobene Veranstaltungen' }),
    ).toBeVisible()
  })
})

test.describe('Localized hub context card on event detail', () => {
  test('hub context heading is localized in Slovak', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-i18n-sk',
      slug: 'ev-i18n-sk',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain, description: 'Tech events' },
    })
    setupMockApi(page, { domains: [domain], events: [event] })
    await page.goto(`/event/${event.slug}`)
    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')
    await expect(page.locator('.hub-context').getByRole('heading', { name: 'O tomto centre' })).toBeVisible()
  })

  test('hub context explore link is localized in German', async ({ page }) => {
    const domain = makeTechDomain()
    const event = makeApprovedEvent({
      id: 'ev-i18n-de',
      slug: 'ev-i18n-de',
      domainId: domain.id,
      domain: { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain, description: 'Tech events' },
    })
    setupMockApi(page, { domains: [domain], events: [event] })
    await page.goto(`/event/${event.slug}`)
    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')
    await expect(page.locator('.hub-context').getByRole('heading', { name: 'Über diesen Hub' })).toBeVisible()
    await expect(page.locator('.hub-context-link')).toContainText('Veranstaltungen erkunden')
  })
})

// ---------------------------------------------------------------------------
// Calendar localization
// ---------------------------------------------------------------------------

test.describe('Calendar action localization', () => {
  test('add to calendar button is localized in German', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-de',
      name: 'German Calendar Event',
      slug: 'german-calendar-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto('/')
    await page.locator('#language-select').selectOption('de')
    await page.goto(`/event/${event.slug}`)

    // Button label should be in German
    await expect(page.getByRole('button', { name: /Zum Kalender hinzufügen/i })).toBeVisible()
  })

  test('calendar menu aria-label is localized in German', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-menu-de',
      name: 'German Calendar Menu Event',
      slug: 'german-calendar-menu-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto('/')
    await page.locator('#language-select').selectOption('de')
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Zum Kalender hinzufügen/i }).click()

    const menu = page.locator('[role="menu"]')
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('aria-label', 'Kalenderoptionen')
  })

  test('calendar menu provider labels are localized in German', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-cal-providers-de',
      name: 'German Providers Event',
      slug: 'german-providers-event',
    })
    setupMockApi(page, { domains: [makeTechDomain()], events: [event] })

    await page.goto('/')
    await page.locator('#language-select').selectOption('de')
    await page.goto(`/event/${event.slug}`)

    await page.getByRole('button', { name: /Zum Kalender hinzufügen/i }).click()

    await expect(page.getByRole('menuitem', { name: /Google Kalender/i })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Outlook/i })).toBeVisible()
  })

  test('calendar KPI card label is localized in German on organizer dashboard', async ({
    page,
  }) => {
    const user = makeAdminUser()
    const event = makeApprovedEvent({
      id: 'ev-cal-kpi-de',
      slug: 'cal-kpi-de-event',
      submittedByUserId: user.id,
      submittedBy: { displayName: user.displayName },
    })
    setupMockApi(page, { users: [user], domains: [makeTechDomain()], events: [event] })

    await loginAs(page, user)
    await page.locator('#language-select').selectOption('de')

    // German 'Calendar Adds' KPI label should appear on the dashboard
    await expect(page.locator('.stat-label', { hasText: 'Kalendereinträge' })).toBeVisible()
    // Helper text should also be in German
    await expect(
      page.locator('.stat-helper', {
        hasText: 'Alle bisherigen Kalenderexporte Ihrer veröffentlichten Veranstaltungen',
      }),
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Localized discovery empty-state and recovery actions
// ---------------------------------------------------------------------------

test.describe('Localized discovery empty states and recovery', () => {
  test('empty-state over-filtered message is localized in German', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      // Only an ONLINE event, so IN_PERSON filter yields empty state
      events: [makeApprovedEvent({ id: 'e-online-de', attendanceMode: 'ONLINE' })],
    })
    // Set German locale before navigating so all labels load in German
    await page.addInitScript(() => { localStorage.setItem('app_locale', 'de') })

    // Navigate directly to the IN_PERSON filtered URL — no UI interaction needed
    await page.goto('/?mode=in-person')

    // German empty-state heading
    await expect(page.getByRole('heading', { name: 'Keine Veranstaltungen gefunden' })).toBeVisible()
    // German recovery action for mode filter
    await expect(page.locator('.recovery-action', { hasText: 'Online-Veranstaltungen versuchen' })).toBeVisible()
  })

  test('empty-state recovery action is localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-online-sk', attendanceMode: 'ONLINE' })],
    })
    await page.addInitScript(() => { localStorage.setItem('app_locale', 'sk') })

    await page.goto('/?mode=in-person')

    // Slovak recovery action for mode filter
    await expect(page.locator('.recovery-action', { hasText: 'Vyskúšať online udalosti' })).toBeVisible()
  })

  test('language filter empty-state recovery action is localized in German', async ({ page }) => {
    setupMockApi(page, {
      events: [makeApprovedEvent({ id: 'e-lang-de', language: 'en' })],
    })
    await page.addInitScript(() => { localStorage.setItem('app_locale', 'de') })

    // Navigate directly to Czech language filter — no German events, empty state expected
    await page.goto('/?lang=cs')

    await expect(page.getByRole('heading', { name: 'Keine Veranstaltungen gefunden' })).toBeVisible()
    await expect(
      page.locator('.recovery-action', { hasText: 'Veranstaltungen in allen Sprachen anzeigen' }),
    ).toBeVisible()
  })

  test('language filter empty-state recovery action is localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      events: [makeApprovedEvent({ id: 'e-lang-sk', language: 'en' })],
    })
    await page.addInitScript(() => { localStorage.setItem('app_locale', 'sk') })

    await page.goto('/?lang=cs')

    await expect(page.getByRole('heading', { name: 'Nenašli sa žiadne udalosti' })).toBeVisible()
    await expect(
      page.locator('.recovery-action', { hasText: 'Zobraziť udalosti vo všetkých jazykoch' }),
    ).toBeVisible()
  })

  test('low-signal notice is localized in German', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-solo-de', name: 'Solo German Event', slug: 'solo-german-event' })],
    })
    await page.goto('/')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.low-signal-notice')).toContainText('Bisher nur 1 Veranstaltung')
    await expect(
      page.locator('.low-signal-notice .low-signal-action', { hasText: 'Alle Veranstaltungen anzeigen' }),
    ).toBeVisible()
  })

  test('low-signal notice is localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-solo-sk', name: 'Solo Slovak Event', slug: 'solo-slovak-event' })],
    })
    await page.goto('/')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.low-signal-notice')).toContainText('Zatiaľ len 1 udalosť')
    await expect(
      page.locator('.low-signal-notice .low-signal-action', { hasText: 'Zobraziť všetky udalosti' }),
    ).toBeVisible()
  })

  test('fallback category suggestions title is localized in German', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [], // empty catalog with no filters → shows generic hub suggestions
    })
    await page.goto('/')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')

    await expect(page.locator('.fallback-suggestions-title', { hasText: 'Veranstaltungskategorien durchsuchen' })).toBeVisible()
  })

  test('fallback category suggestions title is localized in Slovak', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [],
    })
    await page.goto('/')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')

    await expect(page.locator('.fallback-suggestions-title', { hasText: 'Prehľadávať kategórie udalostí' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Localized category hub quiet state
// ---------------------------------------------------------------------------

test.describe('Localized category hub quiet state', () => {
  test('category hub empty state heading is localized in German', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })
    await page.goto('/category/technology')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')

    await expect(page.getByRole('heading', { name: 'Keine bevorstehenden Veranstaltungen' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Alle Veranstaltungen durchsuchen', exact: true })).toBeVisible()
  })

  test('category hub empty state heading is localized in Slovak', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()], events: [] })
    await page.goto('/category/technology')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('sk')

    await expect(page.getByRole('heading', { name: 'Žiadne nadchádzajúce udalosti' })).toBeVisible()
  })

  test('category hub low-signal notice is localized in German', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-hub-de', name: 'Hub German Event', slug: 'hub-german-event' })],
    })
    await page.goto('/category/technology')

    await page.getByRole('combobox', { name: 'Language' }).selectOption('de')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.low-signal-notice')).toContainText('Bisher nur 1 Veranstaltung')
    await expect(
      page.locator('.low-signal-notice .low-signal-action', { hasText: 'Alle Veranstaltungen anzeigen' }),
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Localized rank context badge (HomeView discovery)
// ---------------------------------------------------------------------------

test.describe('Localized rank context badge', () => {
  test('rank context badge shows "Nach Datum sortiert" in German (UPCOMING sort)', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Tech Meetup', slug: 'tech-meetup' }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/')

    await expect(page.locator('.rank-context-badge')).toBeVisible()
    await expect(page.locator('.rank-context-badge')).toContainText('Nach Datum sortiert')
  })

  test('rank context badge shows "Zoradené podľa dátumu" in Slovak (UPCOMING sort)', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Tech Meetup', slug: 'tech-meetup' }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/')

    await expect(page.locator('.rank-context-badge')).toBeVisible()
    await expect(page.locator('.rank-context-badge')).toContainText('Zoradené podľa dátumu')
  })

  test('rank context badge shows "Neueste zuerst" in German when NEWEST sort is active', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Tech Meetup', slug: 'tech-meetup' }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/?sort=newest')

    await expect(page.locator('.rank-context-badge')).toBeVisible()
    await expect(page.locator('.rank-context-badge')).toContainText('Neueste zuerst')
  })
})

// ---------------------------------------------------------------------------
// Localized subdomain hub empty state
// ---------------------------------------------------------------------------

test.describe('Localized subdomain hub empty state', () => {
  function makeCryptoDomainForI18n() {
    return {
      id: 'dom-crypto',
      name: 'Crypto',
      slug: 'crypto',
      subdomain: 'crypto',
      description: 'Blockchain and crypto events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
  }

  test('subdomain hub empty state heading is localized in German', async ({ page }) => {
    setupMockApi(page, { domains: [makeCryptoDomainForI18n()], events: [] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.locator('.subdomain-empty-state h2')).toContainText('Keine bevorstehenden Veranstaltungen im Crypto-Hub')
    await expect(page.locator('.subdomain-empty-state')).toContainText('Community-Hub')
  })

  test('subdomain hub empty state heading is localized in Slovak', async ({ page }) => {
    setupMockApi(page, { domains: [makeCryptoDomainForI18n()], events: [] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.locator('.subdomain-empty-state h2')).toContainText('V hube Crypto zatiaľ nie sú žiadne nadchádzajúce podujatia')
  })

  test('subdomain hub empty state "View full hub page" is localized in German', async ({
    page,
  }) => {
    setupMockApi(page, { domains: [makeCryptoDomainForI18n()], events: [] })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(
      page.locator('.subdomain-empty-state').getByRole('link', { name: 'Zur Hub-Seite' }),
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Localized hub manage scheduled featured events section
// ---------------------------------------------------------------------------

test.describe('Localized hub manage scheduled featured events section', () => {
  function makeActiveSfe(
    domainId: string,
    eventId: string,
  ): MockScheduledFeaturedEvent {
    const now = Date.now()
    return {
      id: `sfe-i18n-${now}`,
      domainId,
      eventId,
      startsAtUtc: new Date(now - 3_600_000).toISOString(),
      endsAtUtc: new Date(now + 86_400_000).toISOString(),
      priority: 0,
      isEnabled: true,
      displayLabel: null,
      createdAtUtc: new Date(now).toISOString(),
      createdByUserId: null,
    }
  }

  test('Scheduled Featured Events section heading is localized in Slovak', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ domainId: domain.id })
    await seedAuthAndLocale(page, admin, 'sk')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [makeActiveSfe(domain.id, event.id)],
    })

    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Naplánované featured podujatia' })).toBeVisible()
  })

  test('Scheduled Featured Events section heading is localized in German', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ domainId: domain.id })
    await seedAuthAndLocale(page, admin, 'de')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [makeActiveSfe(domain.id, event.id)],
    })

    await page.goto('/hub/technology/manage')

    await expect(page.getByRole('heading', { name: 'Geplante Featured-Events' })).toBeVisible()
  })

  test('active status badge is localized in Slovak', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ domainId: domain.id })
    await seedAuthAndLocale(page, admin, 'sk')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [makeActiveSfe(domain.id, event.id)],
    })

    await page.goto('/hub/technology/manage')

    await expect(page.locator('.hub-schedule-status-badge--active')).toContainText('Aktívne')
  })

  test('active status badge is localized in German', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    const event = makeApprovedEvent({ domainId: domain.id })
    await seedAuthAndLocale(page, admin, 'de')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      events: [event],
      scheduledFeaturedEvents: [makeActiveSfe(domain.id, event.id)],
    })

    await page.goto('/hub/technology/manage')

    await expect(page.locator('.hub-schedule-status-badge--active')).toContainText('Aktiv')
  })

  test('empty state message is localized in Slovak', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    await seedAuthAndLocale(page, admin, 'sk')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      scheduledFeaturedEvents: [],
    })

    await page.goto('/hub/technology/manage')

    await expect(
      page.locator('.hub-schedule-list').getByText('Žiadne naplánované zvýraznenia.'),
    ).toBeVisible()
  })

  test('empty state message is localized in German', async ({ page }) => {
    const admin = makeAdminUser()
    const domain = makeTechDomain()
    await seedAuthAndLocale(page, admin, 'de')
    setupMockApi(page, {
      users: [admin],
      domains: [domain],
      scheduledFeaturedEvents: [],
    })

    await page.goto('/hub/technology/manage')

    await expect(
      page.locator('.hub-schedule-list').getByText('Noch keine geplanten Highlights.'),
    ).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Localized domain context hint (HomeView discovery)
// ---------------------------------------------------------------------------

test.describe('Localized domain context hint', () => {
  function makeCryptoDomainForHint() {
    const domain = {
      id: 'dom-crypto',
      name: 'Crypto',
      slug: 'crypto',
      subdomain: 'crypto',
      description: 'Blockchain and crypto events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
    const domainRef = { id: domain.id, name: domain.name, slug: domain.slug, subdomain: domain.subdomain }
    return { domain, domainRef }
  }

  test('domain context hint CTA is localized in German', async ({ page }) => {
    const { domain: cryptoDomain, domainRef } = makeCryptoDomainForHint()
    setupMockApi(page, {
      domains: [makeTechDomain(), cryptoDomain],
      events: [
        makeApprovedEvent({
          id: 'e-crypto',
          name: 'Blockchain Meetup',
          slug: 'blockchain-meetup',
          domain: domainRef,
          domainId: cryptoDomain.id,
        }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/?q=crypto')

    await expect(page.locator('.domain-context-hint')).toBeVisible()
    await expect(page.locator('.domain-context-hint')).toContainText('Crypto-Veranstaltungen')
    await expect(page.locator('.domain-context-hint-link')).toContainText('erkunden')
  })

  test('domain context hint CTA is localized in Slovak', async ({ page }) => {
    const { domain: cryptoDomain, domainRef } = makeCryptoDomainForHint()
    setupMockApi(page, {
      domains: [makeTechDomain(), cryptoDomain],
      events: [
        makeApprovedEvent({
          id: 'e-crypto',
          name: 'Blockchain Meetup',
          slug: 'blockchain-meetup',
          domain: domainRef,
          domainId: cryptoDomain.id,
        }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/?q=crypto')

    await expect(page.locator('.domain-context-hint')).toBeVisible()
    await expect(page.locator('.domain-context-hint')).toContainText('Crypto')
    await expect(page.locator('.domain-context-hint-link')).toContainText('Preskúmať hub Crypto')
  })
})

// ---------------------------------------------------------------------------
// Localized results context summary
// ---------------------------------------------------------------------------

test.describe('Localized results context summary', () => {
  test('results summary is localized in German when active filter is applied', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-de-online', name: 'Online Event DE', slug: 'online-event-de', attendanceMode: 'ONLINE' }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/?mode=online')

    // German: "1 Veranstaltung passend zu Modus: Online"
    const summary = page.locator('.results-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('1 Veranstaltung passend zu')
    await expect(summary).toContainText('Modus: Online')
  })

  test('results available count is localized in German when no filters active', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-de-1', name: 'Event Alpha DE', slug: 'event-alpha-de' }),
        makeApprovedEvent({ id: 'e-de-2', name: 'Event Beta DE', slug: 'event-beta-de' }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/')

    // German: "2 Veranstaltungen verfügbar"
    const summary = page.locator('.results-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('2 Veranstaltungen verfügbar')
  })

  test('all-in-past notice is localized in German', async ({ page }) => {
    const pastDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-past-de', name: 'Past Event DE', slug: 'past-event-de', startsAtUtc: pastDate, endsAtUtc: pastDate }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'de')
    })

    await page.goto('/')

    await expect(page.locator('.all-in-past-notice')).toBeVisible()
    await expect(page.locator('.all-in-past-notice')).toContainText(
      'Alle aufgeführten Veranstaltungen haben bereits stattgefunden.',
    )
  })

  test('all-in-past notice is localized in Slovak', async ({ page }) => {
    const pastDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-past-sk', name: 'Past Event SK', slug: 'past-event-sk', startsAtUtc: pastDate, endsAtUtc: pastDate }),
      ],
    })

    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })

    await page.goto('/')

    await expect(page.locator('.all-in-past-notice')).toBeVisible()
    await expect(page.locator('.all-in-past-notice')).toContainText(
      'Všetky uvedené udalosti sa už uskutočnili.',
    )
  })
})
