/**
 * Event submission and event detail page tests.
 */
import { expect, test } from '@playwright/test'
import {
  loginAs,
  makeAdminUser,
  makeApprovedEvent,
  makeTechCategory,
  setupMockApi,
} from './helpers/mock-api'

test.describe('Submit event form', () => {
  test('renders all required fields', async ({ page }) => {
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/submit')

    await expect(page.getByLabel('Event Title *')).toBeVisible()
    await expect(page.getByLabel('Description *')).toBeVisible()
    await expect(page.getByLabel('Category *')).toBeVisible()
    await expect(page.getByLabel('Start Date *')).toBeVisible()
    await expect(page.getByLabel('Website / Registration URL *')).toBeVisible()
  })

  test('shows category options from API', async ({ page }) => {
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/submit')

    const select = page.getByLabel('Category *')
    await expect(select.getByRole('option', { name: 'Technology' })).toBeAttached()
  })

  test('submit button is disabled mid-submission', async ({ page }) => {
    const admin = makeAdminUser()
    const state = setupMockApi(page, { users: [admin], categories: [makeTechCategory()] })
    state.currentUserId = admin.id

    await page.goto('/submit')

    await page.getByLabel('Event Title *').fill('Async Test Event')
    await page.getByLabel('Description *').fill('Testing async disable.')
    await page.getByLabel('Category *').selectOption('technology')
    await page.getByLabel('Start Date *').fill('2026-05-01')
    await page.getByLabel('Website / Registration URL *').fill('https://example.com')

    const submitBtn = page.getByRole('button', { name: 'Submit Event' })
    await submitBtn.click()
    // After submission, success state should appear (button is replaced)
    await expect(page.getByRole('heading', { name: 'Event Submitted!' })).toBeVisible()
  })

  test('back link navigates to home', async ({ page }) => {
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/submit')

    await page.getByRole('link', { name: '← Back' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('cancel button navigates to home', async ({ page }) => {
    setupMockApi(page, { categories: [makeTechCategory()] })
    await page.goto('/submit')

    await page.getByRole('link', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('Event detail page', () => {
  test('shows event details for a known event', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-detail-1',
      title: 'Detail Page Summit',
      description: 'A great event you should attend.',
      organizer: 'Detail Organizers',
    })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [event],
    })

    await page.goto(`/event/${event.id}`)

    await expect(page.getByRole('heading', { name: 'Detail Page Summit' })).toBeVisible()
    await expect(page.getByText('Organized by Detail Organizers')).toBeVisible()
    await expect(page.getByText('A great event you should attend.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Visit Event Page/ })).toBeVisible()
  })

  test('shows "Event not found" for unknown event id', async ({ page }) => {
    setupMockApi(page)
    await page.goto('/event/nonexistent-id')

    await expect(page.getByRole('heading', { name: 'Event not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse Events' })).toBeVisible()
  })

  test('back link returns to home listing', async ({ page }) => {
    const event = makeApprovedEvent({ id: 'ev-back', title: 'Back Button Event' })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [event],
    })

    await page.goto(`/event/${event.id}`)
    await page.getByRole('link', { name: '← Back to events' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('shows location info when available', async ({ page }) => {
    const event = makeApprovedEvent({
      id: 'ev-loc',
      title: 'Location Event',
      location: {
        name: 'Grand Venue',
        address: '123 Main St, Prague',
        lat: 50.0755,
        lng: 14.4378,
      },
    })
    setupMockApi(page, {
      categories: [makeTechCategory()],
      events: [event],
    })

    await page.goto(`/event/${event.id}`)

    await expect(page.getByText('Grand Venue')).toBeVisible()
    await expect(page.getByText('123 Main St, Prague')).toBeVisible()
  })

  test('admin can reject an event from admin panel', async ({ page }) => {
    const admin = makeAdminUser()
    const event = makeApprovedEvent({ id: 'ev-reject', title: 'To Be Rejected' })
    setupMockApi(page, {
      users: [admin],
      categories: [makeTechCategory()],
      events: [event],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    const row = page.locator('tr', { hasText: 'To Be Rejected' })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Reject' }).click()
    await expect(row).toContainText('rejected')
  })

  test('admin can delete an event from admin panel', async ({ page }) => {
    const admin = makeAdminUser()
    const event = makeApprovedEvent({ id: 'ev-delete', title: 'To Be Deleted' })
    setupMockApi(page, {
      users: [admin],
      categories: [makeTechCategory()],
      events: [event],
    })
    await loginAs(page, admin)
    await page.goto('/admin')

    await expect(page.locator('tr', { hasText: 'To Be Deleted' })).toBeVisible()
    await page
      .locator('tr', { hasText: 'To Be Deleted' })
      .getByRole('button', { name: 'Delete' })
      .click()
    await expect(page.locator('tr', { hasText: 'To Be Deleted' })).toBeHidden()
  })
})
