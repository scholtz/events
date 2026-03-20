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
    await expect(page.locator('.filter-chip', { hasText: /domain/i })).toBeVisible()
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
