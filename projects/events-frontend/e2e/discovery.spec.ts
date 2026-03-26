/**
 * Advanced event discovery tests.
 *
 * Covers: price filter, sort order, multi-filter, error state,
 * URL direct navigation, and result-count display.
 */
import { expect, test } from '@playwright/test'
import { makeAdminUser, makeApprovedEvent, makeTechDomain, setupMockApi } from './helpers/mock-api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCryptoDomain() {
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

function makeAiDomain() {
  return {
    id: 'dom-ai',
    name: 'AI',
    slug: 'ai',
    subdomain: 'ai',
    description: 'Artificial intelligence events',
    isActive: true,
    createdAtUtc: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Price filter
// ---------------------------------------------------------------------------

test.describe('Price filter', () => {
  test('FREE filter shows only free events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-free', name: 'Free Meetup', slug: 'free-meetup', isFree: true, priceAmount: 0 }),
        makeApprovedEvent({
          id: 'e-paid',
          name: 'Paid Conference',
          slug: 'paid-conference',
          isFree: false,
          priceAmount: 99,
        }),
      ],
    })
    await page.goto('/?price=free')

    await expect(page.locator('.event-card', { hasText: 'Free Meetup' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeHidden()
    // Filter chip must be visible
    await expect(page.locator('.filter-chip', { hasText: 'Price: Free' })).toBeVisible()
  })

  test('PAID filter shows only paid events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-free', name: 'Free Meetup', slug: 'free-meetup', isFree: true, priceAmount: 0 }),
        makeApprovedEvent({
          id: 'e-paid',
          name: 'Paid Conference',
          slug: 'paid-conference',
          isFree: false,
          priceAmount: 99,
        }),
      ],
    })
    await page.goto('/?price=paid')

    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Free Meetup' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: 'Price: Paid' })).toBeVisible()
  })

  test('removing price filter chip restores both events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-free', name: 'Free Meetup', slug: 'free-meetup', isFree: true, priceAmount: 0 }),
        makeApprovedEvent({
          id: 'e-paid',
          name: 'Paid Conference',
          slug: 'paid-conference',
          isFree: false,
          priceAmount: 99,
        }),
      ],
    })
    await page.goto('/?price=free')

    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeHidden()

    // Click the chip's × to remove it
    await page.locator('.filter-chip', { hasText: 'Price: Free' }).click()

    await expect(page.locator('.event-card', { hasText: 'Free Meetup' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Sort order
// ---------------------------------------------------------------------------

test.describe('Sort order', () => {
  test('NEWEST sort shows most-recently-submitted event first', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-old',
          name: 'Older Summit',
          slug: 'older-summit',
          submittedAtUtc: '2026-01-01T10:00:00Z',
          startsAtUtc: '2026-05-01T10:00:00Z',
        }),
        makeApprovedEvent({
          id: 'e-new',
          name: 'Newer Summit',
          slug: 'newer-summit',
          submittedAtUtc: '2026-03-01T10:00:00Z',
          startsAtUtc: '2026-06-01T10:00:00Z',
        }),
      ],
    })
    await page.goto('/?sort=newest')

    const cards = page.locator('.event-card')
    await expect(cards.first()).toContainText('Newer Summit')
    await expect(cards.nth(1)).toContainText('Older Summit')

    // Sort chip shows
    await expect(page.locator('.filter-chip', { hasText: /sort/i })).toBeVisible()
  })

  test('UPCOMING (default) sort shows earliest-starting event first', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-late',
          name: 'Late Summit',
          slug: 'late-summit',
          startsAtUtc: '2027-01-01T10:00:00Z',
        }),
        makeApprovedEvent({
          id: 'e-early',
          name: 'Early Summit',
          slug: 'early-summit',
          startsAtUtc: '2026-05-01T10:00:00Z',
        }),
      ],
    })
    await page.goto('/')

    const cards = page.locator('.event-card')
    await expect(cards.first()).toContainText('Early Summit')
    await expect(cards.nth(1)).toContainText('Late Summit')
  })
})

// ---------------------------------------------------------------------------
// Multi-filter combination
// ---------------------------------------------------------------------------

test.describe('Multi-filter combination', () => {
  test('applying keyword + location + domain simultaneously narrows results', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain(), makeAiDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-tech-prague',
          name: 'Prague Tech Summit',
          slug: 'prague-tech-summit',
          city: 'Prague',
          venueName: 'Tech Hall Prague',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology' },
          domainId: 'dom-tech',
        }),
        makeApprovedEvent({
          id: 'e-crypto-prague',
          name: 'Prague Crypto Event',
          slug: 'prague-crypto-event',
          city: 'Prague',
          venueName: 'Crypto Hall Prague',
          domain: { id: 'dom-crypto', name: 'Crypto', slug: 'crypto' },
          domainId: 'dom-crypto',
        }),
        makeApprovedEvent({
          id: 'e-ai-berlin',
          name: 'Berlin AI Summit',
          slug: 'berlin-ai-summit',
          city: 'Berlin',
          venueName: 'AI Hub Berlin',
          domain: { id: 'dom-ai', name: 'AI', slug: 'ai' },
          domainId: 'dom-ai',
        }),
      ],
    })

    // Navigate with multiple filters pre-applied via URL
    await page.goto('/?q=summit&location=prague&domain=technology')

    await expect(page.locator('.event-card', { hasText: 'Prague Tech Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Prague Crypto Event' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'Berlin AI Summit' })).toBeHidden()

    // Three filter chips visible
    await expect(page.locator('.filter-chip', { hasText: /keyword/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /location/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /tag/i })).toBeVisible()
  })

  test('clearing all filters with active keyword + location restores full list', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Prague Tech Summit', slug: 'prague-tech-summit', city: 'Prague' }),
        makeApprovedEvent({ id: 'e-2', name: 'Brno Crypto Meetup', slug: 'brno-crypto-meetup', city: 'Brno' }),
      ],
    })
    await page.goto('/?q=summit&location=prague')

    await expect(page.locator('.event-card', { hasText: 'Brno Crypto Meetup' })).toBeHidden()

    await page.getByRole('button', { name: 'Clear all' }).click()

    await expect(page.locator('.event-card', { hasText: 'Prague Tech Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Brno Crypto Meetup' })).toBeVisible()
    // No chips remain
    await expect(page.locator('.filter-chip')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// Keyword search — domain name and organizer matching
// ---------------------------------------------------------------------------

test.describe('Keyword search — tag name and organizer matching', () => {
  test('keyword matching the domain name surfaces events tagged with that domain', async ({
    page,
  }) => {
    const cryptoDomain = makeCryptoDomain() // name: 'Crypto'
    setupMockApi(page, {
      domains: [makeTechDomain(), cryptoDomain],
      events: [
        makeApprovedEvent({
          id: 'e-crypto',
          name: 'Monthly Meetup',
          slug: 'monthly-meetup',
          description: 'A regular gathering.',
          domain: { id: cryptoDomain.id, name: cryptoDomain.name, slug: cryptoDomain.slug, subdomain: cryptoDomain.subdomain },
          domainId: cryptoDomain.id,
        }),
        makeApprovedEvent({
          id: 'e-tech',
          name: 'Tech Workshop',
          slug: 'tech-workshop',
          description: 'Hands-on coding.',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology', subdomain: 'tech' },
          domainId: 'dom-tech',
        }),
      ],
    })

    // Searching for "crypto" should surface "Monthly Meetup" via domain name match
    await page.goto('/?q=crypto')

    await expect(page.locator('.event-card', { hasText: 'Monthly Meetup' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Tech Workshop' })).toBeHidden()
  })

  test('keyword matching organizer display name surfaces their events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-alice-1',
          name: 'Prague Summit',
          slug: 'prague-summit',
          submittedBy: { displayName: 'Alice Wonderland' },
        }),
        makeApprovedEvent({
          id: 'e-alice-2',
          name: 'Vienna Workshop',
          slug: 'vienna-workshop',
          submittedBy: { displayName: 'Alice Wonderland' },
        }),
        makeApprovedEvent({
          id: 'e-bob',
          name: 'Berlin Conference',
          slug: 'berlin-conference',
          submittedBy: { displayName: 'Bob Builder' },
        }),
      ],
    })

    await page.goto('/?q=alice')

    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Vienna Workshop' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Berlin Conference' })).toBeHidden()
  })

  test('domain chip label shows human-readable domain name not raw slug', async ({ page }) => {
    const cryptoDomain = makeCryptoDomain() // name: 'Crypto', slug: 'crypto'
    setupMockApi(page, {
      domains: [makeTechDomain(), cryptoDomain],
      events: [
        makeApprovedEvent({
          id: 'e-crypto',
          name: 'Blockchain Summit',
          slug: 'blockchain-summit',
          domain: { id: cryptoDomain.id, name: cryptoDomain.name, slug: cryptoDomain.slug, subdomain: cryptoDomain.subdomain },
          domainId: cryptoDomain.id,
        }),
      ],
    })

    await page.goto('/?domain=crypto')

    // The chip should show the human-readable domain name, not the raw slug
    await expect(page.locator('.filter-chip', { hasText: 'Tag: Crypto' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

test.describe('Error state', () => {
  test('shows error message and retry button when discovery API fails', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })

    // Override DiscoveryEvents to return a GraphQL error; let other requests
    // fall through to the setupMockApi handler (Playwright uses LIFO order).
    page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      if ((body.query || '').includes('DiscoveryEvents')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Service unavailable' }] }),
        })
        return
      }
      await route.fallback()
    })

    await page.goto('/')

    await expect(page.locator('.error-state')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// URL direct navigation (filter state preserved on reload)
// ---------------------------------------------------------------------------

test.describe('URL-persisted filter state', () => {
  test('navigating directly to a filtered URL pre-populates all filter controls', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-prague',
          name: 'Prague Summit',
          slug: 'prague-summit',
          city: 'Prague',
          isFree: false,
          priceAmount: 49,
          startsAtUtc: '2026-06-01T10:00:00Z',
        }),
      ],
    })

    await page.goto('/?q=summit&location=Prague&from=2026-01-01&to=2026-12-31&price=paid&sort=newest')

    await expect(page.getByLabel('Keyword')).toHaveValue('summit')
    await expect(page.getByLabel('Location')).toHaveValue('Prague')
    await expect(page.getByLabel('From')).toHaveValue('2026-01-01')
    await expect(page.getByLabel('To')).toHaveValue('2026-12-31')
    await expect(page.getByLabel('Price', { exact: true })).toHaveValue('PAID')
    await expect(page.getByLabel('Sort by')).toHaveValue('NEWEST')
  })

  test('filter changes update the URL query string', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Prague Summit', slug: 'prague-summit', city: 'Prague' })],
    })
    await page.goto('/')

    // Expand advanced filters
    await page.getByRole('button', { name: 'More filters' }).click()

    await page.getByLabel('Location').fill('Prague')
    // Wait for debounce and URL update
    await expect(page).toHaveURL(/location=Prague/, { timeout: 2000 })
  })

  test('reloading the page with filters in URL restores the correct results', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-prague', name: 'Prague Summit', slug: 'prague-summit', city: 'Prague' }),
        makeApprovedEvent({ id: 'e-brno', name: 'Brno Meetup', slug: 'brno-meetup', city: 'Brno' }),
      ],
    })

    await page.goto('/?location=Prague')

    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Brno Meetup' })).toBeHidden()
    // Filter input reflects the URL value
    await expect(page.getByLabel('Location')).toHaveValue('Prague')
  })

  test('browser back/forward navigation restores filter state correctly', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-free', name: 'Free Meetup', slug: 'free-meetup', isFree: true, priceAmount: 0 }),
        makeApprovedEvent({
          id: 'e-paid',
          name: 'Paid Conference',
          slug: 'paid-conference',
          isFree: false,
          priceAmount: 99,
        }),
      ],
    })

    // Start on unfiltered home page — both events visible
    await page.goto('/')
    await expect(page.locator('.event-card', { hasText: 'Free Meetup' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeVisible()

    // Navigate to a filtered URL (free only)
    await page.goto('/?price=free')
    await expect(page.locator('.event-card', { hasText: 'Free Meetup' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: 'Price: Free' })).toBeVisible()

    // Go back — both events should be visible again (no price filter)
    await page.goBack()
    await expect(page).not.toHaveURL(/price=/)
    await expect(page.locator('.event-card', { hasText: 'Free Meetup' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeVisible()
    await expect(page.locator('.filter-chip')).toHaveCount(0)

    // Go forward — filter is restored
    await page.goForward()
    await expect(page).toHaveURL(/price=free/)
    await expect(page.locator('.event-card', { hasText: 'Free Meetup' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Paid Conference' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: 'Price: Free' })).toBeVisible()
  })

  test('navigating to event detail and back preserves the active filter', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-prague', name: 'Prague Summit', slug: 'prague-summit', city: 'Prague' }),
        makeApprovedEvent({ id: 'e-brno', name: 'Brno Meetup', slug: 'brno-meetup', city: 'Brno' }),
      ],
    })

    // Navigate to filtered list
    await page.goto('/?location=Prague')
    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Brno Meetup' })).toBeHidden()

    // Click through to event detail
    await page.locator('.event-card', { hasText: 'Prague Summit' }).getByRole('link', { name: 'View details' }).click()
    await expect(page).toHaveURL(/\/event\/prague-summit$/)

    // Go back — filtered list should be restored
    await page.goBack()
    await expect(page).toHaveURL(/location=Prague/)
    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Brno Meetup' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: /location/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Result count display
// ---------------------------------------------------------------------------

test.describe('Result count display', () => {
  test('hero shows correct matching event count', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e1', name: 'Event A', slug: 'event-a' }),
        makeApprovedEvent({ id: 'e2', name: 'Event B', slug: 'event-b' }),
        makeApprovedEvent({ id: 'e3', name: 'Event C', slug: 'event-c' }),
      ],
    })
    await page.goto('/')

    // Hero stat should show 3
    const statNum = page.locator('.hero-stat-num')
    await expect(statNum).toContainText('3')
  })

  test('result count drops to 0 after applying a non-matching filter', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Prague Summit', slug: 'prague-summit' })],
    })
    await page.goto('/')

    await expect(page.locator('.hero-stat-num')).toContainText('1')

    await page.getByLabel('Keyword').fill('no-match-xyz-unique')
    await expect(page.locator('.hero-stat-num')).toContainText('0', { timeout: 2000 })
  })
})

// ---------------------------------------------------------------------------
// Domain filter
// ---------------------------------------------------------------------------

test.describe('Domain filter', () => {
  test('domain filter shows only events from selected domain', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-tech',
          name: 'Tech Event',
          slug: 'tech-event',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology' },
          domainId: 'dom-tech',
        }),
        makeApprovedEvent({
          id: 'e-crypto',
          name: 'Crypto Event',
          slug: 'crypto-event',
          domain: { id: 'dom-crypto', name: 'Crypto', slug: 'crypto' },
          domainId: 'dom-crypto',
        }),
      ],
    })
    await page.goto('/?domain=technology')

    await expect(page.locator('.event-card', { hasText: 'Tech Event' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Crypto Event' })).toBeHidden()
  })

  test('subdomain page shows a visible link back to the main all-events page', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-tech',
          name: 'Tech Event',
          slug: 'tech-event',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology', subdomain: 'tech' },
          domainId: 'dom-tech',
        }),
        makeApprovedEvent({
          id: 'e-crypto',
          name: 'Crypto Event',
          slug: 'crypto-event',
          domain: { id: 'dom-crypto', name: 'Crypto', slug: 'crypto', subdomain: 'crypto' },
          domainId: 'dom-crypto',
        }),
      ],
    })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.getByRole('heading', { name: 'Crypto Events' })).toBeVisible()
    const allEventsLink = page.getByRole('link', { name: 'All events on events.localhost' })
    await expect(allEventsLink).toBeVisible()

    await allEventsLink.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover Events')
  })

  test('subdomain hub shows "View full hub page" link to /category/:slug', async ({ page }) => {
    const domain = { ...makeCryptoDomain(), primaryColor: '#e44d26' }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.getByRole('heading', { name: 'Crypto Events' })).toBeVisible()
    const hubLink = page.getByRole('link', { name: 'View full hub page' })
    await expect(hubLink).toBeVisible()
    await expect(hubLink).toHaveAttribute('href', '/category/crypto')
  })

  test('subdomain hub shows logo when configured', async ({ page }) => {
    const domain = {
      ...makeCryptoDomain(),
      logoUrl: 'https://example.com/crypto-logo.png',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/?subdomain=crypto&domain=crypto')

    const logo = page.locator('.subdomain-logo')
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', 'https://example.com/crypto-logo.png')
    await expect(logo).toHaveAttribute('alt', 'Crypto')
  })

  test('subdomain hub shows banner when configured', async ({ page }) => {
    const domain = {
      ...makeCryptoDomain(),
      bannerUrl: 'https://example.com/crypto-banner.jpg',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/?subdomain=crypto&domain=crypto')

    const banner = page.locator('.subdomain-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('src', 'https://example.com/crypto-banner.jpg')
  })

  test('subdomain hub shows curator credit when configured', async ({ page }) => {
    const domain = {
      ...makeCryptoDomain(),
      curatorCredit: 'Prague Blockchain Community',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.locator('.subdomain-curator-credit')).toContainText(
      'Prague Blockchain Community',
    )
  })

  test('subdomain hub shows overview snippet when configured', async ({ page }) => {
    const domain = {
      ...makeCryptoDomain(),
      overviewContent: 'The premier destination for crypto and blockchain events in Central Europe.',
    }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.locator('.subdomain-overview-snippet')).toContainText(
      'The premier destination for crypto',
    )
  })

  test('subdomain hub applies primary color as CSS custom property', async ({ page }) => {
    const domain = { ...makeCryptoDomain(), primaryColor: '#e44d26' }
    setupMockApi(page, { domains: [domain], events: [] })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.locator('.subdomain-header')).toHaveAttribute(
      'style',
      /--subdomain-color:\s*#e44d26/,
    )
  })

  test('subdomain hub: mobile viewport shows heading and CTA link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const domain = {
      ...makeCryptoDomain(),
      logoUrl: 'https://example.com/crypto-logo.png',
      curatorCredit: 'Crypto Curators',
    }
    setupMockApi(page, {
      domains: [domain],
      events: [
        makeApprovedEvent({
          name: 'Mobile Crypto Event',
          domainId: 'dom-crypto',
          domain: { id: 'dom-crypto', name: 'Crypto', slug: 'crypto', subdomain: 'crypto' },
        }),
      ],
    })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.getByRole('heading', { name: 'Crypto Events' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'View full hub page' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Crypto Event' })).toBeVisible()
  })

  test('i18n: subdomain hub shows localized "View full hub page" in Slovak', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('app_locale', 'sk')
    })
    setupMockApi(page, { domains: [makeCryptoDomain()], events: [] })

    await page.goto('/?subdomain=crypto&domain=crypto')

    await expect(page.getByRole('link', { name: 'Zobraziť celú stránku hubu' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Attendance mode filter
// ---------------------------------------------------------------------------

test.describe('Attendance mode filter', () => {
  test('IN_PERSON filter shows only in-person events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-in-person',
          name: 'In-Person Workshop',
          slug: 'in-person-workshop',
          attendanceMode: 'IN_PERSON',
        }),
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Webinar',
          slug: 'online-webinar',
          attendanceMode: 'ONLINE',
        }),
        makeApprovedEvent({
          id: 'e-hybrid',
          name: 'Hybrid Conference',
          slug: 'hybrid-conference',
          attendanceMode: 'HYBRID',
        }),
      ],
    })
    await page.goto('/?mode=in-person')

    await expect(page.locator('.event-card', { hasText: 'In-Person Workshop' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Online Webinar' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'Hybrid Conference' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: /mode/i })).toBeVisible()
  })

  test('ONLINE filter shows only online events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-in-person',
          name: 'In-Person Workshop',
          slug: 'in-person-workshop',
          attendanceMode: 'IN_PERSON',
        }),
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Webinar',
          slug: 'online-webinar',
          attendanceMode: 'ONLINE',
        }),
      ],
    })
    await page.goto('/?mode=online')

    await expect(page.locator('.event-card', { hasText: 'Online Webinar' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'In-Person Workshop' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: /mode/i })).toBeVisible()
  })

  test('HYBRID filter shows only hybrid events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-in-person',
          name: 'In-Person Workshop',
          slug: 'in-person-workshop',
          attendanceMode: 'IN_PERSON',
        }),
        makeApprovedEvent({
          id: 'e-hybrid',
          name: 'Hybrid Summit',
          slug: 'hybrid-summit',
          attendanceMode: 'HYBRID',
        }),
      ],
    })
    await page.goto('/?mode=hybrid')

    await expect(page.locator('.event-card', { hasText: 'Hybrid Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'In-Person Workshop' })).toBeHidden()
  })

  test('attendance mode chip is restored from URL on reload', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Webinar',
          slug: 'online-webinar',
          attendanceMode: 'ONLINE',
        }),
      ],
    })
    await page.goto('/?mode=online')

    // The Mode select should reflect the URL param
    await expect(page.locator('select#filter-attendance-mode')).toHaveValue('ONLINE')
    await expect(page.locator('.event-card', { hasText: 'Online Webinar' })).toBeVisible()
  })

  test('removing attendance mode chip restores all events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-in-person',
          name: 'In-Person Workshop',
          slug: 'in-person-workshop',
          attendanceMode: 'IN_PERSON',
        }),
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Webinar',
          slug: 'online-webinar',
          attendanceMode: 'ONLINE',
        }),
      ],
    })
    await page.goto('/?mode=online')

    await expect(page.locator('.event-card', { hasText: 'In-Person Workshop' })).toBeHidden()

    // Click the mode chip to remove the filter
    await page.locator('.filter-chip', { hasText: /mode/i }).click()

    await expect(page.locator('.event-card', { hasText: 'In-Person Workshop' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Online Webinar' })).toBeVisible()
  })

  test('event card displays attendance mode badge', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Webinar',
          slug: 'online-webinar',
          attendanceMode: 'ONLINE',
        }),
      ],
    })
    await page.goto('/')

    await expect(page.locator('.event-card', { hasText: 'Online Webinar' }).locator('.badge-mode')).toContainText('Online')
  })

  test('mode filter changes update the URL query string', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-hybrid',
          name: 'Hybrid Event',
          slug: 'hybrid-event',
          attendanceMode: 'HYBRID',
        }),
      ],
    })
    await page.goto('/')

    // Expand advanced filters to access mode select
    await page.getByRole('button', { name: 'More filters' }).click()

    await page.locator('select#filter-attendance-mode').selectOption('HYBRID')
    await expect(page).toHaveURL(/mode=hybrid/, { timeout: 2000 })
  })
})

// ---------------------------------------------------------------------------
// Mobile viewport discovery
// ---------------------------------------------------------------------------

test.describe('Mobile viewport discovery', () => {
  test('attendance mode filter control is visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-in-person',
          name: 'In-Person Workshop',
          slug: 'in-person-workshop',
          attendanceMode: 'IN_PERSON',
        }),
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Webinar',
          slug: 'online-webinar',
          attendanceMode: 'ONLINE',
        }),
      ],
    })
    await page.goto('/')

    // Expand advanced filters
    await page.getByRole('button', { name: 'More filters' }).click()

    // Mode select should be visible at mobile width
    await expect(page.locator('select#filter-attendance-mode')).toBeVisible()
  })

  test('attendance mode filter works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-in-person',
          name: 'In-Person Workshop',
          slug: 'in-person-workshop',
          attendanceMode: 'IN_PERSON',
        }),
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Webinar',
          slug: 'online-webinar',
          attendanceMode: 'ONLINE',
        }),
      ],
    })
    await page.goto('/?mode=online')

    await expect(page.locator('.event-card', { hasText: 'Online Webinar' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'In-Person Workshop' })).toBeHidden()
  })

  test('event cards show attendance mode badge on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-hybrid',
          name: 'Hybrid Conference',
          slug: 'hybrid-conference',
          attendanceMode: 'HYBRID',
        }),
      ],
    })
    await page.goto('/')

    await expect(
      page.locator('.event-card', { hasText: 'Hybrid Conference' }).locator('.badge-mode'),
    ).toContainText('Hybrid')
  })

  test('saved search with attendance mode rehydrates filter correctly', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      currentUserId: admin.id,
      currentToken: `token-${admin.id}`,
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-online',
          name: 'Online Workshop',
          slug: 'online-workshop',
          attendanceMode: 'ONLINE',
        }),
        makeApprovedEvent({
          id: 'e-inperson',
          name: 'In-Person Meetup',
          slug: 'in-person-meetup',
          attendanceMode: 'IN_PERSON',
        }),
      ],
    })

    await page.addInitScript(
      ({ token }) => {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_expires', new Date(Date.now() + 60 * 60 * 1000).toISOString())
      },
      { token: `token-${admin.id}` },
    )

    // Navigate with mode=online filter active
    await page.goto('/?mode=online')
    await expect(page.locator('.event-card', { hasText: 'Online Workshop' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'In-Person Meetup' })).toBeHidden()

    // Expand advanced filters to access saved search form
    await page.getByRole('button', { name: 'More filters' }).click()

    // Save the search
    await page.getByLabel('Preset name').fill('Online Events')
    await page.getByRole('button', { name: 'Save current search' }).click()
    const savedSearchButton = page.locator('.saved-search-apply', { hasText: 'Online Events' })
    await expect(savedSearchButton).toBeVisible()

    // Clear all filters — both events should be visible
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page.locator('.event-card', { hasText: 'In-Person Meetup' })).toBeVisible()

    // Apply the saved search — URL should restore ?mode=online and filter should re-activate
    await savedSearchButton.click()
    await expect(page).toHaveURL(/mode=online/)
    await expect(page.locator('.event-card', { hasText: 'Online Workshop' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'In-Person Meetup' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: 'Mode: Online' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Date range filter
// ---------------------------------------------------------------------------

test.describe('Date range filter', () => {
  test('from-date filter hides events before the cutoff', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-early',
          name: 'Early Summit',
          slug: 'early-summit',
          startsAtUtc: '2026-03-01T10:00:00Z',
        }),
        makeApprovedEvent({
          id: 'e-late',
          name: 'Late Summit',
          slug: 'late-summit',
          startsAtUtc: '2026-09-01T10:00:00Z',
        }),
      ],
    })
    await page.goto('/?from=2026-06-01')

    await expect(page.locator('.event-card', { hasText: 'Late Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Early Summit' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: /from/i })).toBeVisible()
  })

  test('to-date filter hides events after the cutoff', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-early',
          name: 'Early Summit',
          slug: 'early-summit',
          startsAtUtc: '2026-03-01T10:00:00Z',
        }),
        makeApprovedEvent({
          id: 'e-late',
          name: 'Late Summit',
          slug: 'late-summit',
          startsAtUtc: '2026-09-01T10:00:00Z',
        }),
      ],
    })
    await page.goto('/?to=2026-05-01')

    await expect(page.locator('.event-card', { hasText: 'Early Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Late Summit' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: /to/i })).toBeVisible()
  })

  test('date range filter chip is restored from URL on reload', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Summer Conf', slug: 'summer-conf', startsAtUtc: '2026-07-15T10:00:00Z' }),
      ],
    })
    await page.goto('/?from=2026-06-01&to=2026-12-31')

    // Expand advanced filters to reveal date inputs
    await page.getByRole('button', { name: 'More filters' }).click()

    await expect(page.getByLabel('From')).toHaveValue('2026-06-01')
    await expect(page.getByLabel('To')).toHaveValue('2026-12-31')
    await expect(page.locator('.filter-chip', { hasText: /from/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /to/i })).toBeVisible()
  })

  test('removing date-from chip shows previously hidden events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-early',
          name: 'Early Summit',
          slug: 'early-summit',
          startsAtUtc: '2026-03-01T10:00:00Z',
        }),
        makeApprovedEvent({
          id: 'e-late',
          name: 'Late Summit',
          slug: 'late-summit',
          startsAtUtc: '2026-09-01T10:00:00Z',
        }),
      ],
    })
    await page.goto('/?from=2026-06-01')

    await expect(page.locator('.event-card', { hasText: 'Early Summit' })).toBeHidden()
    // Click the "From" chip to remove the filter
    await page.locator('.filter-chip', { hasText: /from/i }).click()

    await expect(page.locator('.event-card', { hasText: 'Early Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Late Summit' })).toBeVisible()
  })

  test('date range filter URL updates when filters are changed', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Summer Conf', slug: 'summer-conf', startsAtUtc: '2026-07-15T10:00:00Z' })],
    })
    await page.goto('/')

    await page.getByRole('button', { name: 'More filters' }).click()
    await page.getByLabel('From').fill('2026-06-01')

    await expect(page).toHaveURL(/from=2026-06-01/, { timeout: 2000 })
  })
})

// ---------------------------------------------------------------------------
// Price range (min/max) filter
// ---------------------------------------------------------------------------

test.describe('Price range filter', () => {
  test('min-price filter hides cheaper events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-cheap',
          name: 'Budget Talk',
          slug: 'budget-talk',
          isFree: false,
          priceAmount: 10,
        }),
        makeApprovedEvent({
          id: 'e-premium',
          name: 'Premium Summit',
          slug: 'premium-summit',
          isFree: false,
          priceAmount: 200,
        }),
      ],
    })
    await page.goto('/?minPrice=100')

    await expect(page.locator('.event-card', { hasText: 'Premium Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Budget Talk' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: /min price/i })).toBeVisible()
  })

  test('max-price filter hides more expensive events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-cheap',
          name: 'Budget Talk',
          slug: 'budget-talk',
          isFree: false,
          priceAmount: 10,
        }),
        makeApprovedEvent({
          id: 'e-premium',
          name: 'Premium Summit',
          slug: 'premium-summit',
          isFree: false,
          priceAmount: 200,
        }),
      ],
    })
    await page.goto('/?maxPrice=50')

    await expect(page.locator('.event-card', { hasText: 'Budget Talk' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Premium Summit' })).toBeHidden()
    await expect(page.locator('.filter-chip', { hasText: /max price/i })).toBeVisible()
  })

  test('min and max price together create a price window', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Cheap Talk', slug: 'cheap-talk', isFree: false, priceAmount: 5 }),
        makeApprovedEvent({
          id: 'e-2',
          name: 'Mid-Range Workshop',
          slug: 'mid-range-workshop',
          isFree: false,
          priceAmount: 75,
        }),
        makeApprovedEvent({
          id: 'e-3',
          name: 'Premium Conference',
          slug: 'premium-conference',
          isFree: false,
          priceAmount: 500,
        }),
      ],
    })
    await page.goto('/?minPrice=50&maxPrice=100')

    await expect(page.locator('.event-card', { hasText: 'Mid-Range Workshop' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Cheap Talk' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'Premium Conference' })).toBeHidden()
  })

  test('price range chips are restored from URL on reload', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ name: 'Mid-Range Workshop', slug: 'mid-range', isFree: false, priceAmount: 75 })],
    })
    await page.goto('/?minPrice=50&maxPrice=100')

    await expect(page.locator('.filter-chip', { hasText: /min price/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /max price/i })).toBeVisible()
  })

  test('removing min-price chip restores cheaper events', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-cheap', name: 'Budget Talk', slug: 'budget-talk', isFree: false, priceAmount: 10 }),
        makeApprovedEvent({
          id: 'e-premium',
          name: 'Premium Summit',
          slug: 'premium-summit',
          isFree: false,
          priceAmount: 200,
        }),
      ],
    })
    await page.goto('/?minPrice=100')

    await expect(page.locator('.event-card', { hasText: 'Budget Talk' })).toBeHidden()

    await page.locator('.filter-chip', { hasText: /min price/i }).click()

    await expect(page.locator('.event-card', { hasText: 'Budget Talk' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Premium Summit' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Results summary
// ---------------------------------------------------------------------------

test.describe('Results summary', () => {
  test('shows results summary with filter context when active filters are applied', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Prague Summit', slug: 'prague-summit', city: 'Prague' }),
        makeApprovedEvent({ id: 'e-2', name: 'Brno Meetup', slug: 'brno-meetup', city: 'Brno' }),
      ],
    })
    await page.goto('/?location=Prague')

    await expect(page.locator('.results-summary')).toContainText('1 event matching')
    await expect(page.locator('.results-summary')).toContainText('Location: Prague')
  })

  test('shows plain available count when no active filters', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Event A', slug: 'event-a' }),
        makeApprovedEvent({ id: 'e-2', name: 'Event B', slug: 'event-b' }),
      ],
    })
    await page.goto('/')

    await expect(page.locator('.results-summary')).toContainText('2 events available')
  })

  test('summary pluralises correctly for a single event', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Solo Event', slug: 'solo-event' })],
    })
    await page.goto('/')

    await expect(page.locator('.results-summary')).toContainText('1 event available')
  })
})

// ---------------------------------------------------------------------------
// Contextual empty-state guidance
// ---------------------------------------------------------------------------

test.describe('Contextual empty-state guidance', () => {
  test('single location filter shows city-specific hint', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Prague Event', slug: 'prague-event', city: 'Prague' })],
    })
    await page.goto('/?location=Berlin')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('"Berlin"')
    await expect(page.locator('.empty-state')).toContainText('location')
  })

  test('single keyword filter shows keyword-specific hint', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Prague Event', slug: 'prague-event' })],
    })
    await page.goto('/?q=nonexistent-xyz')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('"nonexistent-xyz"')
  })

  test('single attendance mode filter shows mode-specific hint', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'In-Person Only', slug: 'in-person-only', attendanceMode: 'IN_PERSON' }),
      ],
    })
    await page.goto('/?mode=online')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('online')
  })

  test('single timezone filter shows timezone-specific hint', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-1',
          name: 'Prague Event',
          slug: 'prague-event',
          timezone: 'Europe/Prague',
        }),
      ],
    })
    await page.goto('/?tz=America%2FNew_York')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('America/New_York')
    await expect(page.locator('.empty-state')).toContainText('timezone')
  })

  test('multiple active filters show the multi-filter removal hint', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Prague Summit', slug: 'prague-summit', city: 'Prague' })],
    })
    await page.goto('/?location=Berlin&mode=online')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('active filters')
  })
})

// ---------------------------------------------------------------------------
// Subdomain catalog + additional filtering
// ---------------------------------------------------------------------------

test.describe('Subdomain catalog + additional filtering', () => {
  test('subdomain page scopes events to domain and supports additional filters', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain(), makeCryptoDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-tech-online',
          name: 'Tech Online Summit',
          slug: 'tech-online-summit',
          attendanceMode: 'ONLINE',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology', subdomain: 'tech' },
          domainId: 'dom-tech',
        }),
        makeApprovedEvent({
          id: 'e-tech-in-person',
          name: 'Tech In-Person Workshop',
          slug: 'tech-in-person-workshop',
          attendanceMode: 'IN_PERSON',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology', subdomain: 'tech' },
          domainId: 'dom-tech',
        }),
        makeApprovedEvent({
          id: 'e-crypto-online',
          name: 'Crypto Online Meetup',
          slug: 'crypto-online-meetup',
          attendanceMode: 'ONLINE',
          domain: { id: 'dom-crypto', name: 'Crypto', slug: 'crypto', subdomain: 'crypto' },
          domainId: 'dom-crypto',
        }),
      ],
    })

    // Simulate tech subdomain view with an additional ONLINE filter
    await page.goto('/?subdomain=tech&domain=technology&mode=online')

    // Subdomain header visible
    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()

    // Only the tech+online event should show
    await expect(page.locator('.event-card', { hasText: 'Tech Online Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Tech In-Person Workshop' })).toBeHidden()
    // Crypto event is excluded even though it is online (domain scope preserved)
    await expect(page.locator('.event-card', { hasText: 'Crypto Online Meetup' })).toBeHidden()

    // Mode chip is visible for the additional filter
    await expect(page.locator('.filter-chip', { hasText: /mode/i })).toBeVisible()
    // "All events" link back to main site is present
    await expect(page.getByRole('link', { name: /All events on events\.localhost/i })).toBeVisible()
  })

  test('removing the additional filter in subdomain view still shows all domain events', async ({
    page,
  }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-tech-online',
          name: 'Tech Online Summit',
          slug: 'tech-online-summit',
          attendanceMode: 'ONLINE',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology', subdomain: 'tech' },
          domainId: 'dom-tech',
        }),
        makeApprovedEvent({
          id: 'e-tech-in-person',
          name: 'Tech In-Person Workshop',
          slug: 'tech-in-person-workshop',
          attendanceMode: 'IN_PERSON',
          domain: { id: 'dom-tech', name: 'Technology', slug: 'technology', subdomain: 'tech' },
          domainId: 'dom-tech',
        }),
      ],
    })

    await page.goto('/?subdomain=tech&domain=technology&mode=online')
    await expect(page.locator('.event-card', { hasText: 'Tech In-Person Workshop' })).toBeHidden()

    // Click the mode chip to remove just the mode filter
    await page.locator('.filter-chip', { hasText: /mode/i }).click()

    // Both tech events are now visible (domain scope still active via subdomain)
    await expect(page.locator('.event-card', { hasText: 'Tech Online Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Tech In-Person Workshop' })).toBeVisible()
    // Subdomain header should still be showing
    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Multi-filter saved search full restoration
// ---------------------------------------------------------------------------

test.describe('Multi-filter saved search full restoration', () => {
  test('saved search with keyword + location + mode + price + language + timezone fully restores all filters', async ({
    page,
  }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      currentUserId: admin.id,
      currentToken: `token-${admin.id}`,
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'e-match',
          name: 'Prague Free Online Summit',
          slug: 'prague-free-online-summit',
          city: 'Prague',
          isFree: true,
          priceAmount: 0,
          attendanceMode: 'ONLINE',
          language: 'de',
          timezone: 'Europe/Prague',
        }),
        makeApprovedEvent({
          id: 'e-no-match-1',
          name: 'Berlin Paid Conf',
          slug: 'berlin-paid-conf',
          city: 'Berlin',
          isFree: false,
          priceAmount: 100,
          attendanceMode: 'IN_PERSON',
          language: 'en',
          timezone: 'Europe/London',
        }),
        makeApprovedEvent({
          id: 'e-no-match-2',
          name: 'Prague Paid In-Person Event',
          slug: 'prague-paid-in-person',
          city: 'Prague',
          isFree: false,
          priceAmount: 50,
          attendanceMode: 'IN_PERSON',
          language: 'sk',
          timezone: 'Europe/Prague',
        }),
      ],
    })
    await page.addInitScript(
      ({ token }) => {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_expires', new Date(Date.now() + 60 * 60 * 1000).toISOString())
      },
      { token: `token-${admin.id}` },
    )

    // Navigate with all 6 filter types active
    await page.goto('/?q=summit&location=Prague&mode=online&price=free&lang=de&tz=Europe%2FPrague')

    // Only the matching event should be visible
    await expect(page.locator('.event-card', { hasText: 'Prague Free Online Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Berlin Paid Conf' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'Prague Paid In-Person Event' })).toBeHidden()

    // Expand advanced filters to access saved search form
    await page.getByRole('button', { name: 'More filters' }).click()

    // Verify all filter controls reflect the URL parameters
    await expect(page.getByLabel('Keyword')).toHaveValue('summit')
    await expect(page.getByLabel('Location')).toHaveValue('Prague')
    await expect(page.locator('select#filter-attendance-mode')).toHaveValue('ONLINE')
    await expect(page.getByLabel('Price', { exact: true })).toHaveValue('FREE')
    await expect(page.locator('#filter-language')).toHaveValue('de')
    await expect(page.locator('#filter-timezone')).toHaveValue('Europe/Prague')

    // Save the search
    await page.getByLabel('Preset name').fill('Prague Free Online Summit Search')
    await page.getByRole('button', { name: 'Save current search' }).click()
    const savedSearchButton = page.locator('.saved-search-apply', {
      hasText: 'Prague Free Online Summit Search',
    })
    await expect(savedSearchButton).toBeVisible()

    // Clear all filters — all events should now be visible
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page.locator('.event-card', { hasText: 'Berlin Paid Conf' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Prague Paid In-Person Event' })).toBeVisible()

    // Apply the saved search
    await savedSearchButton.click()

    // URL should be fully restored
    await expect(page).toHaveURL(/q=summit/)
    await expect(page).toHaveURL(/location=Prague/)
    await expect(page).toHaveURL(/mode=online/)
    await expect(page).toHaveURL(/price=free/)
    await expect(page).toHaveURL(/lang=de/)
    await expect(page).toHaveURL(/tz=Europe\/Prague/)

    // Results should be filtered correctly again
    await expect(page.locator('.event-card', { hasText: 'Prague Free Online Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Berlin Paid Conf' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'Prague Paid In-Person Event' })).toBeHidden()

    // All six filter chips should be visible
    await expect(page.locator('.filter-chip', { hasText: /keyword/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /location/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /mode/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /price/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /language/i })).toBeVisible()
    await expect(page.locator('.filter-chip', { hasText: /timezone/i })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Discovery analytics instrumentation
// ---------------------------------------------------------------------------

test.describe('Discovery analytics instrumentation', () => {
  /** Helper that waits for a TrackDiscoveryAction mutation with the given actionType. */
  function waitForDiscoveryAnalytics(page: import('@playwright/test').Page, actionType: string) {
    return page.waitForRequest(
      (req) => {
        if (!req.url().includes('graphql') || req.method() !== 'POST') return false
        try {
          const body = JSON.parse(req.postData() || '{}') as { query?: string; variables?: { input?: { actionType?: string } } }
          return (
            (body.query ?? '').includes('TrackDiscoveryAction') &&
            body.variables?.input?.actionType === actionType
          )
        } catch {
          return false
        }
      },
      { timeout: 4000 },
    )
  }

  test('RESULT_CLICK fires when an event card title link is clicked', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-click', name: 'Clickable Event', slug: 'clickable-event' }),
      ],
    })
    await page.goto('/')

    const analyticsRequest = waitForDiscoveryAnalytics(page, 'RESULT_CLICK')
    await page.locator('.event-card', { hasText: 'Clickable Event' }).getByRole('link', { name: 'View details' }).click()
    expect(await analyticsRequest).toBeDefined()
  })

  test('RESULT_CLICK fires even when active filters are applied', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-online', name: 'Online Workshop', slug: 'online-workshop', attendanceMode: 'ONLINE' }),
      ],
    })
    await page.goto('/?mode=online')

    const analyticsRequest = waitForDiscoveryAnalytics(page, 'RESULT_CLICK')
    await page.locator('.event-card', { hasText: 'Online Workshop' }).getByRole('link', { name: 'View details' }).click()
    expect(await analyticsRequest).toBeDefined()
  })

  test('SEARCH fires when keyword filter is typed', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Tech Summit', slug: 'tech-summit' }),
      ],
    })
    await page.goto('/')

    const analyticsRequest = waitForDiscoveryAnalytics(page, 'SEARCH')
    await page.getByLabel('Keyword').fill('summit')
    expect(await analyticsRequest).toBeDefined()
  })

  test('FILTER_CHANGE fires when attendance mode select is changed', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Online Webinar', slug: 'online-webinar', attendanceMode: 'ONLINE' }),
      ],
    })
    await page.goto('/')

    await page.getByRole('button', { name: 'More filters' }).click()

    const analyticsRequest = waitForDiscoveryAnalytics(page, 'FILTER_CHANGE')
    await page.locator('select#filter-attendance-mode').selectOption('ONLINE')
    expect(await analyticsRequest).toBeDefined()
  })

  test('FILTER_CLEAR fires when "Clear all" is clicked with active filters', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Prague Summit', slug: 'prague-summit', city: 'Prague' }),
        makeApprovedEvent({ id: 'e-2', name: 'Online Workshop', slug: 'online-workshop', attendanceMode: 'ONLINE' }),
      ],
    })
    await page.goto('/?mode=online')

    const analyticsRequest = waitForDiscoveryAnalytics(page, 'FILTER_CLEAR')
    await page.getByRole('button', { name: 'Clear all' }).click()
    expect(await analyticsRequest).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Category landing pages
// ---------------------------------------------------------------------------

test.describe('Category landing page', () => {
  test('shows domain name, description and event count on /category/:slug', async ({ page }) => {
    const cryptoDomain = {
      id: 'dom-crypto',
      name: 'Crypto',
      slug: 'crypto',
      subdomain: 'crypto',
      description: 'Blockchain and crypto events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [cryptoDomain],
      events: [
        makeApprovedEvent({
          id: 'e-crypto-1',
          name: 'Prague Crypto Summit',
          slug: 'prague-crypto-summit',
          domainId: cryptoDomain.id,
          domain: { id: cryptoDomain.id, name: cryptoDomain.name, slug: cryptoDomain.slug, subdomain: cryptoDomain.subdomain },
        }),
        makeApprovedEvent({
          id: 'e-crypto-2',
          name: 'Blockchain Dev Day',
          slug: 'blockchain-dev-day',
          domainId: cryptoDomain.id,
          domain: { id: cryptoDomain.id, name: cryptoDomain.name, slug: cryptoDomain.slug, subdomain: cryptoDomain.subdomain },
        }),
      ],
    })
    await page.goto('/category/crypto')

    await expect(page.getByRole('heading', { name: 'Crypto Events' })).toBeVisible()
    await expect(page.getByText('Blockchain and crypto events')).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Prague Crypto Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Blockchain Dev Day' })).toBeVisible()
  })

  test('shows breadcrumb with link back to all events', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    const breadcrumbLink = page.getByRole('link', { name: 'All Events' })
    await expect(breadcrumbLink).toBeVisible()
    await breadcrumbLink.click()
    await expect(page).toHaveURL('/')
  })

  test('shows not-found state when category slug does not match any domain', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [],
    })
    await page.goto('/category/nonexistent-slug')

    await expect(page.getByRole('heading', { name: 'Category not found' })).toBeVisible()
    await expect(page.getByText(/The category .nonexistent-slug./)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse All Events' })).toBeVisible()
  })

  test('shows empty state when category has no events', async ({ page }) => {
    const aiDomain = {
      id: 'dom-ai',
      name: 'AI',
      slug: 'ai',
      subdomain: 'ai',
      description: 'Artificial intelligence events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [aiDomain],
      events: [],
    })
    await page.goto('/category/ai')

    await expect(page.getByRole('heading', { name: 'No upcoming events' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse All Events' })).toBeVisible()
  })

  test('Filter & Explore link navigates to home with domain filter applied', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    const filterLink = page.getByRole('link', { name: 'Filter & Explore' })
    await expect(filterLink).toBeVisible()
    await filterLink.click()

    await expect(page).toHaveURL(/\/\?domain=technology/)
  })

  test('domain badge on event card links to the category page', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent({ name: 'Tech Summit', slug: 'tech-summit' })],
    })
    await page.goto('/')

    const domainBadge = page.locator('.event-card .domain-link', { hasText: 'Technology' })
    await expect(domainBadge).toBeVisible()
    await domainBadge.click()

    await expect(page).toHaveURL('/category/technology')
  })

  test('category page shows correct upcoming event count', async ({ page }) => {
    const techDomain = makeTechDomain()
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMockApi(page, {
      domains: [techDomain],
      events: [
        makeApprovedEvent({ id: 'e1', name: 'Event One', slug: 'event-one', startsAtUtc: futureDate }),
        makeApprovedEvent({ id: 'e2', name: 'Event Two', slug: 'event-two', startsAtUtc: futureDate }),
        makeApprovedEvent({ id: 'e3', name: 'Event Three', slug: 'event-three', startsAtUtc: futureDate }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.getByText('3 upcoming events')).toBeVisible()
  })

  test('category page is usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent({ name: 'Mobile Tech Event', slug: 'mobile-tech-event' })],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Tech Event' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Category landing page — additional coverage
// ---------------------------------------------------------------------------

test.describe('Category landing page — error and SEO', () => {
  test('shows error state with retry button when API fails for category page', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })

    // Override CategoryEvents to return a GraphQL error; other requests fall through.
    page.route('**/graphql', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      if ((body.query || '').includes('CategoryEvents')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ errors: [{ message: 'Service unavailable' }] }),
        })
        return
      }
      await route.fallback()
    })

    await page.goto('/category/technology')

    await expect(page.locator('.error-state')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('page title includes the domain name for SEO', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page).toHaveTitle(/Technology/)
  })

  test('event count shows singular label for exactly one upcoming event', async ({ page }) => {
    const techDomain = makeTechDomain()
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent({ id: 'e1', name: 'Solo Event', slug: 'solo-event', startsAtUtc: futureDate })],
    })
    await page.goto('/category/technology')

    await expect(page.getByText('1 upcoming event')).toBeVisible()
  })

  test('events found count shows singular for exactly one result', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [makeApprovedEvent({ name: 'Only One', slug: 'only-one' })],
    })
    await page.goto('/category/technology')

    await expect(page.getByText('1 event found')).toBeVisible()
  })

  test('events found count shows plural for multiple results', async ({ page }) => {
    const techDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [techDomain],
      events: [
        makeApprovedEvent({ id: 'e1', name: 'Event A', slug: 'event-a' }),
        makeApprovedEvent({ id: 'e2', name: 'Event B', slug: 'event-b' }),
      ],
    })
    await page.goto('/category/technology')

    await expect(page.getByText('2 events found')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Branded domain hub — branding element rendering
// ---------------------------------------------------------------------------

test.describe('Branded domain hub', () => {
  test('category page shows domain logo when logoUrl is set', async ({ page }) => {
    const brandedDomain = {
      ...makeTechDomain(),
      logoUrl: 'https://example.com/tech-logo.png',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    const logo = page.locator('.category-logo')
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('src', 'https://example.com/tech-logo.png')
    await expect(logo).toHaveAttribute('alt', 'Technology')
  })

  test('category page shows domain banner on desktop when bannerUrl is set', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const brandedDomain = {
      ...makeTechDomain(),
      bannerUrl: 'https://example.com/tech-banner.jpg',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    const banner = page.locator('.category-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('src', 'https://example.com/tech-banner.jpg')
    await expect(banner).toHaveAttribute('alt', 'Technology')
  })

  test('category page does not show banner on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const brandedDomain = {
      ...makeTechDomain(),
      bannerUrl: 'https://example.com/tech-banner.jpg',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    // Banner wrap is hidden via CSS on mobile; the heading is still visible
    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()
    await expect(page.locator('.category-banner-wrap')).toBeHidden()
  })

  test('category page applies primaryColor as CSS custom property', async ({ page }) => {
    const brandedDomain = {
      ...makeTechDomain(),
      primaryColor: '#c0ffee',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()
    const colorValue = await page
      .locator('.category-hero')
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue('--category-color'))
    expect(colorValue).toBe('#c0ffee')
  })

  test('category page renders all branding fields together', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const brandedDomain = {
      ...makeTechDomain(),
      description: 'Cutting-edge technology events curated for developers.',
      logoUrl: 'https://example.com/tech-logo.png',
      bannerUrl: 'https://example.com/tech-banner.jpg',
      primaryColor: '#137fec',
    }
    setupMockApi(page, {
      domains: [brandedDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()
    await expect(page.getByText('Cutting-edge technology events curated for developers.')).toBeVisible()
    await expect(page.locator('.category-logo')).toBeVisible()
    await expect(page.locator('.category-banner')).toBeVisible()
  })

  test('category page with no branding assets still renders correctly', async ({ page }) => {
    const unbranded = {
      ...makeTechDomain(),
      logoUrl: null,
      bannerUrl: null,
      primaryColor: null,
      accentColor: null,
    }
    setupMockApi(page, {
      domains: [unbranded],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'Technology Events' })).toBeVisible()
    await expect(page.locator('.category-logo')).toBeHidden()
    await expect(page.locator('.category-banner-wrap')).toBeHidden()
  })
})

// ---------------------------------------------------------------------------
// Curator-managed hub overview modules
// ---------------------------------------------------------------------------

test.describe('Hub overview modules', () => {
  test('shows About this hub section when overviewContent is set', async ({ page }) => {
    const hubDomain = {
      ...makeTechDomain(),
      overviewContent: 'A curated community for developer-focused technology events.',
    }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'About this hub' })).toBeVisible()
    await expect(page.getByText('A curated community for developer-focused technology events.')).toBeVisible()
  })

  test('shows What belongs here section when whatBelongsHere is set', async ({ page }) => {
    const hubDomain = {
      ...makeTechDomain(),
      whatBelongsHere: 'Developer meetups, hackathons, and engineering conferences.',
    }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'What belongs here' })).toBeVisible()
    await expect(page.getByText('Developer meetups, hackathons, and engineering conferences.')).toBeVisible()
  })

  test('shows both overview modules together when both fields are set', async ({ page }) => {
    const hubDomain = {
      ...makeTechDomain(),
      overviewContent: 'About this technology hub.',
      whatBelongsHere: 'Tech talks and workshops.',
    }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'About this hub' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What belongs here' })).toBeVisible()
    await expect(page.locator('.hub-overview-modules')).toBeVisible()
  })

  test('hides hub overview modules when neither field is set', async ({ page }) => {
    const hubDomain = makeTechDomain() // no overviewContent or whatBelongsHere
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.hub-overview-modules')).toBeHidden()
  })

  test('shows curator credit trust cue when curatorCredit is set', async ({ page }) => {
    const hubDomain = {
      ...makeTechDomain(),
      curatorCredit: 'Prague Tech Community',
    }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.curator-credit')).toBeVisible()
    await expect(page.locator('.curator-credit')).toContainText('Prague Tech Community')
  })

  test('does not show curator credit when curatorCredit is null', async ({ page }) => {
    const hubDomain = { ...makeTechDomain(), curatorCredit: null }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.curator-credit')).toBeHidden()
  })

  test('shows custom submitEventCta in the organizer CTA section', async ({ page }) => {
    const hubDomain = {
      ...makeTechDomain(),
      submitEventCta: 'Running a tech talk in Prague? Submit it here!',
    }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.organizer-cta')).toBeVisible()
    await expect(page.locator('.organizer-cta-text')).toContainText('Running a tech talk in Prague? Submit it here!')
  })

  test('shows default organizer CTA when submitEventCta is null', async ({ page }) => {
    const hubDomain = { ...makeTechDomain(), submitEventCta: null }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.locator('.organizer-cta')).toBeVisible()
    await expect(page.locator('.organizer-cta-text')).toContainText('Technology')
  })

  test('organizer CTA Submit an Event link navigates to submit page', async ({ page }) => {
    const hubDomain = makeTechDomain()
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    const ctaLink = page.getByRole('link', { name: 'Submit an Event' })
    await expect(ctaLink).toBeVisible()
    await ctaLink.click()
    await expect(page).toHaveURL(/\/submit/)
  })

  test('empty state hub message differs from filter-specific empty message', async ({ page }) => {
    const aiDomain = {
      id: 'dom-ai',
      name: 'AI',
      slug: 'ai',
      subdomain: 'ai',
      description: 'AI events',
      isActive: true,
      createdAtUtc: new Date().toISOString(),
    }
    setupMockApi(page, {
      domains: [aiDomain],
      events: [],
    })
    await page.goto('/category/ai')

    // Hub-level empty state: mention of submission
    await expect(page.getByRole('heading', { name: 'No upcoming events' })).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('first')
  })

  test('hub overview modules render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const hubDomain = {
      ...makeTechDomain(),
      overviewContent: 'Mobile-visible overview content.',
      whatBelongsHere: 'Mobile-visible guidance text.',
      curatorCredit: 'Mobile Curators',
    }
    setupMockApi(page, {
      domains: [hubDomain],
      events: [makeApprovedEvent()],
    })
    await page.goto('/category/technology')

    await expect(page.getByRole('heading', { name: 'About this hub' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What belongs here' })).toBeVisible()
    await expect(page.locator('.curator-credit')).toBeVisible()
    await expect(page.locator('.organizer-cta')).toBeVisible()
  })
})

test.describe('Language filter', () => {
  test('language filter shows only events in the selected language', async ({ page }) => {
    setupMockApi(page, {
      events: [
        makeApprovedEvent({ id: 'e-en', name: 'English Event', slug: 'english-event', language: 'en' }),
        makeApprovedEvent({ id: 'e-cs', name: 'Czech Event', slug: 'czech-event', language: 'cs' }),
        makeApprovedEvent({ id: 'e-nl', name: 'No Language Event', slug: 'no-language-event', language: null }),
      ],
    })
    await page.goto('/?lang=en')

    await expect(page.locator('.event-card', { hasText: 'English Event' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Czech Event' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'No Language Event' })).toBeHidden()
  })

  test('language filter chip is restored from URL on reload', async ({ page }) => {
    setupMockApi(page, {
      events: [makeApprovedEvent({ name: 'English Event', slug: 'english-event', language: 'en' })],
    })
    await page.goto('/?lang=en')

    await expect(page.locator('.filter-chip', { hasText: 'Language: EN' })).toBeVisible()
  })

  test('removing language chip restores all events', async ({ page }) => {
    setupMockApi(page, {
      events: [
        makeApprovedEvent({ id: 'e-en', name: 'English Event', slug: 'english-event', language: 'en' }),
        makeApprovedEvent({ id: 'e-cs', name: 'Czech Event', slug: 'czech-event', language: 'cs' }),
      ],
    })
    await page.goto('/?lang=en')

    await expect(page.locator('.event-card', { hasText: 'Czech Event' })).toBeHidden()

    await page.locator('.filter-chip', { hasText: 'Language: EN' }).click()

    await expect(page.locator('.event-card', { hasText: 'English Event' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Czech Event' })).toBeVisible()
  })

  test('language filter select updates the URL query string', async ({ page }) => {
    setupMockApi(page, {
      events: [makeApprovedEvent({ name: 'Test Event', slug: 'test-event', language: 'de' })],
    })
    await page.goto('/')

    await page.getByRole('button', { name: /more filters/i }).click()
    await page.locator('#filter-language').selectOption('de')

    await expect(page).toHaveURL(/lang=de/)
  })
})

test.describe('Timezone filter', () => {
  test('timezone filter shows only events in the selected timezone', async ({ page }) => {
    setupMockApi(page, {
      events: [
        makeApprovedEvent({
          id: 'e-prague',
          name: 'Prague Event',
          slug: 'prague-event',
          timezone: 'Europe/Prague',
        }),
        makeApprovedEvent({
          id: 'e-ny',
          name: 'New York Event',
          slug: 'new-york-event',
          timezone: 'America/New_York',
        }),
        makeApprovedEvent({
          id: 'e-null',
          name: 'Legacy Event',
          slug: 'legacy-event',
          timezone: null,
        }),
      ],
    })
    await page.goto('/?tz=Europe%2FPrague')

    await expect(page.locator('.event-card', { hasText: 'Prague Event' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'New York Event' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'Legacy Event' })).toBeHidden()
  })

  test('timezone filter chip is restored from URL on reload', async ({ page }) => {
    setupMockApi(page, {
      events: [makeApprovedEvent({ name: 'Prague Event', slug: 'prague-event', timezone: 'Europe/Prague' })],
    })
    await page.goto('/?tz=Europe%2FPrague')

    await expect(page.locator('.filter-chip', { hasText: 'Timezone: Europe/Prague' })).toBeVisible()
  })

  test('removing timezone chip restores all events', async ({ page }) => {
    setupMockApi(page, {
      events: [
        makeApprovedEvent({
          id: 'e-prague',
          name: 'Prague Event',
          slug: 'prague-event',
          timezone: 'Europe/Prague',
        }),
        makeApprovedEvent({
          id: 'e-ny',
          name: 'New York Event',
          slug: 'new-york-event',
          timezone: 'America/New_York',
        }),
      ],
    })
    await page.goto('/?tz=Europe%2FPrague')

    await expect(page.locator('.event-card', { hasText: 'New York Event' })).toBeHidden()

    await page.locator('.filter-chip', { hasText: 'Timezone: Europe/Prague' }).click()

    await expect(page.locator('.event-card', { hasText: 'Prague Event' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'New York Event' })).toBeVisible()
  })

  test('timezone filter select updates the URL query string', async ({ page }) => {
    setupMockApi(page, {
      events: [makeApprovedEvent({ name: 'Prague Event', slug: 'prague-event', timezone: 'Europe/Prague' })],
    })
    await page.goto('/')

    await page.getByRole('button', { name: /more filters/i }).click()
    await page.locator('#filter-timezone').selectOption('Europe/Prague')

    await expect(page).toHaveURL(/tz=Europe\/Prague/)
  })
})

// ---------------------------------------------------------------------------
// Low-signal state
// ---------------------------------------------------------------------------

test.describe('Low-signal state', () => {
  test('shows low-signal notice when exactly one event matches', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Solo Event', slug: 'solo-event' })],
    })
    await page.goto('/')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.low-signal-notice')).toContainText('1')
    await expect(page.locator('.low-signal-notice')).toContainText('niche')
  })

  test('shows low-signal notice when two events match', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Event Alpha', slug: 'event-alpha' }),
        makeApprovedEvent({ id: 'e-2', name: 'Event Beta', slug: 'event-beta' }),
      ],
    })
    await page.goto('/')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.low-signal-notice')).toContainText('2')
    await expect(page.locator('.low-signal-notice')).toContainText('niche')
  })

  test('does not show low-signal notice when four or more events match', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-1', name: 'Event A', slug: 'event-a' }),
        makeApprovedEvent({ id: 'e-2', name: 'Event B', slug: 'event-b' }),
        makeApprovedEvent({ id: 'e-3', name: 'Event C', slug: 'event-c' }),
        makeApprovedEvent({ id: 'e-4', name: 'Event D', slug: 'event-d' }),
      ],
    })
    await page.goto('/')

    await expect(page.locator('.low-signal-notice')).toBeHidden()
  })

  test('low-signal notice is visible at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Mobile Solo', slug: 'mobile-solo' })],
    })
    await page.goto('/')

    await expect(page.locator('.low-signal-notice')).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Mobile Solo' })).toBeVisible()
  })

  test('low-signal notice is accessible: has role status', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent({ id: 'e-1', name: 'Accessible Event', slug: 'accessible-event' })],
    })
    await page.goto('/')

    // The notice has role="status" for screen reader accessibility
    const notice = page.locator('[role="status"]', { hasText: 'niche' })
    await expect(notice).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Default sort: upcoming events appear before past events
// ---------------------------------------------------------------------------

test.describe('Default sort — upcoming before past', () => {
  test('future events appear before past events in default UPCOMING sort', async ({ page }) => {
    const now = new Date()
    const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() // +7 days
    const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() // -7 days

    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-past', name: 'Past Event', slug: 'past-event', startsAtUtc: past, endsAtUtc: past }),
        makeApprovedEvent({ id: 'e-future', name: 'Future Event', slug: 'future-event', startsAtUtc: future, endsAtUtc: future }),
      ],
    })
    await page.goto('/')

    const cards = page.locator('.event-card')
    await expect(cards).toHaveCount(2)

    // Future event should appear first
    await expect(cards.first()).toContainText('Future Event')
    await expect(cards.last()).toContainText('Past Event')
  })

  test('category page: future event appears before past event in hub', async ({ page }) => {
    const now = new Date()
    const future = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString()
    const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()

    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({ id: 'e-past', name: 'Old Workshop', slug: 'old-workshop', startsAtUtc: past, endsAtUtc: past }),
        makeApprovedEvent({ id: 'e-future', name: 'Upcoming Conf', slug: 'upcoming-conf', startsAtUtc: future, endsAtUtc: future }),
      ],
    })
    await page.goto('/category/technology')

    const cards = page.locator('.event-card')
    await expect(cards.first()).toContainText('Upcoming Conf')
  })
})
