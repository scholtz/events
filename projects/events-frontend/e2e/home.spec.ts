/**
 * Home page and navigation tests.
 */
import { expect, test } from '@playwright/test'
import { makeAdminUser, makeApprovedEvent, makeTechDomain, setupMockApi } from './helpers/mock-api'

test.describe('Home page', () => {
  test('shows hero heading and submit CTA', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover Events')
    await expect(page.getByRole('link', { name: 'Submit an Event' }).first()).toBeVisible()
  })

  test('shows event count stat in hero', async ({ page }) => {
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/')

    // Hero stat shows count of matching published events
    await expect(page.getByText('Matching Events')).toBeVisible()
  })

  test('shows empty state when no published events exist', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.getByText('No events are available yet.')).toBeVisible()
  })

  test('shows event cards for published events', async ({ page }) => {
    const event = makeApprovedEvent({ name: 'Approved Summit', slug: 'approved-summit' })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })
    await page.goto('/')

    await expect(page.locator('.event-card', { hasText: 'Approved Summit' })).toBeVisible()
  })

  test('pending events are NOT shown in the listing', async ({ page }) => {
    const pending = makeApprovedEvent({
      id: 'e-pending',
      name: 'Pending Summit',
      slug: 'pending-summit',
      status: 'PENDING_APPROVAL',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [pending],
    })
    await page.goto('/')

    // Empty state should show because no published events
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Pending Summit' })).toBeHidden()
  })

  test('event card links to detail page', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'detail-test',
      name: 'Detail Link Event',
      slug: 'detail-link-event',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })
    await page.goto('/')

    await page.locator('.event-card', { hasText: 'Detail Link Event' }).getByRole('link', { name: 'View details' }).click()
    await expect(page).toHaveURL(/\/event\/detail-link-event$/)
  })
})

test.describe('Header navigation', () => {
  test('shows Login button when logged out', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Submit Event' })).toBeVisible()
  })

  test('logo navigates to home', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/login')

    await page.getByRole('link', { name: /Events/ }).first().click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('Submit Event header link navigates to submit page', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await page.getByRole('link', { name: 'Submit Event' }).click()
    await expect(page).toHaveURL(/\/submit$/)
    await expect(page.getByRole('heading', { name: 'Submit an Event' })).toBeVisible()
  })
})

test.describe('Event filters', () => {
  test('tag filter is populated from API', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    const select = page.getByLabel('Tag')
    await expect(select).toBeVisible()
    await expect(select.getByRole('option', { name: 'Technology' })).toBeAttached()
  })

  test('location filter narrows results', async ({ page }) => {
    const event = makeApprovedEvent({
      name: 'Prague Summit',
      slug: 'prague-summit',
      venueName: 'Prague Congress Centre',
      city: 'Prague',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })
    await page.goto('/')

    // Event visible before filter
    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()

    // Expand advanced filters
    await page.getByRole('button', { name: 'More filters' }).click()

    // Filter by non-matching location
    await page.getByLabel('Location').fill('Berlin')
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

    // Filter by matching location
    await page.getByLabel('Location').fill('Prague')
    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()
  })

  test('date from filter excludes events before date', async ({ page }) => {
    const oldEvent = makeApprovedEvent({
      id: 'old',
      name: 'Old Event',
      slug: 'old-event',
      startsAtUtc: '2025-01-01T10:00:00Z',
    })
    const newEvent = makeApprovedEvent({
      id: 'new',
      name: 'New Event',
      slug: 'new-event',
      startsAtUtc: '2026-06-01T10:00:00Z',
    })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [oldEvent, newEvent],
    })
    await page.goto('/')

    await expect(page.locator('.event-card', { hasText: 'Old Event' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'New Event' })).toBeVisible()

    // Expand advanced filters
    await page.getByRole('button', { name: 'More filters' }).click()

    await page.getByLabel('From').fill('2026-01-01')
    await expect(page.locator('.event-card', { hasText: 'Old Event' })).toBeHidden()
    await expect(page.locator('.event-card', { hasText: 'New Event' })).toBeVisible()
  })

  test('clear button resets all filters', async ({ page }) => {
    const event = makeApprovedEvent({ name: 'Clearable Event', slug: 'clearable-event' })
    setupMockApi(page, {
      domains: [makeTechDomain()],
      events: [event],
    })
    await page.goto('/')

    await page.getByLabel('Keyword').fill('no-match-xyz')
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page.locator('.event-card', { hasText: 'Clearable Event' })).toBeVisible()
  })

  test('route query sync and saved searches work together', async ({ page }) => {
    const admin = makeAdminUser()
    setupMockApi(page, {
      users: [admin],
      currentUserId: admin.id,
      currentToken: `token-${admin.id}`,
      domains: [makeTechDomain()],
      events: [
        makeApprovedEvent({
          id: 'paid-prague',
          name: 'Prague Paid Summit',
          slug: 'prague-paid-summit',
          city: 'Prague',
          venueName: 'Prague Hall',
          isFree: false,
          priceAmount: 89,
        }),
        makeApprovedEvent({
          id: 'free-brno',
          name: 'Brno Free Meetup',
          slug: 'brno-free-meetup',
          city: 'Brno',
          venueName: 'Brno Hub',
          isFree: true,
          priceAmount: 0,
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

    await page.goto('/?location=Prague&price=paid&sort=newest')

    // Expand advanced filters to verify field values and interact with saved searches
    await page.getByRole('button', { name: 'More filters' }).click()

    await expect(page.getByLabel('Location')).toHaveValue('Prague')
    await expect(page.getByLabel('Price', { exact: true })).toHaveValue('PAID')
    await expect(page.getByLabel('Sort by')).toHaveValue('NEWEST')
    await expect(page.locator('.event-card', { hasText: 'Prague Paid Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Brno Free Meetup' })).toBeHidden()

    await page.getByLabel('Preset name').fill('Paid Prague')
    await page.getByRole('button', { name: 'Save current search' }).click()
    const savedSearchButton = page.locator('.saved-search-apply', { hasText: 'Paid Prague' })
    await expect(savedSearchButton).toBeVisible()

    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page.locator('.event-card', { hasText: 'Brno Free Meetup' })).toBeVisible()

    await savedSearchButton.click()
    await expect(page).toHaveURL(/location=Prague/)
    await expect(page.locator('.event-card', { hasText: 'Prague Paid Summit' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Brno Free Meetup' })).toBeHidden()
  })
})
