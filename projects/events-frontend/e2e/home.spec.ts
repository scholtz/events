/**
 * Home page and navigation tests.
 */
import { expect, test } from '@playwright/test'
import { makeApprovedEvent, makeTechDomain, setupMockApi } from './helpers/mock-api'

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

    // Hero stat shows count of published events
    await expect(page.getByText('Events Listed')).toBeVisible()
  })

  test('shows empty state when no published events exist', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.getByText('Try adjusting your search criteria')).toBeVisible()
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

    await page.locator('.event-card', { hasText: 'Detail Link Event' }).click()
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
  test('domain filter is populated from API', async ({ page }) => {
    setupMockApi(page, { domains: [makeTechDomain()] })
    await page.goto('/')

    const select = page.getByLabel('Domain')
    await expect(select).toBeVisible()
    await expect(select.getByRole('option', { name: 'Technology' })).toBeAttached()
  })

  test('city filter narrows results', async ({ page }) => {
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

    // Filter by non-matching city
    await page.getByLabel('City').fill('Berlin')
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

    // Filter by matching city
    await page.getByLabel('City').fill('Prague')
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

    await page.getByLabel('Search').fill('no-match-xyz')
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.locator('.event-card', { hasText: 'Clearable Event' })).toBeVisible()
  })
})
