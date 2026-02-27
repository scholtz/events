/**
 * Home page and navigation tests.
 */
import { expect, test } from '@playwright/test'
import { makeApprovedEvent, makeTechCategory, setupMockApi } from './helpers/mock-api'

test.describe('Home page', () => {
  test('shows hero heading and submit CTA', async ({ page }) => {
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover Events')
    await expect(page.getByRole('link', { name: 'Submit an Event' }).first()).toBeVisible()
  })

  test('shows event count stat in hero', async ({ page }) => {
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [makeApprovedEvent()],
    })
    await page.goto('/')

    // Hero stat shows count of approved events
    await expect(page.getByText('Events Listed')).toBeVisible()
  })

  test('shows empty state when no approved events exist', async ({ page }) => {
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.getByText('Try adjusting your search criteria')).toBeVisible()
  })

  test('shows event cards for approved events', async ({ page }) => {
    const event = makeApprovedEvent({ title: 'Approved Summit' })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [event],
    })
    await page.goto('/')

    await expect(page.locator('.event-card', { hasText: 'Approved Summit' })).toBeVisible()
  })

  test('pending events are NOT shown in the listing', async ({ page }) => {
    const pending = makeApprovedEvent({ id: 'e-pending', title: 'Pending Summit', status: 'pending' })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [pending],
    })
    await page.goto('/')

    // Empty state should show because no approved events
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()
    await expect(page.locator('.event-card', { hasText: 'Pending Summit' })).toBeHidden()
  })

  test('event card links to detail page', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'detail-test', title: 'Detail Link Event' })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [event],
    })
    await page.goto('/')

    await page.locator('.event-card', { hasText: 'Detail Link Event' }).click()
    await expect(page).toHaveURL(/\/event\/detail-test$/)
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
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/')

    await page.getByRole('link', { name: 'Submit Event' }).click()
    await expect(page).toHaveURL(/\/submit$/)
    await expect(page.getByRole('heading', { name: 'Submit an Event' })).toBeVisible()
  })
})

test.describe('Event filters', () => {
  test('category filter is populated from API', async ({ page }) => {
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/')

    const select = page.getByLabel('Category')
    await expect(select).toBeVisible()
    await expect(select.getByRole('option', { name: 'Technology' })).toBeAttached()
  })

  test('location filter narrows results', async ({ page }) => {
    const event = makeApprovedEvent({
      title: 'Prague Summit',
      location: { name: 'Prague Congress Centre', address: 'Prague', lat: 50.0755, lng: 14.4378 },
    })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [event],
    })
    await page.goto('/')

    // Event visible before filter
    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()

    // Filter by non-matching location
    await page.getByLabel('Location').fill('Berlin')
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

    // Filter by matching location
    await page.getByLabel('Location').fill('Prague')
    await expect(page.locator('.event-card', { hasText: 'Prague Summit' })).toBeVisible()
  })

  test('date from filter excludes events before date', async ({ page }) => {
    const oldEvent = makeApprovedEvent({ id: 'old', title: 'Old Event', date: '2025-01-01' })
    const newEvent = makeApprovedEvent({ id: 'new', title: 'New Event', date: '2026-06-01' })
    setupMockApi(page, {
      categories: [makeTechCategory()],
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
    const event = makeApprovedEvent({ title: 'Clearable Event' })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [event],
    })
    await page.goto('/')

    await page.getByLabel('Search').fill('no-match-xyz')
    await expect(page.getByRole('heading', { name: 'No events found' })).toBeVisible()

    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.locator('.event-card', { hasText: 'Clearable Event' })).toBeVisible()
  })
})
